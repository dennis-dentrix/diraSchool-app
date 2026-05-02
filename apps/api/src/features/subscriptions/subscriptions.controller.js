import crypto from 'node:crypto';
import School from '../schools/School.model.js';
import SubscriptionPayment from './SubscriptionPayment.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendError, sendSuccess } from '../../utils/response.js';
import { env } from '../../config/env.js';
import { getRedis } from '../../config/redis.js';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCES,
  FEATURE_ADDON_PRICING,
  FEATURE_ADDONS,
  PLAN_TIERS,
  SUBSCRIPTION_STATUSES,
} from '../../constants/index.js';
import { logAction } from '../../utils/auditLogger.js';
import { initializeTransaction, verifyTransaction } from './paystack.service.js';
import { sendSubscriptionConfirmationEmail } from '../../services/email.service.js';

const BASE_FEE = 8500;
const PER_STUDENT_RATE = 40;
const VAT_RATE = 0.16;
const MULTIPLIERS = {
  'per-term': 1,
  annual: 2.55,   // 3 terms × 0.85 = 15% off
  'multi-year': 2.40, // 3 terms × 0.80 = 20% off (per year)
};

const normalizeAddOns = (addOns = {}) => ({
  [FEATURE_ADDONS.TRANSPORT]: Boolean(addOns?.[FEATURE_ADDONS.TRANSPORT]),
  [FEATURE_ADDONS.SMS]: Boolean(addOns?.[FEATURE_ADDONS.SMS]),
});

const calcAmount = ({ studentCount, billingCycle, addOns }) => {
  const normalized = normalizeAddOns(addOns);
  const addOnsPerTerm = Object.entries(normalized).reduce(
    (sum, [key, enabled]) => (enabled ? sum + (FEATURE_ADDON_PRICING[key] ?? 0) : sum),
    0
  );
  const subtotal = BASE_FEE + studentCount * PER_STUDENT_RATE + addOnsPerTerm;
  const multiplier = MULTIPLIERS[billingCycle] ?? 1;
  const exVat = Math.round(subtotal * multiplier);
  const vat = Math.round(exVat * VAT_RATE);
  return {
    addOns: normalized,
    addOnsPerTerm,
    subtotalExVat: exVat,
    vatAmount: vat,
    total: exVat + vat,
  };
};

const merchantRef = (schoolId) =>
  `DS-${schoolId.toString().slice(-6).toUpperCase()}-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const bustSchoolSubCache = async (schoolId) => {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`school:sub:${schoolId}`);
  } catch {
    // non-fatal
  }
};

const activateSchool = async (payment) => {
  const school = await School.findById(payment.schoolId);
  if (!school) return;
  school.subscriptionStatus = SUBSCRIPTION_STATUSES.ACTIVE;
  school.planTier = payment.selectedPlanTier || PLAN_TIERS.STANDARD;
  school.trialExpiry = undefined;
  await school.save();
  await bustSchoolSubCache(school._id);

  sendSubscriptionConfirmationEmail({
    to: school.email,
    schoolName: school.name,
    amount: payment.amount,
    currency: payment.currency || 'KES',
    billingCycle: payment.billingCycle,
    studentCount: payment.studentCount,
    merchantReference: payment.merchantReference,
    paidAt: payment.paidAt || new Date(),
    meta: { schoolId: school._id },
  }).catch(() => {}); // fire-and-forget, non-fatal
};

/**
 * POST /api/v1/subscriptions/paystack/checkout
 */
export const createPaystackCheckout = asyncHandler(async (req, res) => {
  if (!env.PAYSTACK_ENABLED) {
    return sendError(res, 'Paystack is not enabled in this environment.', 400);
  }

  const school = await School.findById(req.user.schoolId);
  if (!school) return sendError(res, 'School not found.', 404);

  const { studentCount, billingCycle, planTier, description, addOns } = req.body;
  const amounts = calcAmount({ studentCount, billingCycle, addOns });
  const reference = merchantRef(school._id);

  const callbackUrl = `${env.CLIENT_URL.replace(/\/+$/, '')}/billing?reference=${reference}`;

  const payment = await SubscriptionPayment.create({
    schoolId: school._id,
    initiatedByUserId: req.user._id,
    merchantReference: reference,
    status: 'pending',
    billingCycle,
    studentCount,
    addOns: amounts.addOns,
    addOnsPerTerm: amounts.addOnsPerTerm,
    amount: amounts.total,
    subtotalExVat: amounts.subtotalExVat,
    vatAmount: amounts.vatAmount,
    currency: 'KES',
    selectedPlanTier: planTier || school.planTier || PLAN_TIERS.STANDARD,
    description: description || `DiraSchool subscription (${billingCycle})`,
  });

  try {
    const result = await initializeTransaction({
      email: school.email,
      amount: payment.amount,
      reference,
      callbackUrl,
      metadata: {
        schoolId: String(school._id),
        schoolName: school.name,
        billingCycle,
        studentCount,
      },
    });

    payment.checkoutUrl = result.authorization_url;
    payment.status = 'processing';
    payment.paystackRawResponse = result;
    await payment.save();

    logAction(req, {
      action: AUDIT_ACTIONS.CREATE,
      resource: AUDIT_RESOURCES.PAYMENT,
      resourceId: payment._id,
      meta: {
        provider: 'paystack',
        merchantReference: reference,
        amount: payment.amount,
        addOns: payment.addOns,
      },
    });

    return sendSuccess(res, {
      checkout: {
        provider: 'paystack',
        merchantReference: reference,
        amount: payment.amount,
        currency: payment.currency,
        addOns: payment.addOns,
        addOnsPerTerm: payment.addOnsPerTerm,
        redirectUrl: result.authorization_url,
        accessCode: result.access_code,
      },
    });
  } catch (err) {
    payment.status = 'failed';
    payment.paystackRawResponse = { error: err.message, payload: err.payload ?? null };
    await payment.save();
    return sendError(res, `Unable to initialize Paystack checkout: ${err.message}`, 502);
  }
});

/**
 * GET /api/v1/subscriptions/paystack/status/:merchantReference
 * Verifies the transaction with Paystack and syncs the payment record.
 */
export const getPaystackStatus = asyncHandler(async (req, res) => {
  const payment = await SubscriptionPayment.findOne({
    schoolId: req.user.schoolId,
    merchantReference: req.params.merchantReference,
  });
  if (!payment) return sendError(res, 'Subscription payment not found.', 404);

  if (payment.status !== 'completed') {
    try {
      const result = await verifyTransaction(payment.merchantReference);
      payment.paystackRawResponse = result;

      const paystackStatus = result?.status;
      if (paystackStatus === 'success') {
        payment.status = 'completed';
        if (!payment.paidAt) payment.paidAt = new Date();
        await payment.save();
        await activateSchool(payment);
      } else if (['failed', 'abandoned'].includes(paystackStatus)) {
        payment.status = 'failed';
        await payment.save();
      } else {
        await payment.save();
      }
    } catch {
      // Paystack verify failed — return current DB state
    }
  }

  const school = await School.findById(req.user.schoolId).select(
    'subscriptionStatus planTier trialExpiry name'
  );

  return sendSuccess(res, {
    payment: {
      _id: payment._id,
      merchantReference: payment.merchantReference,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      billingCycle: payment.billingCycle,
      studentCount: payment.studentCount,
      addOns: payment.addOns,
      addOnsPerTerm: payment.addOnsPerTerm,
      checkoutUrl: payment.checkoutUrl,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    },
    school,
  });
});

/**
 * GET /api/v1/subscriptions/payments
 * Returns paginated subscription payment history for the school.
 */
export const listPayments = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const skip = (page - 1) * limit;

  const [payments, total] = await Promise.all([
    SubscriptionPayment.find({ schoolId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-paystackRawResponse')
      .populate('initiatedByUserId', 'firstName lastName'),
    SubscriptionPayment.countDocuments({ schoolId }),
  ]);

  return sendSuccess(res, {
    payments,
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

/**
 * POST /api/v1/subscriptions/paystack/webhook
 * Public route — verified via HMAC-SHA512 signature.
 */
export const paystackWebhook = asyncHandler(async (req, res) => {
  // Verify signature
  const signature = req.headers['x-paystack-signature'];
  const hash = crypto
    .createHmac('sha512', env.PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== hash) {
    return res.status(401).end();
  }

  const { event, data } = req.body;

  // Acknowledge immediately — Paystack expects a 200 fast
  res.status(200).end();

  if (event !== 'charge.success') return;

  const reference = data?.reference;
  if (!reference) return;

  const payment = await SubscriptionPayment.findOne({ merchantReference: reference });
  if (!payment || payment.status === 'completed') return;

  payment.status = 'completed';
  payment.paidAt = new Date();
  payment.paystackRawResponse = data;
  await payment.save();

  await activateSchool(payment);
});
