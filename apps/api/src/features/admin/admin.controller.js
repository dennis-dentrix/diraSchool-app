/**
 * Super-admin controllers — platform-wide visibility.
 *
 * All routes here require the `superadminOnly` middleware.
 *
 * Endpoints:
 *   GET  /api/v1/admin/stats                 — platform KPIs
 *   GET  /api/v1/admin/schools               — paginated school list with filters
 *   GET  /api/v1/admin/schools/:id           — single school detail
 *   PATCH /api/v1/admin/schools/:id/status   — update subscription status / plan tier
 *   GET  /api/v1/admin/users                 — platform-wide user list
 *   PATCH /api/v1/admin/users/:id/toggle     — toggle user isActive
 */
import School         from '../schools/School.model.js';
import SchoolGroup    from './SchoolGroup.model.js';
import SystemSettings from './SystemSettings.model.js';
import User        from '../users/User.model.js';
import Student     from '../students/Student.model.js';
import ClassModel  from '../classes/Class.model.js';
import AuditLog    from '../audit/AuditLog.model.js';
import SmsDelivery from '../sms/SmsDelivery.model.js';
import SmsLog      from '../sms/SmsLog.model.js';
import SubscriptionPayment from '../subscriptions/SubscriptionPayment.model.js';
import PlatformExpense from './PlatformExpense.model.js';
import PlatformTaxRecord, { PLATFORM_TAX_TYPES } from './PlatformTaxRecord.model.js';
import Attendance  from '../attendance/Attendance.model.js';
import Exam        from '../exams/Exam.model.js';
import Result      from '../results/Result.model.js';
import ReportCard  from '../report-cards/ReportCard.model.js';
import FeeStructure from '../fees/FeeStructure.model.js';
import Payment     from '../fees/Payment.model.js';
import PaymentNotification from '../fees/PaymentNotification.model.js';
import SchoolSettings from '../settings/SchoolSettings.model.js';
import TransportRoute from '../transport/TransportRoute.model.js';
import Visitor     from '../visitors/Visitor.model.js';
import LessonPlan  from '../lesson-plans/LessonPlan.model.js';
import Book        from '../library/Book.model.js';
import BookLoan    from '../library/BookLoan.model.js';
import Subject     from '../subjects/Subject.model.js';
import Department  from '../subjects/Department.model.js';
import Timetable   from '../timetable/Timetable.model.js';
import CheckIn     from '../checkins/CheckIn.model.js';
import PayrollRun  from '../payroll/PayrollRun.model.js';
import SalaryGrade from '../payroll/SalaryGrade.model.js';
import Leave       from '../leave/Leave.model.js';
import Notification from '../notifications/Notification.model.js';
import SystemEvent from './SystemEvent.model.js';
import SchoolInquiry from '../contact/SchoolInquiry.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCES,
  SUBSCRIPTION_STATUSES,
  PLAN_TIERS,
  ROLES,
  SMS_DELIVERY_STATUS,
} from '../../constants/index.js';
import { env } from '../../config/env.js';
import { captureError, sentryEnabled } from '../../config/sentry.js';
import { getRedis } from '../../config/redis.js';
import {
  sendSchoolDeactivationReviewedEmail,
  sendSenderIdReviewedEmail,
} from '../../services/email.service.js';
import { queueEmailWithDirectFallback } from '../../utils/emailJobs.js';
import { notifyUser } from '../../utils/notify.js';
import { emitToUser } from '../../config/socket.js';
import { JOB_NAMES } from '../../constants/index.js';
import { logAction } from '../../utils/auditLogger.js';
import { getCurrentTermAndYear } from '../../utils/term.js';
import { searchRegex } from '../../utils/search.js';
import {
  DEFAULT_BASE_FEE,
  DEFAULT_CORPORATE_TAX_RATE,
  DEFAULT_PER_STUDENT_RATE,
  DEFAULT_VAT_RATE,
} from '../subscriptions/pricing.js';

const COMPUTED_TAX_TYPES = new Set(['vat', 'corporation_tax']);
const INCOME_TAX_CREDIT_TYPES = new Set(['corporation_tax', 'installment_tax', 'withholding_tax']);
const MARGIN_AFFECTING_TAX_TYPES = new Set([
  'affordable_housing_levy',
  'nssf',
  'fringe_benefit_tax',
  'advance_tax',
  'excise_duty',
  'digital_service_tax',
  'other',
]);

const TAX_LABELS = {
  vat: 'VAT',
  corporation_tax: 'Corporation tax',
  installment_tax: 'Installment tax',
  paye: 'PAYE',
  withholding_tax: 'Withholding tax',
  withholding_vat: 'Withholding VAT',
  affordable_housing_levy: 'Affordable Housing Levy',
  nssf: 'NSSF',
  shif: 'SHIF',
  fringe_benefit_tax: 'Fringe benefit tax',
  advance_tax: 'Advance tax',
  excise_duty: 'Excise duty',
  digital_service_tax: 'Digital service tax',
  other: 'Other tax',
};

const PAYMENT_CYCLE_MONTHS = {
  'per-term': 4,
  annual: 12,
  'multi-year': 36,
};

const bustSchoolSubCache = async (schoolId) => {
  try {
    const redis = getRedis();
    if (!redis) return;
    await redis.del(`school:sub:${schoolId}`);
    await redis.del(`school:info:${schoolId}`);
  } catch {
    // non-fatal
  }
};

const normalisePricingAgreement = (body, userId) => {
  const enabled = Boolean(body.enabled);
  const baseFee = body.baseFee === undefined || body.baseFee === ''
    ? DEFAULT_BASE_FEE
    : Number(body.baseFee);
  const perStudentRate = body.perStudentRate === undefined || body.perStudentRate === ''
    ? DEFAULT_PER_STUDENT_RATE
    : Number(body.perStudentRate);

  if (!Number.isFinite(baseFee) || baseFee < 0) {
    return { error: 'Base fee must be a non-negative number.' };
  }
  if (!Number.isFinite(perStudentRate) || perStudentRate < 0) {
    return { error: 'Per-student rate must be a non-negative number.' };
  }

  const startsAt = body.startsAt ? new Date(body.startsAt) : undefined;
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;

  if (startsAt && Number.isNaN(startsAt.getTime())) {
    return { error: 'Invalid pricing agreement start date.' };
  }
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return { error: 'Invalid pricing agreement expiry date.' };
  }
  if (startsAt && expiresAt && startsAt > expiresAt) {
    return { error: 'Pricing agreement start date cannot be after expiry date.' };
  }

  return {
    agreement: {
      enabled,
      baseFee,
      perStudentRate,
      currency: (body.currency || 'KES').toUpperCase(),
      agreementReference: body.agreementReference?.trim() || undefined,
      notes: body.notes?.trim() || undefined,
      startsAt,
      expiresAt,
      updatedBy: userId,
      updatedAt: new Date(),
    },
  };
};

const dateRangeFilter = (field, query) => {
  const range = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) range.$lte = new Date(query.to);
  return Object.keys(range).length ? { [field]: range } : {};
};

const estimateNextPaymentDate = (payment) => {
  if (payment.paymentType && payment.paymentType !== 'subscription') return null;
  const baseDate = payment.paidAt || payment.invoiceSnapshot?.paidAt || payment.createdAt;
  if (!baseDate) return null;

  const next = new Date(baseDate);
  const months = PAYMENT_CYCLE_MONTHS[payment.billingCycle] ?? PAYMENT_CYCLE_MONTHS['per-term'];
  next.setMonth(next.getMonth() + months);
  return next;
};

const parseOptionalDate = (value, fallback) => {
  if (value === undefined) return fallback;
  if (value === '' || value === null) return undefined;
  return new Date(value);
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1';
  return Boolean(value);
};

const parseExpensePayload = (body, userId, existing = {}) => {
  const title = body.title === undefined ? existing.title : body.title?.trim();
  const amount = body.amount === undefined || body.amount === ''
    ? existing.amount
    : Number(body.amount);
  const vatAmount = body.vatAmount === undefined || body.vatAmount === ''
    ? existing.vatAmount ?? 0
    : Number(body.vatAmount);
  const paymentDate = body.paymentDate ? new Date(body.paymentDate) : existing.paymentDate ?? new Date();

  if (!title) return { error: 'Expense title is required.' };
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Expense amount must be a non-negative number.' };
  if (!Number.isFinite(vatAmount) || vatAmount < 0) return { error: 'Expense VAT amount must be a non-negative number.' };
  if (vatAmount > amount) return { error: 'Expense VAT amount cannot exceed the expense total.' };
  if (Number.isNaN(paymentDate.getTime())) return { error: 'Invalid expense payment date.' };

  return {
    expense: {
      title,
      amount,
      vatAmount,
      paymentDate,
      category: body.category || existing.category || 'other',
      vendor: body.vendor?.trim() || undefined,
      currency: (body.currency || existing.currency || 'KES').toUpperCase(),
      status: body.status || existing.status || 'paid',
      paymentMethod: body.paymentMethod?.trim() || undefined,
      reference: body.reference?.trim() || undefined,
      receiptUrl: body.receiptUrl?.trim() || undefined,
      notes: body.notes?.trim() || undefined,
      recordedByUserId: existing.recordedByUserId || userId,
    },
  };
};

const parseTaxRecordPayload = (body, userId, existing = {}) => {
  const title = body.title === undefined ? existing.title : body.title?.trim();
  const taxType = body.taxType || existing.taxType;
  const treatment = body.treatment || existing.treatment || 'payable';
  const amountDue = body.amountDue === undefined || body.amountDue === ''
    ? existing.amountDue
    : Number(body.amountDue);
  const amountPaid = body.amountPaid === undefined || body.amountPaid === ''
    ? existing.amountPaid ?? 0
    : Number(body.amountPaid);
  const periodStart = parseOptionalDate(body.periodStart, existing.periodStart);
  const periodEnd = parseOptionalDate(body.periodEnd, existing.periodEnd);
  const dueDate = parseOptionalDate(body.dueDate, existing.dueDate);
  const paymentDate = parseOptionalDate(body.paymentDate, existing.paymentDate);
  const affectsMarginInput = parseBoolean(
    body.affectsMargin,
    existing.affectsMargin ?? MARGIN_AFFECTING_TAX_TYPES.has(taxType)
  );
  const affectsMargin = treatment === 'credit' ? false : affectsMarginInput;

  if (!title) return { error: 'Tax record title is required.' };
  if (!PLATFORM_TAX_TYPES.includes(taxType)) return { error: 'Invalid tax type.' };
  if (!['payable', 'credit'].includes(treatment)) return { error: 'Invalid tax treatment.' };
  if (body.status && !['pending', 'paid', 'overdue', 'cancelled'].includes(body.status)) return { error: 'Invalid tax status.' };
  if (!Number.isFinite(amountDue) || amountDue < 0) return { error: 'Tax amount due must be a non-negative number.' };
  if (!Number.isFinite(amountPaid) || amountPaid < 0) return { error: 'Tax amount paid must be a non-negative number.' };
  if (amountPaid > amountDue) return { error: 'Tax amount paid cannot exceed the amount due.' };
  if (periodStart && Number.isNaN(periodStart.getTime())) return { error: 'Invalid tax period start date.' };
  if (periodEnd && Number.isNaN(periodEnd.getTime())) return { error: 'Invalid tax period end date.' };
  if (dueDate && Number.isNaN(dueDate.getTime())) return { error: 'Invalid tax due date.' };
  if (paymentDate && Number.isNaN(paymentDate.getTime())) return { error: 'Invalid tax payment date.' };
  if (periodStart && periodEnd && periodStart > periodEnd) return { error: 'Tax period start date cannot be after end date.' };

  return {
    taxRecord: {
      title,
      taxType,
      treatment,
      periodStart,
      periodEnd,
      dueDate,
      amountDue,
      amountPaid,
      affectsMargin,
      currency: (body.currency || existing.currency || 'KES').toUpperCase(),
      status: body.status || existing.status || (amountPaid >= amountDue ? 'paid' : 'pending'),
      paymentDate,
      reference: body.reference?.trim() || undefined,
      attachmentUrl: body.attachmentUrl?.trim() || undefined,
      notes: body.notes?.trim() || undefined,
      recordedByUserId: existing.recordedByUserId || userId,
    },
  };
};

// ── GET /api/v1/admin/stats ──────────────────────────────────────────────────

/**
 * Platform-wide KPIs for the super-admin dashboard.
 *
 * Returns:
 *   - schools: total + breakdown by subscriptionStatus
 *   - recentSignups: schools registered in the last 30 days
 *   - users: total + breakdown by role
 *   - topCounties: top-5 counties by school count
 */
export const getStats = asyncHandler(async (req, res) => {
  const now    = new Date();
  const ago30d = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const ago7d  = new Date(now - 7  * 24 * 60 * 60 * 1000);
  const ago24h = new Date(now - 24 * 60 * 60 * 1000);

  const [
    schoolsByStatus,
    recentSignups,
    usersByRole,
    topCounties,
    totalStudents,
    totalClasses,
    auditActions7d,
    logins24h,
  ] = await Promise.all([
    School.aggregate([
      { $group: { _id: '$subscriptionStatus', count: { $sum: 1 } } },
      { $sort:  { count: -1 } },
    ]),
    School.countDocuments({ createdAt: { $gte: ago30d } }),
    User.aggregate([
      { $match: { role: { $ne: ROLES.SUPERADMIN } } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort:  { count: -1 } },
    ]),
    School.aggregate([
      { $match:  { county: { $exists: true, $nin: [null, ''] } } },
      { $group:  { _id: '$county', count: { $sum: 1 } } },
      { $sort:   { count: -1 } },
      { $limit:  5 },
      { $project: { county: '$_id', count: 1, _id: 0 } },
    ]),
    Student.countDocuments(),
    ClassModel.countDocuments(),
    AuditLog.countDocuments({ createdAt: { $gte: ago7d } }),
    AuditLog.countDocuments({ action: 'login', createdAt: { $gte: ago24h } }),
  ]);

  const statusMap    = schoolsByStatus.reduce((acc, { _id, count }) => { acc[_id] = count; return acc; }, {});
  const totalSchools = schoolsByStatus.reduce((sum, { count }) => sum + count, 0);

  return sendSuccess(res, {
    schools: {
      total:        totalSchools,
      byStatus:     statusMap,
      recentSignups,
    },
    users: {
      byRole: usersByRole.reduce((acc, { _id, count }) => { acc[_id] = count; return acc; }, {}),
    },
    topCounties,
    students: { total: totalStudents },
    classes:  { total: totalClasses },
    activity: {
      auditActions7d,
      logins24h,
    },
  });
});

// ── GET /api/v1/admin/schools ────────────────────────────────────────────────

/**
 * Paginated, filterable list of all schools on the platform.
 *
 * Query params:
 *   status   — filter by subscriptionStatus (trial|active|suspended|expired)
 *   plan     — filter by planTier (trial|starter|growth|professional)
 *   county   — exact match (case-insensitive)
 *   search   — partial match on school name or email
 *   page, limit
 */
export const listSchools = asyncHandler(async (req, res) => {
  const { status, plan, county, search, active } = req.query;

  const filter = {};

  if (active !== undefined) {
    filter.isActive = active !== 'false';
  }

  if (status) {
    if (!Object.values(SUBSCRIPTION_STATUSES).includes(status)) {
      return sendError(res, `Invalid status. Must be one of: ${Object.values(SUBSCRIPTION_STATUSES).join(', ')}`, 400);
    }
    filter.subscriptionStatus = status;
  }

  if (plan) {
    if (!Object.values(PLAN_TIERS).includes(plan)) {
      return sendError(res, `Invalid plan. Must be one of: ${Object.values(PLAN_TIERS).join(', ')}`, 400);
    }
    filter.planTier = plan;
  }

  if (county) {
    filter.county = { $regex: county, $options: 'i' };
  }

  if (search) {
    filter.$or = [
      { name:  { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const total              = await School.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const schools = await School.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const schoolIds = schools.map((s) => s._id);
  const [staffCounts, studentCounts, classCounts, usersByRole] = await Promise.all([
    User.aggregate([
      { $match: { schoolId: { $in: schoolIds } } },
      { $group: { _id: '$schoolId', count: { $sum: 1 } } },
    ]),
    Student.aggregate([
      { $match: { schoolId: { $in: schoolIds } } },
      { $group: { _id: '$schoolId', count: { $sum: 1 } } },
    ]),
    ClassModel.aggregate([
      { $match: { schoolId: { $in: schoolIds } } },
      { $group: { _id: '$schoolId', count: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { schoolId: { $in: schoolIds }, role: { $ne: ROLES.SUPERADMIN } } },
      { $group: { _id: { schoolId: '$schoolId', role: '$role' }, count: { $sum: 1 } } },
    ]),
  ]);

  const toMap = (arr) => arr.reduce((acc, { _id, count }) => { acc[_id.toString()] = count; return acc; }, {});
  const staffMap   = toMap(staffCounts);
  const studentMap = toMap(studentCounts);
  const classMap   = toMap(classCounts);

  const roleBySchool = usersByRole.reduce((acc, { _id, count }) => {
    const sid = _id.schoolId.toString();
    if (!acc[sid]) acc[sid] = {};
    acc[sid][_id.role] = count;
    return acc;
  }, {});

  const enriched = schools.map((s) => ({
    ...s,
    staffCount:   staffMap[s._id.toString()]   ?? 0,
    studentCount: studentMap[s._id.toString()] ?? 0,
    classCount:   classMap[s._id.toString()]   ?? 0,
    usersByRole:  roleBySchool[s._id.toString()] ?? {},
  }));

  return sendSuccess(res, { schools: enriched, meta });
});

// ── GET /api/v1/admin/schools/:id ────────────────────────────────────────────

/**
 * Full detail for a single school, including staff breakdown by role.
 */
export const getSchool = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id).lean();
  if (!school) return sendError(res, 'School not found.', 404);

  // Staff breakdown by role
  const staffByRole = await User.aggregate([
    { $match:  { schoolId: school._id } },
    { $group:  { _id: '$role', count: { $sum: 1 } } },
    { $sort:   { _id: 1 } },
  ]);

  return sendSuccess(res, {
    school: {
      ...school,
      staff: {
        total:  staffByRole.reduce((sum, { count }) => sum + count, 0),
        byRole: staffByRole.reduce((acc, { _id, count }) => {
          acc[_id] = count;
          return acc;
        }, {}),
      },
    },
  });
});

// ── PATCH /api/v1/admin/schools/:id/status ───────────────────────────────────

/**
 * Update a school's subscription status and/or plan tier.
 * Used to manually activate, suspend, or upgrade a school.
 *
 * Body (all optional):
 *   subscriptionStatus — trial | active | suspended | expired
 *   planTier           — trial | starter | growth | professional
 *   isActive           — boolean (hard disable / re-enable)
 */
export const updateSchoolStatus = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) return sendError(res, 'School not found.', 404);

  const { subscriptionStatus, planTier, isActive } = req.body;

  if (subscriptionStatus !== undefined) {
    if (!Object.values(SUBSCRIPTION_STATUSES).includes(subscriptionStatus)) {
      return sendError(res, `Invalid status. Must be one of: ${Object.values(SUBSCRIPTION_STATUSES).join(', ')}`, 400);
    }
    school.subscriptionStatus = subscriptionStatus;
  }

  if (planTier !== undefined) {
    if (!Object.values(PLAN_TIERS).includes(planTier)) {
      return sendError(res, `Invalid plan tier. Must be one of: ${Object.values(PLAN_TIERS).join(', ')}`, 400);
    }
    school.planTier = planTier;
  }

  if (isActive !== undefined) {
    const wasActive = school.isActive;
    school.isActive = Boolean(isActive);

    // Cascade: deactivating a school immediately blocks all its staff accounts.
    // Re-enabling does NOT bulk-reactivate users (individual pauses are preserved).
    if (!school.isActive && wasActive) {
      await User.updateMany(
        { schoolId: school._id, role: { $ne: 'superadmin' } },
        { isActive: false }
      );
    }
  }

  await school.save();
  await bustSchoolSubCache(school._id);

  return sendSuccess(res, {
    message: 'School updated successfully.',
    school,
  });
});

export const reviewSchoolDeactivationRequest = asyncHandler(async (req, res) => {
  const { action, reviewNote } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return sendError(res, 'Action must be approve or reject.', 400);
  }

  const school = await School.findById(req.params.id);
  if (!school) return sendError(res, 'School not found.', 404);
  if (school.deactivationRequest?.status !== 'pending') {
    return sendError(res, 'This school does not have a pending deactivation request.', 400);
  }

  if (action === 'approve') {
    school.deactivationRequest.status = 'approved';
    school.isActive = false;
    school.subscriptionStatus = SUBSCRIPTION_STATUSES.SUSPENDED;
  } else {
    school.deactivationRequest.status = 'rejected';
  }

  school.deactivationRequest.reviewedByUserId = req.user._id;
  school.deactivationRequest.reviewedAt = new Date();
  school.deactivationRequest.reviewNote = reviewNote || undefined;

  if (action === 'approve') {
    await User.updateMany(
      { schoolId: school._id, role: { $ne: ROLES.SUPERADMIN } },
      { isActive: false }
    );
  }

  await school.save();
  await bustSchoolSubCache(school._id);

  logAction(req, {
    action: action === 'approve' ? AUDIT_ACTIONS.SUSPEND : AUDIT_ACTIONS.UPDATE,
    resource: AUDIT_RESOURCES.SCHOOL,
    resourceId: school._id,
    meta: {
      type: 'deactivation_request_review',
      reviewAction: action,
      reviewNote: reviewNote || null,
    },
  });

  sendSchoolDeactivationReviewedEmail({
    to: school.email,
    schoolName: school.name,
    action,
    reviewNote,
    meta: { schoolId: school._id, userId: req.user._id },
  }).catch(() => {});

  return sendSuccess(res, {
    message: action === 'approve'
      ? 'School account deactivation approved. The account is now disabled.'
      : 'School account deactivation request rejected.',
    school,
  });
});

// ── GET /api/v1/admin/audit-logs ─────────────────────────────────────────────

/**
 * System-wide audit log for the superadmin. Unlike the school-scoped version,
 * this queries all schools and includes the school name for context.
 */
export const listSystemAuditLogs = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.schoolId) filter.schoolId = req.query.schoolId;
  if (req.query.resource) filter.resource = req.query.resource;
  if (req.query.action)   filter.action   = req.query.action;

  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to)   filter.createdAt.$lte = new Date(req.query.to);
  }

  const total = await AuditLog.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('userId', 'firstName lastName role')
    .populate('schoolId', 'name');

  return sendSuccess(res, { logs, meta });
});

// ── GET /api/v1/admin/users ───────────────────────────────────────────────────

/**
 * Platform-wide user list for the superadmin.
 * Unlike /api/v1/users, this is NOT scoped to a single school.
 *
 * Query params:
 *   search   — partial match on firstName, lastName, email
 *   role     — filter by role
 *   schoolId — filter by school
 *   isActive — 'true' | 'false'
 *   page, limit
 */
export const listAdminUsers = asyncHandler(async (req, res) => {
  const { search, role, schoolId, isActive } = req.query;

  const filter = { role: { $ne: ROLES.SUPERADMIN } };

  if (role)     filter.role     = role;
  if (schoolId) filter.schoolId = schoolId;

  if (isActive !== undefined) {
    filter.isActive = isActive !== 'false';
  }

  if (search) {
    const r = searchRegex(search);
    filter.$or = [{ firstName: r }, { lastName: r }, { email: r }];
  }

  const total = await User.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('schoolId', 'name county subscriptionStatus')
    .lean();

  return sendSuccess(res, { users, meta });
});

// ── PATCH /api/v1/admin/users/:id/toggle ─────────────────────────────────────

/**
 * Toggle a user's isActive flag.
 * Superadmin cannot be toggled via this endpoint.
 */
export const toggleAdminUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 'User not found.', 404);
  if (user.role === ROLES.SUPERADMIN) {
    return sendError(res, 'Cannot modify a superadmin account.', 403);
  }

  user.isActive = !user.isActive;
  await user.save();

  return sendSuccess(res, {
    message: `User ${user.isActive ? 'activated' : 'deactivated'}.`,
    user: { _id: user._id, isActive: user.isActive },
  });
});

// ── POST /api/v1/admin/monitoring-test ──────────────────────────────────────
/**
 * Emits a synthetic Sentry error event for verification.
 *
 * Safety:
 * - Superadmin-only route (via router middleware)
 * - Blocked in production unless SENTRY_ALLOW_PROD_TEST_ENDPOINT=true
 */
export const triggerMonitoringTest = asyncHandler(async (req, res) => {
  if (env.isProduction && process.env.SENTRY_ALLOW_PROD_TEST_ENDPOINT !== 'true') {
    return sendError(
      res,
      'Monitoring test endpoint is disabled in production. Set SENTRY_ALLOW_PROD_TEST_ENDPOINT=true to allow it temporarily.',
      403
    );
  }

  if (!sentryEnabled) {
    return sendError(res, 'Sentry is not configured on this environment.', 400);
  }

  const testError = new Error('Synthetic monitoring test event (manual trigger)');
  const eventId = captureError(testError, {
    monitoringTest: {
      triggeredByUserId: req.user?._id?.toString(),
      triggeredAt: new Date().toISOString(),
      route: '/api/v1/admin/monitoring-test',
      environment: env.NODE_ENV,
    },
  });

  return sendSuccess(res, {
    message: 'Sentry test event sent.',
    eventId,
  });
});

// ── PATCH /api/v1/admin/schools/:id/sms-sender-id ──────────────────────────────

/**
 * Admin endpoint to approve or reject a school's requested SMS sender ID.
 *
 * Body:
 * {
 *   action: 'approve' | 'reject',
 *   senderIdApproved?: string  (required if action='approve')
 *   rejectionReason?: string   (optional if action='reject')
 * }
 *
 * Example:
 *   PATCH /api/v1/admin/schools/60d5ec49c1234/sms-sender-id
 *   { "action": "approve", "senderIdApproved": "NYERI_GIRLS" }
 */
export const approveSmsenderId = asyncHandler(async (req, res) => {
  const { id: schoolId } = req.params;
  const { action, senderIdApproved, rejectionReason } = req.body;

  if (!['approve', 'reject'].includes(action)) {
    return sendError(res, 'Action must be "approve" or "reject"', 400);
  }

  if (action === 'approve' && !senderIdApproved) {
    return sendError(res, 'senderIdApproved is required when action="approve"', 400);
  }

  if (action === 'approve' && !/^[A-Z0-9_]{1,11}$/.test(senderIdApproved)) {
    return sendError(res, 'Sender ID must be 1-11 alphanumeric chars', 400);
  }

  const updateData = {
    'smsSettings.senderIdStatus': action === 'approve' ? 'approved' : 'rejected',
  };

  if (action === 'approve') {
    updateData['smsSettings.senderIdApproved'] = senderIdApproved;
    updateData['smsSettings.approvedAt'] = new Date();
  } else if (rejectionReason) {
    updateData['smsSettings.rejectionReason'] = rejectionReason;
  }

  const school = await School.findByIdAndUpdate(
    schoolId,
    { $set: updateData },
    { new: true }
  ).select('name email smsSettings');

  if (!school) {
    return sendError(res, 'School not found', 404);
  }

  // Audit log
  await AuditLog.create({
    schoolId,
    userId: req.user._id,
    action: action === 'approve' ? 'sms_sender_approved' : 'sms_sender_rejected',
    resource: 'SchoolSmsSetting',
    metadata: {
      senderIdApproved: senderIdApproved || null,
      rejectionReason: rejectionReason || null,
    },
  });

  // Notify school by email (fire-and-forget)
  sendSenderIdReviewedEmail({
    to: school.email,
    schoolName: school.name,
    action,
    senderIdApproved: senderIdApproved || null,
    rejectionReason: rejectionReason || null,
    meta: { schoolId },
  }).catch(() => {});

  return sendSuccess(res, school, `Sender ID ${action}ed successfully`);
});

// ── GET /api/v1/admin/sms-analytics ─────────────────────────────────────────
/**
 * Platform-wide SMS consumption per school for the current (or specified) term.
 * Query: ?term=Term+1&academicYear=2026
 */
export const getSmsAnalytics = asyncHandler(async (req, res) => {
  const { term: qTerm, academicYear: qYear } = req.query;
  const { term, academicYear } = qTerm
    ? { term: qTerm, academicYear: qYear ?? String(new Date().getFullYear()) }
    : getCurrentTermAndYear();

  const stats = await SmsDelivery.aggregate([
    { $match: { term, academicYear } },
    {
      $group: {
        _id:       '$schoolId',
        total:     { $sum: 1 },
        delivered: { $sum: { $cond: [{ $eq: ['$deliveryStatus', SMS_DELIVERY_STATUS.DELIVERED] }, 1, 0] } },
        sent:      { $sum: { $cond: [{ $in: ['$deliveryStatus', [SMS_DELIVERY_STATUS.SENT, SMS_DELIVERY_STATUS.DELIVERED]] }, 1, 0] } },
        failed:    { $sum: { $cond: [{ $eq: ['$deliveryStatus', SMS_DELIVERY_STATUS.FAILED]    }, 1, 0] } },
        rejected:  { $sum: { $cond: [{ $eq: ['$deliveryStatus', SMS_DELIVERY_STATUS.REJECTED]  }, 1, 0] } },
        capped:    { $sum: { $cond: [{ $eq: ['$deliveryStatus', SMS_DELIVERY_STATUS.CAPPED]    }, 1, 0] } },
        purchased: { $sum: { $cond: [{ $eq: ['$creditType',     'purchased']                   }, 1, 0] } },
      },
    },
    {
      $lookup: {
        from: 'schools', localField: '_id', foreignField: '_id', as: 'school',
      },
    },
    { $unwind: '$school' },
    {
      $project: {
        schoolId:   '$_id',
        schoolName: '$school.name',
        total: 1, delivered: 1, sent: 1, failed: 1, rejected: 1, capped: 1, purchased: 1,
        purchasedRemaining: '$school.smsCredits.purchasedRemaining',
        deliveryRate: {
          $cond: [
            { $gt: ['$sent', 0] },
            { $round: [{ $multiply: [{ $divide: ['$delivered', '$sent'] }, 100] }, 1] },
            0,
          ],
        },
        successRate: {
          $cond: [
            { $gt: ['$total', 0] },
            { $round: [{ $multiply: [{ $divide: ['$sent', '$total'] }, 100] }, 1] },
            0,
          ],
        },
      },
    },
    { $sort: { total: -1 } },
  ]);

  return sendSuccess(res, { term, academicYear, schools: stats });
});

// ── Pricing Agreements ───────────────────────────────────────────────────────

/**
 * PATCH /api/v1/admin/schools/:id/pricing-agreement
 * Sets or disables negotiated pricing for one school.
 */
export const updateSchoolPricingAgreement = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) return sendError(res, 'School not found.', 404);

  const parsed = normalisePricingAgreement(req.body, req.user._id);
  if (parsed.error) return sendError(res, parsed.error, 400);

  school.pricingAgreement = parsed.agreement;
  await school.save();
  await bustSchoolSubCache(school._id);

  logAction(req, {
    action: AUDIT_ACTIONS.UPDATE,
    resource: AUDIT_RESOURCES.SCHOOL,
    resourceId: school._id,
    meta: {
      type: 'pricing_agreement',
      enabled: school.pricingAgreement.enabled,
      baseFee: school.pricingAgreement.baseFee,
      perStudentRate: school.pricingAgreement.perStudentRate,
    },
  });

  return sendSuccess(res, {
    message: school.pricingAgreement.enabled
      ? 'School pricing agreement saved.'
      : 'School pricing agreement disabled.',
    school,
  });
});

/**
 * PATCH /api/v1/admin/groups/:id/pricing-agreement
 * Sets or disables negotiated pricing for a billing group.
 */
export const updateGroupPricingAgreement = asyncHandler(async (req, res) => {
  const group = await SchoolGroup.findById(req.params.id);
  if (!group) return sendError(res, 'Group not found.', 404);

  const parsed = normalisePricingAgreement(req.body, req.user._id);
  if (parsed.error) return sendError(res, parsed.error, 400);

  group.pricingAgreement = parsed.agreement;
  await group.save();

  const schools = await School.find({ groupId: group._id }).select('_id');
  await Promise.all(schools.map((school) => bustSchoolSubCache(school._id)));

  logAction(req, {
    action: AUDIT_ACTIONS.UPDATE,
    resource: 'school_group',
    resourceId: group._id,
    meta: {
      type: 'pricing_agreement',
      enabled: group.pricingAgreement.enabled,
      baseFee: group.pricingAgreement.baseFee,
      perStudentRate: group.pricingAgreement.perStudentRate,
      affectedSchools: schools.length,
    },
  });

  return sendSuccess(res, {
    message: group.pricingAgreement.enabled
      ? 'Group pricing agreement saved.'
      : 'Group pricing agreement disabled.',
    group,
  });
});

// ── Financial Management ─────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/finance/summary
 * Platform revenue, expenses, and net position for the selected period.
 */
export const getFinanceSummary = asyncHandler(async (req, res) => {
  const revenueMatch = {
    status: 'completed',
    ...dateRangeFilter('paidAt', req.query),
  };
  const pendingMatch = {
    status: { $in: ['pending', 'processing'] },
    ...dateRangeFilter('createdAt', req.query),
  };
  const expenseMatch = {
    status: 'paid',
    ...dateRangeFilter('paymentDate', req.query),
  };
  const taxMatch = {
    status: { $ne: 'cancelled' },
    ...dateRangeFilter('dueDate', req.query),
  };

  const [
    revenue,
    pendingRevenue,
    expenses,
    outputVat,
    inputVat,
    taxGroups,
    expensesByCategory,
    recentPayments,
    recentExpenses,
  ] = await Promise.all([
    SubscriptionPayment.aggregate([
      { $match: revenueMatch },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    SubscriptionPayment.aggregate([
      { $match: pendingMatch },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    PlatformExpense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    SubscriptionPayment.aggregate([
      { $match: revenueMatch },
      { $group: { _id: null, total: { $sum: '$vatAmount' }, taxableSales: { $sum: '$subtotalExVat' }, count: { $sum: 1 } } },
    ]),
    PlatformExpense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, total: { $sum: '$vatAmount' }, taxablePurchases: { $sum: { $subtract: ['$amount', '$vatAmount'] } }, count: { $sum: 1 } } },
    ]),
    PlatformTaxRecord.aggregate([
      { $match: taxMatch },
      {
        $group: {
          _id: {
            taxType: '$taxType',
            treatment: '$treatment',
            affectsMargin: '$affectsMargin',
          },
          amountDue: { $sum: '$amountDue' },
          amountPaid: { $sum: '$amountPaid' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.taxType': 1 } },
    ]),
    PlatformExpense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    SubscriptionPayment.find(revenueMatch)
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(8)
      .select('-paystackRawResponse')
      .populate('schoolId', 'name email')
      .lean(),
    PlatformExpense.find(expenseMatch)
      .sort({ paymentDate: -1, createdAt: -1 })
      .limit(8)
      .populate('recordedByUserId', 'firstName lastName')
      .lean(),
  ]);

  const revenueTotal = revenue[0]?.total ?? 0;
  const expensesTotal = expenses[0]?.total ?? 0;
  const outputVatTotal = outputVat[0]?.total ?? 0;
  const inputVatTotal = inputVat[0]?.total ?? 0;
  const vatDue = Math.max(0, outputVatTotal - inputVatTotal);
  const vatCredit = Math.max(0, inputVatTotal - outputVatTotal);
  const taxableSales = outputVat[0]?.taxableSales ?? 0;
  const taxablePurchases = inputVat[0]?.taxablePurchases ?? 0;
  const operatingMarginExVat = taxableSales - taxablePurchases;
  const taxableProfitEstimate = Math.max(0, operatingMarginExVat);
  const corporationTaxEstimate = Math.round(taxableProfitEstimate * DEFAULT_CORPORATE_TAX_RATE);

  const payableTaxGroups = taxGroups.filter((group) => group._id.treatment === 'payable');
  const creditTaxGroups = taxGroups.filter((group) => group._id.treatment === 'credit');
  const taxCredits = creditTaxGroups.reduce((sum, group) => sum + group.amountDue, 0);
  const incomeTaxPrepayments = payableTaxGroups.reduce((sum, group) => {
    if (!INCOME_TAX_CREDIT_TYPES.has(group._id.taxType)) return sum;
    return sum + group.amountPaid;
  }, 0);
  const corporationTaxCredits = incomeTaxPrepayments + taxCredits;
  const corporationTaxOutstanding = Math.max(0, corporationTaxEstimate - corporationTaxCredits);
  const recordedVatPaid = payableTaxGroups.reduce((sum, group) => (
    group._id.taxType === 'vat' ? sum + group.amountPaid : sum
  ), 0);
  const recordedOtherTaxes = payableTaxGroups.filter((group) => !COMPUTED_TAX_TYPES.has(group._id.taxType));
  const recordedOtherTaxesDue = recordedOtherTaxes.reduce((sum, group) => sum + group.amountDue, 0);
  const recordedOtherTaxesPaid = recordedOtherTaxes.reduce((sum, group) => sum + group.amountPaid, 0);
  const recordedOtherTaxesOutstanding = recordedOtherTaxes.reduce((sum, group) => (
    sum + Math.max(0, group.amountDue - group.amountPaid)
  ), 0);
  const marginRecordedTaxesDue = recordedOtherTaxes.reduce((sum, group) => (
    group._id.affectsMargin ? sum + group.amountDue : sum
  ), 0);
  const passThroughTaxesDue = recordedOtherTaxesDue - marginRecordedTaxesDue;
  const totalTaxDue = vatDue + corporationTaxEstimate + recordedOtherTaxesDue;
  const marginTaxDue = vatDue + corporationTaxEstimate + marginRecordedTaxesDue;
  const finalMarginAfterVat = revenueTotal - expensesTotal - vatDue;
  const finalMarginAfterTaxes = revenueTotal - expensesTotal - marginTaxDue;
  const taxRows = [
    {
      taxType: 'vat',
      label: TAX_LABELS.vat,
      source: 'calculated',
      treatment: 'payable',
      affectsMargin: true,
      amountDue: vatDue,
      amountPaid: recordedVatPaid,
      outstanding: Math.max(0, vatDue - recordedVatPaid),
      note: 'Calculated as output VAT less input VAT.',
    },
    {
      taxType: 'corporation_tax',
      label: TAX_LABELS.corporation_tax,
      source: 'estimated',
      treatment: 'payable',
      affectsMargin: true,
      amountDue: corporationTaxEstimate,
      amountPaid: corporationTaxCredits,
      outstanding: corporationTaxOutstanding,
      note: 'Estimated from operating margin ex VAT before accountant adjustments.',
    },
    ...recordedOtherTaxes.map((group) => ({
      taxType: group._id.taxType,
      label: TAX_LABELS[group._id.taxType] || group._id.taxType,
      source: 'recorded',
      treatment: 'payable',
      affectsMargin: Boolean(group._id.affectsMargin),
      amountDue: group.amountDue,
      amountPaid: group.amountPaid,
      outstanding: Math.max(0, group.amountDue - group.amountPaid),
      count: group.count,
    })),
    ...creditTaxGroups.map((group) => ({
      taxType: group._id.taxType,
      label: `${TAX_LABELS[group._id.taxType] || group._id.taxType} credit`,
      source: 'recorded',
      treatment: 'credit',
      affectsMargin: false,
      amountDue: -group.amountDue,
      amountPaid: 0,
      outstanding: -group.amountDue,
      count: group.count,
    })),
  ];

  return sendSuccess(res, {
    summary: {
      revenue: revenueTotal,
      revenueCount: revenue[0]?.count ?? 0,
      pendingRevenue: pendingRevenue[0]?.total ?? 0,
      pendingRevenueCount: pendingRevenue[0]?.count ?? 0,
      expenses: expensesTotal,
      expenseCount: expenses[0]?.count ?? 0,
      net: revenueTotal - expensesTotal,
      netAfterMarginTaxes: finalMarginAfterTaxes,
      currency: 'KES',
    },
    taxes: {
      vatRate: DEFAULT_VAT_RATE,
      corporationTaxRate: DEFAULT_CORPORATE_TAX_RATE,
      outputVat: outputVatTotal,
      inputVat: inputVatTotal,
      vatDue,
      vatPaid: recordedVatPaid,
      vatOutstanding: Math.max(0, vatDue - recordedVatPaid),
      vatCredit,
      taxableSales,
      taxablePurchases,
      taxableProfitEstimate,
      corporationTaxEstimate,
      corporationTaxCredits,
      corporationTaxOutstanding,
      recordedOtherTaxesDue,
      recordedOtherTaxesPaid,
      recordedOtherTaxesOutstanding,
      marginRecordedTaxesDue,
      passThroughTaxesDue,
      totalTaxDue,
      marginTaxDue,
      taxRows,
      dueDateNote: 'VAT return and payment are due by the 20th day of the following month.',
    },
    margins: {
      operatingMarginExVat,
      operatingMarginRate: taxableSales > 0
        ? Math.round((operatingMarginExVat / taxableSales) * 10000) / 100
        : 0,
      finalMarginAfterVat,
      finalMarginRate: revenueTotal > 0
        ? Math.round((finalMarginAfterVat / revenueTotal) * 10000) / 100
        : 0,
      finalMarginAfterTaxes,
      finalMarginAfterTaxesRate: revenueTotal > 0
        ? Math.round((finalMarginAfterTaxes / revenueTotal) * 10000) / 100
        : 0,
    },
    expensesByCategory,
    recentPayments,
    recentExpenses,
  });
});

/**
 * GET /api/v1/admin/finance/payments
 * Lists platform subscription payments with frozen invoice snapshots.
 */
export const listFinancePayments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.schoolId) filter.schoolId = req.query.schoolId;
  if (req.query.paymentType) filter.paymentType = req.query.paymentType;
  Object.assign(filter, dateRangeFilter(req.query.status === 'completed' ? 'paidAt' : 'createdAt', req.query));

  const total = await SubscriptionPayment.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const payments = await SubscriptionPayment.find(filter)
    .sort({ paidAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-paystackRawResponse')
    .populate('schoolId', 'name email county groupId subscriptionStatus planTier trialExpiry')
    .populate('initiatedByUserId', 'firstName lastName email')
    .lean();

  return sendSuccess(res, {
    payments: payments.map((payment) => ({
      ...payment,
      nextPaymentDate: estimateNextPaymentDate(payment),
    })),
    meta,
  });
});

/**
 * GET /api/v1/admin/finance/expenses
 */
export const listPlatformExpenses = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  Object.assign(filter, dateRangeFilter('paymentDate', req.query));

  const total = await PlatformExpense.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const expenses = await PlatformExpense.find(filter)
    .sort({ paymentDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('recordedByUserId', 'firstName lastName email')
    .lean();

  return sendSuccess(res, { expenses, meta });
});

/**
 * POST /api/v1/admin/finance/expenses
 */
export const createPlatformExpense = asyncHandler(async (req, res) => {
  const parsed = parseExpensePayload(req.body, req.user._id);
  if (parsed.error) return sendError(res, parsed.error, 400);

  const expense = await PlatformExpense.create(parsed.expense);

  logAction(req, {
    action: AUDIT_ACTIONS.CREATE,
    resource: 'platform_expense',
    resourceId: expense._id,
    meta: { amount: expense.amount, category: expense.category, status: expense.status },
  });

  return sendSuccess(res, { expense, message: 'Expense recorded.' }, 201);
});

/**
 * PATCH /api/v1/admin/finance/expenses/:id
 */
export const updatePlatformExpense = asyncHandler(async (req, res) => {
  const existing = await PlatformExpense.findById(req.params.id);
  if (!existing) return sendError(res, 'Expense not found.', 404);

  const parsed = parseExpensePayload(req.body, req.user._id, existing);
  if (parsed.error) return sendError(res, parsed.error, 400);

  Object.assign(existing, parsed.expense);
  await existing.save();

  return sendSuccess(res, { expense: existing });
});

/**
 * DELETE /api/v1/admin/finance/expenses/:id
 */
export const deletePlatformExpense = asyncHandler(async (req, res) => {
  const expense = await PlatformExpense.findById(req.params.id);
  if (!expense) return sendError(res, 'Expense not found.', 404);

  await expense.deleteOne();

  logAction(req, {
    action: AUDIT_ACTIONS.DELETE,
    resource: 'platform_expense',
    resourceId: expense._id,
    meta: { amount: expense.amount, category: expense.category },
  });

  return sendSuccess(res, { message: 'Expense deleted.' });
});

/**
 * GET /api/v1/admin/finance/taxes
 */
export const listPlatformTaxRecords = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.taxType) filter.taxType = req.query.taxType;
  if (req.query.treatment) filter.treatment = req.query.treatment;
  Object.assign(filter, dateRangeFilter('dueDate', req.query));

  const total = await PlatformTaxRecord.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const taxRecords = await PlatformTaxRecord.find(filter)
    .sort({ dueDate: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('recordedByUserId', 'firstName lastName email')
    .lean();

  return sendSuccess(res, { taxRecords, meta, taxTypes: PLATFORM_TAX_TYPES });
});

/**
 * POST /api/v1/admin/finance/taxes
 */
export const createPlatformTaxRecord = asyncHandler(async (req, res) => {
  const parsed = parseTaxRecordPayload(req.body, req.user._id);
  if (parsed.error) return sendError(res, parsed.error, 400);

  const taxRecord = await PlatformTaxRecord.create(parsed.taxRecord);

  logAction(req, {
    action: AUDIT_ACTIONS.CREATE,
    resource: 'platform_tax_record',
    resourceId: taxRecord._id,
    meta: {
      amountDue: taxRecord.amountDue,
      taxType: taxRecord.taxType,
      treatment: taxRecord.treatment,
      status: taxRecord.status,
    },
  });

  return sendSuccess(res, { taxRecord, message: 'Tax record saved.' }, 201);
});

/**
 * PATCH /api/v1/admin/finance/taxes/:id
 */
export const updatePlatformTaxRecord = asyncHandler(async (req, res) => {
  const existing = await PlatformTaxRecord.findById(req.params.id);
  if (!existing) return sendError(res, 'Tax record not found.', 404);

  const parsed = parseTaxRecordPayload(req.body, req.user._id, existing);
  if (parsed.error) return sendError(res, parsed.error, 400);

  Object.assign(existing, parsed.taxRecord);
  await existing.save();

  return sendSuccess(res, { taxRecord: existing });
});

/**
 * DELETE /api/v1/admin/finance/taxes/:id
 */
export const deletePlatformTaxRecord = asyncHandler(async (req, res) => {
  const taxRecord = await PlatformTaxRecord.findById(req.params.id);
  if (!taxRecord) return sendError(res, 'Tax record not found.', 404);

  await taxRecord.deleteOne();

  logAction(req, {
    action: AUDIT_ACTIONS.DELETE,
    resource: 'platform_tax_record',
    resourceId: taxRecord._id,
    meta: { amountDue: taxRecord.amountDue, taxType: taxRecord.taxType },
  });

  return sendSuccess(res, { message: 'Tax record deleted.' });
});

// ── School Groups ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admin/groups
 * Create a new billing group.
 */
export const createGroup = asyncHandler(async (req, res) => {
  const { name, notes, contactPerson, contactEmail, pricingAgreement } = req.body;
  if (!name?.trim()) return sendError(res, 'Group name is required.', 400);

  let parsedPricing = null;
  if (pricingAgreement) {
    parsedPricing = normalisePricingAgreement(pricingAgreement, req.user._id);
    if (parsedPricing.error) return sendError(res, parsedPricing.error, 400);
  }

  const group = await SchoolGroup.create({
    name: name.trim(),
    notes,
    contactPerson,
    contactEmail,
    ...(parsedPricing ? { pricingAgreement: parsedPricing.agreement } : {}),
    createdBy: req.user._id,
  });

  return sendSuccess(res, { group, message: 'Group created.' }, 201);
});

/**
 * GET /api/v1/admin/groups
 * List all billing groups, each with their member schools.
 */
export const listGroups = asyncHandler(async (req, res) => {
  const groups = await SchoolGroup.find().sort({ createdAt: -1 }).lean();

  const groupIds = groups.map((g) => g._id);
  const schools = await School.find({ groupId: { $in: groupIds } })
    .select('_id name email county subscriptionStatus planTier groupId')
    .lean();

  const schoolsByGroup = schools.reduce((acc, s) => {
    const key = s.groupId.toString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  const enriched = groups.map((g) => ({
    ...g,
    schools: schoolsByGroup[g._id.toString()] ?? [],
  }));

  return sendSuccess(res, { groups: enriched });
});

/**
 * GET /api/v1/admin/groups/:id
 * Single group with member schools and student count totals.
 */
export const getGroup = asyncHandler(async (req, res) => {
  const group = await SchoolGroup.findById(req.params.id).lean();
  if (!group) return sendError(res, 'Group not found.', 404);

  const schools = await School.find({ groupId: group._id })
    .select('_id name email county subscriptionStatus planTier')
    .lean();

  const schoolIds = schools.map((s) => s._id);
  const studentCounts = await Student.aggregate([
    { $match: { schoolId: { $in: schoolIds }, status: 'active' } },
    { $group: { _id: '$schoolId', count: { $sum: 1 } } },
  ]);
  const studentMap = studentCounts.reduce((acc, { _id, count }) => {
    acc[_id.toString()] = count;
    return acc;
  }, {});

  const schoolsWithCounts = schools.map((s) => ({
    ...s,
    activeStudents: studentMap[s._id.toString()] ?? 0,
  }));

  return sendSuccess(res, {
    group: {
      ...group,
      schools: schoolsWithCounts,
      totalActiveStudents: schoolsWithCounts.reduce((sum, s) => sum + s.activeStudents, 0),
    },
  });
});

/**
 * PATCH /api/v1/admin/groups/:id
 * Update group metadata.
 */
export const updateGroup = asyncHandler(async (req, res) => {
  const { name, notes, contactPerson, contactEmail, pricingAgreement } = req.body;
  const group = await SchoolGroup.findById(req.params.id);
  if (!group) return sendError(res, 'Group not found.', 404);

  if (name !== undefined) group.name = name.trim();
  if (notes !== undefined) group.notes = notes;
  if (contactPerson !== undefined) group.contactPerson = contactPerson;
  if (contactEmail !== undefined) group.contactEmail = contactEmail;
  if (pricingAgreement !== undefined) {
    const parsedPricing = normalisePricingAgreement(pricingAgreement, req.user._id);
    if (parsedPricing.error) return sendError(res, parsedPricing.error, 400);
    group.pricingAgreement = parsedPricing.agreement;
  }

  await group.save();
  if (pricingAgreement !== undefined) {
    const schools = await School.find({ groupId: group._id }).select('_id');
    await Promise.all(schools.map((school) => bustSchoolSubCache(school._id)));
  }
  return sendSuccess(res, { group });
});

/**
 * DELETE /api/v1/admin/groups/:id
 * Delete a group. Member schools are detached (groupId set to null), not deleted.
 */
export const deleteGroup = asyncHandler(async (req, res) => {
  const group = await SchoolGroup.findById(req.params.id);
  if (!group) return sendError(res, 'Group not found.', 404);

  await School.updateMany({ groupId: group._id }, { $set: { groupId: null } });
  await group.deleteOne();

  return sendSuccess(res, { message: 'Group deleted. Member schools have been detached.' });
});

/**
 * POST /api/v1/admin/groups/:id/schools
 * Add a school to a group. Body: { schoolId }
 */
export const addSchoolToGroup = asyncHandler(async (req, res) => {
  const group = await SchoolGroup.findById(req.params.id);
  if (!group) return sendError(res, 'Group not found.', 404);

  const { schoolId } = req.body;
  if (!schoolId) return sendError(res, 'schoolId is required.', 400);

  const school = await School.findById(schoolId);
  if (!school) return sendError(res, 'School not found.', 404);

  school.groupId = group._id;
  await school.save();

  return sendSuccess(res, { school: { _id: school._id, name: school.name, groupId: school.groupId } });
});

/**
 * DELETE /api/v1/admin/groups/:id/schools/:schoolId
 * Remove a school from a group.
 */
export const removeSchoolFromGroup = asyncHandler(async (req, res) => {
  const school = await School.findOne({ _id: req.params.schoolId, groupId: req.params.id });
  if (!school) return sendError(res, 'School not found in this group.', 404);

  school.groupId = null;
  await school.save();

  return sendSuccess(res, { message: 'School removed from group.' });
});

// ─── Test-data purge helpers (superadmin only) ────────────────────────────

const SCHOOL_COLLECTIONS = [
  Attendance, Exam, Result, ReportCard,
  FeeStructure, Payment, PaymentNotification,
  SchoolSettings, TransportRoute, Visitor,
  LessonPlan, Book, BookLoan,
  Subject, Department, Timetable,
  CheckIn, PayrollRun, SalaryGrade,
  Leave, Notification,
  SmsDelivery, SmsLog,
  AuditLog, SubscriptionPayment,
  ClassModel, Student, User,
];

/**
 * DELETE /api/v1/admin/purge/school/:id
 * Hard-deletes a school and every document in every collection that
 * belongs to that school.  Intended for test-data cleanup only.
 */
export const purgeSchool = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) return sendError(res, 'School not found.', 404);

  const schoolId = school._id;
  const deleted = {};

  for (const Model of SCHOOL_COLLECTIONS) {
    const r = await Model.deleteMany({ school: schoolId });
    deleted[Model.modelName] = r.deletedCount;
  }

  await School.findByIdAndDelete(schoolId);
  deleted.School = 1;

  return sendSuccess(res, {
    message: `School "${school.name}" and all related data permanently deleted.`,
    deleted,
  });
});

/**
 * GET /api/v1/admin/purge/orphans/preview
 * Returns counts of orphaned documents (records referencing schools
 * that no longer exist) so the superadmin can review before purging.
 */
export const previewOrphans = asyncHandler(async (req, res) => {
  const schoolIds = await School.distinct('_id');

  const counts = {};
  for (const Model of SCHOOL_COLLECTIONS) {
    counts[Model.modelName] = await Model.countDocuments({
      school: { $nin: schoolIds },
    });
  }

  return sendSuccess(res, { counts });
});

/**
 * DELETE /api/v1/admin/purge/orphans
 * Deletes all documents whose `school` field references a non-existent school.
 */
export const purgeOrphans = asyncHandler(async (req, res) => {
  const schoolIds = await School.distinct('_id');

  const deleted = {};
  for (const Model of SCHOOL_COLLECTIONS) {
    const r = await Model.deleteMany({ school: { $nin: schoolIds } });
    deleted[Model.modelName] = r.deletedCount;
  }

  return sendSuccess(res, {
    message: 'Orphaned records permanently deleted.',
    deleted,
  });
});

// ── System Events ─────────────────────────────────────────────────────────────

export const listSystemEvents = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;

  const total = await SystemEvent.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const events = await SystemEvent.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('createdBy', 'firstName lastName')
    .lean();

  return sendSuccess(res, { events, meta });
});

export const createSystemEvent = asyncHandler(async (req, res) => {
  const { title, body, type, scheduledAt, status = 'draft' } = req.body;
  if (!title?.trim()) return sendError(res, 'Title is required.', 400);
  if (!body?.trim()) return sendError(res, 'Body is required.', 400);

  const event = await SystemEvent.create({
    title: title.trim(),
    body: body.trim(),
    type: type ?? 'announcement',
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    status,
    createdBy: req.user._id,
  });

  return sendSuccess(res, { event }, 201);
});

export const updateSystemEvent = asyncHandler(async (req, res) => {
  const event = await SystemEvent.findById(req.params.id);
  if (!event) return sendError(res, 'Event not found.', 404);

  const { title, body, type, scheduledAt, status } = req.body;
  if (title !== undefined) event.title = title.trim();
  if (body !== undefined) event.body = body.trim();
  if (type !== undefined) event.type = type;
  if (scheduledAt !== undefined) event.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (status !== undefined) event.status = status;

  await event.save();
  return sendSuccess(res, { event });
});

export const deleteSystemEvent = asyncHandler(async (req, res) => {
  const event = await SystemEvent.findByIdAndDelete(req.params.id);
  if (!event) return sendError(res, 'Event not found.', 404);
  return sendSuccess(res, { message: 'Event deleted.' });
});

export const broadcastSystemEvent = asyncHandler(async (req, res) => {
  const event = await SystemEvent.findById(req.params.id);
  if (!event) return sendError(res, 'Event not found.', 404);

  const { sendEmail: doEmail = true, sendNotification: doNotif = true } = req.body;

  // Find all school admin users across all active schools
  const admins = await User.find({
    role: ROLES.SCHOOL_ADMIN,
    isActive: true,
  }).select('_id firstName lastName email schoolId').lean();

  let recipientCount = 0;

  for (const admin of admins) {
    // In-app notification
    if (doNotif && admin.schoolId) {
      const notif = await notifyUser({
        schoolId: admin.schoolId,
        userId: admin._id,
        title: event.title,
        message: event.body.length > 200 ? event.body.slice(0, 197) + '…' : event.body,
        type: event.type === 'outage' ? 'error' : event.type === 'maintenance' ? 'warning' : 'info',
        meta: { systemEventId: event._id },
      });
      if (notif) {
        const unread = await Notification.countDocuments({
          schoolId: admin.schoolId,
          userId: admin._id,
          readAt: null,
        });
        emitToUser(String(admin._id), 'notification:count', { count: unread });
      }
    }

    // Email
    if (doEmail && admin.email) {
      queueEmailWithDirectFallback(
        JOB_NAMES.SEND_SYSTEM_EVENT_EMAIL,
        {
          to: admin.email,
          firstName: admin.firstName,
          eventTitle: event.title,
          eventBody: event.body,
          eventType: event.type,
          scheduledAt: event.scheduledAt,
          meta: { userId: admin._id, schoolId: admin.schoolId },
        },
        'SystemEvent',
      );
    }

    recipientCount++;
  }

  event.broadcastEmail = doEmail;
  event.broadcastNotification = doNotif;
  event.broadcastAt = new Date();
  event.status = 'published';
  event.recipientCount = recipientCount;
  await event.save();

  return sendSuccess(res, {
    message: `Broadcast sent to ${recipientCount} school admin${recipientCount !== 1 ? 's' : ''}.`,
    recipientCount,
    event,
  });
});

// ── System Settings ───────────────────────────────────────────────────────────

export const getSystemSettings = asyncHandler(async (req, res) => {
  const settings = await SystemSettings.findOne().lean();
  return sendSuccess(res, { settings: settings ?? {} });
});

export const updateSystemSettings = asyncHandler(async (req, res) => {
  const { currentAcademicYear, terms } = req.body;

  if (currentAcademicYear !== undefined && !/^\d{4}$/.test(currentAcademicYear)) {
    return sendError(res, 'Academic year must be a 4-digit year.', 400);
  }
  if (terms !== undefined) {
    if (!Array.isArray(terms) || terms.length > 3) {
      return sendError(res, 'Terms must be an array of up to 3 entries.', 400);
    }
    for (const t of terms) {
      if (!t.name || !t.startDate || !t.endDate) {
        return sendError(res, 'Each term requires name, startDate, and endDate.', 400);
      }
      if (new Date(t.endDate) <= new Date(t.startDate)) {
        return sendError(res, `Term "${t.name}": endDate must be after startDate.`, 400);
      }
    }
  }

  const settings = await SystemSettings.findOneAndUpdate(
    {},
    { $set: req.body },
    { upsert: true, new: true, runValidators: true }
  );

  return sendSuccess(res, { settings });
});

// ── School Inquiries ──────────────────────────────────────────────────────────

export const listInquiries = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const total = await SchoolInquiry.countDocuments(filter);
  const pendingCount = await SchoolInquiry.countDocuments({ status: 'pending' });
  const { skip, limit, meta } = paginate(req.query, total);

  const inquiries = await SchoolInquiry.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('reviewedBy', 'firstName lastName')
    .lean();

  return sendSuccess(res, { inquiries, pendingCount, meta });
});

export const getInquiryStats = asyncHandler(async (req, res) => {
  const pendingCount = await SchoolInquiry.countDocuments({ status: 'pending' });
  return sendSuccess(res, { pendingCount });
});

export const updateInquiry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  const allowed = ['pending', 'contacted', 'closed'];
  if (status && !allowed.includes(status)) {
    return sendError(res, `Status must be one of: ${allowed.join(', ')}`, 400);
  }

  const update = {};
  if (status) {
    update.status = status;
    update.reviewedAt = new Date();
    update.reviewedBy = req.user._id;
  }
  if (notes !== undefined) update.notes = notes;

  const inquiry = await SchoolInquiry.findByIdAndUpdate(id, { $set: update }, { new: true })
    .populate('reviewedBy', 'firstName lastName')
    .lean();

  if (!inquiry) return sendError(res, 'Inquiry not found', 404);

  return sendSuccess(res, { inquiry });
});
