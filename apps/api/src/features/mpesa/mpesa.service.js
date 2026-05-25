import School from '../schools/School.model.js';
import Student from '../students/Student.model.js';
import Payment from '../fees/Payment.model.js';
import PaymentNotification from '../fees/PaymentNotification.model.js';
import FeeStructure from '../fees/FeeStructure.model.js';
import SchoolSettings from '../settings/SchoolSettings.model.js';
import { receiptQueue } from '../../jobs/queues.js';
import { emitToSchool } from '../../config/socket.js';
import { getRedis } from '../../config/redis.js';
import { env } from '../../config/env.js';
import logger from '../../config/logger.js';
import {
  JOB_NAMES,
  PAYMENT_METHODS,
  PAYMENT_SMS_PROVIDERS,
  PAYMENT_SOURCE,
  PAYMENT_STATUSES,
  STUDENT_STATUSES,
} from '../../constants/index.js';
import { normalisePhone } from '../../utils/phone.js';

export const MPESA_NOTIFICATION_SOURCE = 'daraja_c2b';

const tokenCacheKey = () => `mpesa:token:${env.MPESA_ENV}:${env.MPESA_CONSUMER_KEY ?? 'default'}`;

export const parseTransTime = (transTime) => {
  const str = String(transTime ?? '').trim();
  if (!/^\d{14}$/.test(str)) return new Date();
  return new Date(
    `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}` +
    `T${str.slice(8, 10)}:${str.slice(10, 12)}:${str.slice(12, 14)}`
  );
};


const requireDarajaConfig = () => {
  const missing = [
    ['MPESA_CONSUMER_KEY', env.MPESA_CONSUMER_KEY],
    ['MPESA_CONSUMER_SECRET', env.MPESA_CONSUMER_SECRET],
    ['MPESA_BASE_URL', env.MPESA_BASE_URL],
    ['MPESA_CALLBACK_BASE_URL', env.MPESA_CALLBACK_BASE_URL],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(`Missing Daraja configuration: ${missing.join(', ')}`);
  }
};

export const getMpesaToken = async () => {
  requireDarajaConfig();

  let redis = null;
  try { redis = getRedis(); } catch { redis = null; }

  const key = tokenCacheKey();
  if (redis) {
    const cached = await redis.get(key);
    if (cached) return cached;
  }

  const credentials = Buffer.from(
    `${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  const response = await fetch(
    `${env.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } }
  );

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.errorMessage ?? data.ResponseDescription ?? 'Failed to generate M-Pesa access token');
  }

  if (redis) await redis.set(key, data.access_token, 'EX', 3500);
  return data.access_token;
};

export const registerC2BUrls = async (paybill) => {
  requireDarajaConfig();
  const token = await getMpesaToken();
  const response = await fetch(`${env.MPESA_BASE_URL}/mpesa/c2b/v1/registerurl`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ShortCode: paybill,
      ResponseType: 'Completed',
      ConfirmationURL: `${env.MPESA_CALLBACK_BASE_URL}/api/v1/mpesa/confirmation`,
      ValidationURL: `${env.MPESA_CALLBACK_BASE_URL}/api/v1/mpesa/validation`,
    }),
  });

  const data = await response.json();
  if (!response.ok || (data.ResponseCode && data.ResponseCode !== '0')) {
    const message = data.errorMessage ?? data.ResponseDescription ?? 'C2B URL registration failed';
    const err = new Error(message);
    err.providerResponse = data;
    throw err;
  }
  return data;
};

export const resolveActivePeriod = async (schoolId) => {
  const settings = await SchoolSettings.findOne({ schoolId }).lean();
  const today = new Date();
  const academicYear = settings?.currentAcademicYear ?? String(today.getFullYear());
  const terms = settings?.terms ?? [];

  const active = terms.find(
    (term) => today >= new Date(term.startDate) && today <= new Date(term.endDate)
  );
  if (active) return { academicYear, term: active.name };

  const started = terms
    .filter((term) => new Date(term.startDate) <= today)
    .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  if (started[0]) return { academicYear, term: started[0].name };

  return { academicYear, term: 'Term 1' };
};

export const computeStudentBalance = async ({ schoolId, studentId, classId, academicYear, term }) => {
  const [structure, paidAgg] = await Promise.all([
    FeeStructure.findOne({ schoolId, classId, academicYear, term }).select('totalAmount').lean(),
    Payment.aggregate([
      {
        $match: {
          schoolId,
          studentId,
          academicYear,
          term,
          status: PAYMENT_STATUSES.COMPLETED,
        },
      },
      { $group: { _id: null, totalPaid: { $sum: '$amount' } } },
    ]),
  ]);

  const expected = structure?.totalAmount ?? 0;
  const totalPaid = paidAgg[0]?.totalPaid ?? 0;
  return {
    expected,
    totalPaid,
    balance: Math.max(0, expected - totalPaid),
  };
};

export const queueReceiptPdf = async ({ paymentId, schoolId }) => {
  try {
    await receiptQueue.add(JOB_NAMES.GENERATE_PDF, {
      paymentId: String(paymentId),
      schoolId: String(schoolId),
    });
  } catch (err) {
    logger.error('[M-PESA] Failed to queue receipt PDF', { paymentId, err: err.message });
  }
};

const createDarajaNotification = async ({ school, payload, status, reason, student, payment }) => {
  try {
    return await PaymentNotification.create({
      schoolId: school._id,
      provider: PAYMENT_SMS_PROVIDERS.MPESA,
      status,
      source: MPESA_NOTIFICATION_SOURCE,
      from: payload.MSISDN,
      to: payload.BusinessShortCode,
      rawText: JSON.stringify(payload),
      amount: Number(payload.TransAmount),
      senderPhone: normalisePhone(payload.MSISDN),
      payerName: [payload.FirstName, payload.MiddleName, payload.LastName].filter(Boolean).join(' ').trim(),
      transactionId: payload.TransID,
      accountReference: String(payload.BillRefNumber ?? '').trim().toUpperCase(),
      matchedStudentId: student?._id,
      paymentId: payment?._id,
      reason,
      parsedAt: parseTransTime(payload.TransTime),
    });
  } catch (err) {
    if (err?.code !== 11000) {
      logger.error('[M-PESA] Failed to save callback notification', {
        schoolId: school._id,
        transactionId: payload.TransID,
        err: err.message,
      });
    }
    return null;
  }
};

export const createPaymentForStudent = async ({
  school,
  student,
  amount,
  reference,
  accountReference,
  payerPhone,
  payerName,
  paymentDate,
  notes,
  source = PAYMENT_SOURCE.MPESA_C2B,
  recordedByUserId,
}) => {
  const { academicYear, term } = await resolveActivePeriod(school._id);

  const payment = await Payment.create({
    schoolId: school._id,
    studentId: student._id,
    classId: student.classId,
    academicYear,
    term,
    amount,
    method: PAYMENT_METHODS.MPESA,
    reference,
    source,
    payerPhone: normalisePhone(payerPhone),
    payerName,
    accountReference: accountReference ? String(accountReference).trim().toUpperCase() : undefined,
    paymentDate,
    status: PAYMENT_STATUSES.COMPLETED,
    notes,
    recordedByUserId,
  });

  await queueReceiptPdf({ paymentId: payment._id, schoolId: school._id });
  const balance = await computeStudentBalance({
    schoolId: school._id,
    studentId: student._id,
    classId: student.classId,
    academicYear,
    term,
  });

  return { payment, balance, academicYear, term };
};

export const emitPaymentUpdates = async ({ school, student, payment, balance }) => {
  emitToSchool(String(school._id), 'payment_received', {
    student_id: String(student._id),
    student_name: `${student.firstName} ${student.lastName}`,
    admission_number: student.admissionNumber,
    amount: payment.amount,
    mpesa_code: payment.reference,
    parent_name: payment.payerName,
    new_balance: balance.balance,
    timestamp: payment.paymentDate ?? new Date(),
  });

  const summary = await getFinanceSummary(school._id);
  emitToSchool(String(school._id), 'finance_summary_update', summary);
};

export const processConfirmationPayload = async (payload) => {
  const transactionId = String(payload?.TransID ?? '').trim().toUpperCase();
  const paybill = String(payload?.BusinessShortCode ?? '').trim();
  const accountRef = String(payload?.BillRefNumber ?? '').trim();
  const amount = Number(payload?.TransAmount);

  if (!transactionId || !paybill || !Number.isFinite(amount) || amount <= 0) {
    logger.warn('[M-PESA] Ignoring malformed confirmation payload', { transactionId, paybill, amount });
    return;
  }

  const existing = await Payment.findOne({
    source: PAYMENT_SOURCE.MPESA_C2B,
    reference: transactionId,
  }).select('_id');
  if (existing) {
    logger.info('[M-PESA] Duplicate C2B callback skipped', { transactionId, paymentId: existing._id });
    return;
  }

  const school = await School.findOne({
    'mpesa.paybill': paybill,
    'mpesa.active': true,
  }).select('_id name mpesa').lean();

  if (!school) {
    logger.warn('[M-PESA] C2B callback for unknown or inactive Paybill', {
      paybill,
      transactionId,
      amount,
    });
    return;
  }

  const existingSchoolPayment = await Payment.findOne({
    schoolId: school._id,
    reference: transactionId,
  }).select('_id source');
  if (existingSchoolPayment) {
    await createDarajaNotification({
      school,
      payload,
      status: 'duplicate',
      reason: 'Transaction reference already exists as a payment',
      payment: existingSchoolPayment,
    });
    logger.info('[M-PESA] Duplicate C2B callback skipped for existing payment', {
      transactionId,
      paymentId: existingSchoolPayment._id,
      source: existingSchoolPayment.source,
    });
    return;
  }

  const student = accountRef
    ? await Student.findOne({
        schoolId: school._id,
        status: STUDENT_STATUSES.ACTIVE,
        admissionNumber: { $regex: new RegExp(`^${String(accountRef).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      }).select('_id classId firstName lastName admissionNumber').lean()
    : null;

  if (!student) {
    const notification = await createDarajaNotification({
      school,
      payload,
      status: 'unmatched',
      reason: 'Admission number did not match an active student',
    });
    if (!notification) return;

    emitToSchool(String(school._id), 'unallocated_payment', {
      amount,
      account_ref: accountRef,
      mpesa_code: transactionId,
      parent_name: [payload.FirstName, payload.MiddleName, payload.LastName].filter(Boolean).join(' ').trim(),
    });
    return;
  }

  let payment;
  let balance;
  try {
    ({ payment, balance } = await createPaymentForStudent({
      school,
      student,
      amount,
      reference: transactionId,
      accountReference: accountRef,
      payerPhone: payload.MSISDN,
      payerName: [payload.FirstName, payload.MiddleName, payload.LastName].filter(Boolean).join(' ').trim(),
      paymentDate: parseTransTime(payload.TransTime),
      notes: 'Auto-recorded from Safaricom Daraja C2B callback',
    }));
  } catch (err) {
    if (err?.code === 11000) {
      logger.info('[M-PESA] Duplicate C2B callback skipped after race', { transactionId });
      return;
    }
    throw err;
  }

  await createDarajaNotification({
    school,
    payload,
    status: 'matched',
    reason: 'Matched by admission number',
    student,
    payment,
  });

  await emitPaymentUpdates({ school, student, payment, balance });

  logger.info('[M-PESA] C2B payment recorded', {
    paymentId: payment._id,
    schoolId: school._id,
    studentId: student._id,
    amount,
    transactionId,
  });
};

export const getFinanceSummary = async (schoolId) => {
  const { academicYear, term } = await resolveActivePeriod(schoolId);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const [totals, unallocatedCount, feeStructures, students, paidByStudent] = await Promise.all([
    Payment.aggregate([
      { $match: { schoolId, status: PAYMENT_STATUSES.COMPLETED } },
      {
        $facet: {
          today: [
            { $match: { paymentDate: { $gte: todayStart } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ],
          term: [
            { $match: { academicYear, term } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ],
        },
      },
    ]),
    PaymentNotification.countDocuments({
      schoolId,
      source: MPESA_NOTIFICATION_SOURCE,
      status: { $in: ['unmatched', 'ambiguous', 'parse_failed'] },
    }),
    FeeStructure.find({ schoolId, academicYear, term }).select('classId totalAmount').lean(),
    Student.find({ schoolId, status: STUDENT_STATUSES.ACTIVE }).select('_id classId').lean(),
    Payment.aggregate([
      { $match: { schoolId, academicYear, term, status: PAYMENT_STATUSES.COMPLETED } },
      { $group: { _id: '$studentId', total: { $sum: '$amount' } } },
    ]),
  ]);

  const targetByClass = Object.fromEntries(
    feeStructures.map((structure) => [String(structure.classId), structure.totalAmount])
  );
  const paidMap = Object.fromEntries(paidByStudent.map((row) => [String(row._id), row.total]));
  let target = 0;
  let defaultersCount = 0;
  for (const student of students) {
    const expected = targetByClass[String(student.classId)] ?? 0;
    if (!expected) continue;
    target += expected;
    if ((paidMap[String(student._id)] ?? 0) < expected) defaultersCount += 1;
  }

  const payload = totals[0] ?? {};
  const todaysTotal = payload.today?.[0]?.total ?? 0;
  const termTotal = payload.term?.[0]?.total ?? 0;

  return {
    todays_total: todaysTotal,
    term_total: termTotal,
    unallocated_count: unallocatedCount,
    defaulters_count: defaultersCount,
    collection_percentage: target > 0 ? Math.min(100, Math.round((termTotal / target) * 100)) : 0,
    academic_year: academicYear,
    term,
  };
};
