import { generateToken, randomPassword } from '../../utils/tokens.js';
import { withTransaction } from '../../utils/withTransaction.js';
import { searchRegex } from '../../utils/search.js';
import School from './School.model.js';
import User from '../users/User.model.js';
import Student from '../students/Student.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import {
  SUBSCRIPTION_STATUSES,
  AUDIT_ACTIONS,
  AUDIT_RESOURCES,
  CACHE_TTL,
  JOB_NAMES,
  ROLES,
} from '../../constants/index.js';
import { getRedis, cacheGet, cacheSet, cacheDel } from '../../config/redis.js';
import { logAction } from '../../utils/auditLogger.js';
import {
  sendSchoolDeactivationRequestNotification,
  sendSenderIdRequestNotification,
} from '../../services/email.service.js';
import { normalisePhone } from '../../utils/phone.js';
import { queueEmailWithDirectFallback } from '../../utils/emailJobs.js';
import { env } from '../../config/env.js';

// Bust the subscription cache for a school after any admin change.
const bustSubCache = async (schoolId) => {
  const redis = getRedis();
  if (!redis) return;
  try { await redis.del(`school:sub:${schoolId}`); } catch { /* non-fatal */ }
};

const schoolInfoKey = (schoolId) => `school:info:${schoolId}`;

// ── School-admin endpoints ────────────────────────────────────────────────────

/**
 * GET /api/v1/schools/me
 * Returns the logged-in user's school profile.
 * Any authenticated school user (all roles except superadmin).
 */
export const getMySchool = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;
  const cacheKey = schoolInfoKey(schoolId);

  try {
    const cached = await cacheGet(cacheKey);
    if (cached) return sendSuccess(res, { school: cached });
  } catch { /* Redis unavailable — fall through to DB */ }

  const school = await School.findById(schoolId).lean();
  if (!school) return sendError(res, 'School not found.', 404);

  try { await cacheSet(cacheKey, school, CACHE_TTL.SCHOOL_INFO); } catch { /* non-fatal */ }

  return sendSuccess(res, { school });
});

/**
 * PATCH /api/v1/schools/me
 * Updates non-sensitive school info (name, phone, county, etc.).
 * Admin roles only — teacher/secretary/parent cannot change school details.
 */
export const updateMySchool = asyncHandler(async (req, res) => {
  const school = await School.findById(req.user.schoolId);
  if (!school) return sendError(res, 'School not found.', 404);

  const {
    name,
    phone,
    county,
    constituency,
    registrationNumber,
    address,
    mpesaTillNumber,
    paymentSmsSettings,
  } = req.body;

  if (name !== undefined) school.name = name;
  if (phone !== undefined) school.phone = phone;
  if (county !== undefined) school.county = county;
  if (constituency !== undefined) school.constituency = constituency;
  if (registrationNumber !== undefined) school.registrationNumber = registrationNumber;
  if (address !== undefined) school.address = address;
  if (mpesaTillNumber !== undefined) school.mpesaTillNumber = normalisePhone(mpesaTillNumber) || undefined;
  if (paymentSmsSettings !== undefined) {
    const existing = school.paymentSmsSettings?.toObject?.() ?? school.paymentSmsSettings ?? {};
    school.paymentSmsSettings = {
      ...existing,
      ...paymentSmsSettings,
      phoneNumber: paymentSmsSettings.phoneNumber !== undefined
        ? normalisePhone(paymentSmsSettings.phoneNumber) || undefined
        : existing.phoneNumber,
      bankName: paymentSmsSettings.bankName || undefined,
    };
  }

  await school.save();
  await Promise.all([
    bustSubCache(school._id),
    cacheDel(schoolInfoKey(school._id)).catch(() => {}),
  ]);

  return sendSuccess(res, { school });
});

export const requestSchoolDeactivation = asyncHandler(async (req, res) => {
  const school = await School.findById(req.user.schoolId);
  if (!school) return sendError(res, 'School not found.', 404);
  if (school.isActive === false) return sendError(res, 'This school account is already inactive.', 400);

  if (school.deactivationRequest?.status === 'pending') {
    return sendError(res, 'A deactivation request is already pending review.', 409);
  }

  school.deactivationRequest = {
    status: 'pending',
    reason: req.body.reason,
    confirmation: req.body.confirmation,
    requestedByUserId: req.user._id,
    requestedAt: new Date(),
    reviewedByUserId: undefined,
    reviewedAt: undefined,
    reviewNote: undefined,
  };

  await school.save();
  await cacheDel(schoolInfoKey(school._id)).catch(() => {});

  logAction(req, {
    action: AUDIT_ACTIONS.UPDATE,
    resource: AUDIT_RESOURCES.SCHOOL,
    resourceId: school._id,
    meta: {
      type: 'deactivation_request',
      requestedBy: req.user.email,
    },
  });

  sendSchoolDeactivationRequestNotification({
    schoolName: school.name,
    schoolId: String(school._id),
    schoolEmail: school.email,
    requestedBy: `${req.user.firstName} ${req.user.lastName}`.trim(),
    requestedByEmail: req.user.email,
    reason: req.body.reason,
    meta: { schoolId: school._id, userId: req.user._id },
  }).catch(() => {});

  return sendSuccess(res, {
    message: 'Deactivation request submitted. A Diraschool superadmin must review it before access is disabled.',
    school,
  });
});

// ── Superadmin endpoints ──────────────────────────────────────────────────────

/**
 * POST /api/v1/schools
 * Superadmin creates a new school tenant.
 * Default subscription: trial (30 days) — set by the model.
 */
export const createSchool = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    phone,
    county,
    constituency,
    registrationNumber,
    address,
    adminFirstName,
    adminLastName,
    adminEmail,
    adminPhone,
  } = req.body;

  // Duplicate email check — give a cleaner message than the Mongo 11000 error
  const existing = await School.findOne({ email });
  if (existing) return sendError(res, 'A school with this email already exists.', 409);

  const existingUser = await User.findOne({ email: adminEmail });
  if (existingUser) return sendError(res, 'A user with this admin email already exists.', 409);

  const { raw: rawToken, hash: tokenHash } = generateToken();
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { school, admin } = await withTransaction(async (session) => {
    const [school] = await School.create(
      [{ name, email, phone: normalisePhone(phone), county, constituency, registrationNumber, address }],
      { session }
    );

    const [admin] = await User.create(
      [
        {
          firstName: adminFirstName.trim(),
          lastName: adminLastName.trim(),
          email: adminEmail.toLowerCase().trim(),
          phone: adminPhone ? normalisePhone(adminPhone) : undefined,
          password: randomPassword(),
          role: ROLES.SCHOOL_ADMIN,
          schoolId: school._id,
          mustChangePassword: false,
          invitePending: true,
          inviteToken: tokenHash,
          inviteTokenExpiry: expiry,
          emailVerified: true,
        },
      ],
      { session }
    );

    return { school, admin };
  });

  const inviteUrl = `${env.CLIENT_URL}/accept-invite/${rawToken}`;
  queueEmailWithDirectFallback(
    JOB_NAMES.SEND_INVITE_EMAIL,
    {
      to: admin.email,
      firstName: admin.firstName,
      schoolName: school.name,
      inviteUrl,
      expiresInDays: 7,
      meta: {
        schoolId: school._id,
        userId: admin._id,
        flow: 'superadmin-school-create',
        initiatedBy: req.user._id,
      },
    },
    'Superadmin school invite'
  );

  return sendSuccess(
    res,
    {
      school,
      admin: admin.toSafeObject(),
      message: `School registered. An invitation email has been sent to ${admin.email}.`,
    },
    201
  );
});

/**
 * GET /api/v1/schools
 * Superadmin lists all school tenants with pagination.
 * Supports ?status= (trial|active|suspended|expired) and ?search= (name/email).
 */
export const listSchools = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.query.status) {
    filter.subscriptionStatus = req.query.status;
  }

  if (req.query.search) {
    const regex = searchRegex(req.query.search);
    filter.$or = [{ name: regex }, { email: regex }, { registrationNumber: regex }];
  }

  if (req.query.active !== undefined) {
    filter.isActive = req.query.active !== 'false';
  }

  const total = await School.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const schools = await School.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  return sendSuccess(res, { schools, meta });
});

/**
 * GET /api/v1/schools/:id
 * Superadmin retrieves any school by ID.
 */
export const getSchool = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) return sendError(res, 'School not found.', 404);
  return sendSuccess(res, { school });
});

/**
 * PATCH /api/v1/schools/:id
 * Superadmin updates school info including email and isActive flag.
 * Does NOT change subscriptionStatus — use /subscription for that.
 */
export const updateSchool = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) return sendError(res, 'School not found.', 404);

  const { name, email, phone, county, constituency, registrationNumber, address, isActive } = req.body;

  // Guard against duplicate email if email is being changed
  if (email && email !== school.email) {
    const duplicate = await School.findOne({ email, _id: { $ne: school._id } });
    if (duplicate) return sendError(res, 'A school with this email already exists.', 409);
  }

  if (name !== undefined) school.name = name;
  if (email !== undefined) school.email = email;
  if (phone !== undefined) school.phone = phone;
  if (county !== undefined) school.county = county;
  if (constituency !== undefined) school.constituency = constituency;
  if (registrationNumber !== undefined) school.registrationNumber = registrationNumber;
  if (address !== undefined) school.address = address;
  if (isActive !== undefined) {
    const wasActive = school.isActive;
    school.isActive = isActive;

    // Cascade: disable all school staff when the school is deactivated.
    // Re-activation intentionally does NOT bulk-reactivate users — an admin
    // may have individually paused some accounts for other reasons.
    if (!isActive && wasActive) {
      await User.updateMany(
        { schoolId: school._id, role: { $ne: 'superadmin' } },
        { isActive: false }
      );
    }
  }

  await school.save();
  await bustSubCache(school._id);

  if (isActive !== undefined) {
    logAction(req, {
      action: isActive ? AUDIT_ACTIONS.ACTIVATE : AUDIT_ACTIONS.SUSPEND,
      resource: AUDIT_RESOURCES.SCHOOL,
      resourceId: school._id,
      meta: { isActive },
    });
  }

  return sendSuccess(res, { school });
});

/**
 * PATCH /api/v1/schools/:id/subscription
 * Superadmin sets the subscription status (trial → active → suspended / expired).
 * Optionally updates the trialExpiry date when extending a trial.
 *
 * Business rules:
 *  - Moving to ACTIVE clears any trial expiry tracking (school is fully subscribed).
 *  - Moving to TRIAL allows passing a new trialExpiry date.
 *  - SUSPENDED / EXPIRED blocks all school users immediately (checked in protect()).
 */
export const updateSubscription = asyncHandler(async (req, res) => {
  const school = await School.findById(req.params.id);
  if (!school) return sendError(res, 'School not found.', 404);

  const { subscriptionStatus, planTier, trialExpiry } = req.body;

  school.subscriptionStatus = subscriptionStatus;
  if (planTier !== undefined) school.planTier = planTier;

  if (subscriptionStatus === SUBSCRIPTION_STATUSES.ACTIVE) {
    // Active subscription — trial expiry is no longer relevant
    school.trialExpiry = undefined;
  } else if (
    subscriptionStatus === SUBSCRIPTION_STATUSES.TRIAL &&
    trialExpiry
  ) {
    school.trialExpiry = trialExpiry;
  }

  await school.save();
  await bustSubCache(school._id);

  logAction(req, {
    action: AUDIT_ACTIONS.UPDATE,
    resource: AUDIT_RESOURCES.SCHOOL,
    resourceId: school._id,
    meta: { subscriptionStatus, trialExpiry: trialExpiry || null },
  });

  return sendSuccess(res, {
    message: `School subscription updated to '${subscriptionStatus}'.`,
    school,
  });
});

// ── POST /api/v1/schools/me/sms-sender-id-request ──────────────────────────────

/**
 * School admin endpoint to request a custom SMS sender ID (e.g., NYERI_GIRLS).
 *
 * Body: { senderIdRequested: string }
 * Example: { "senderIdRequested": "NYERI_GIRLS" }
 *
 * Returns: school with updated smsSettings and status 'pending'.
 * Admin will approve/reject after reviewing with the configured SMS provider.
 */
export const requestSmsSenderId = asyncHandler(async (req, res) => {
  const { senderIdRequested } = req.body;
  const schoolId = req.user.schoolId;

  if (!senderIdRequested) {
    return sendError(res, 'senderIdRequested is required', 400);
  }

  if (!/^[A-Z0-9_]{1,11}$/.test(senderIdRequested)) {
    return sendError(res, 'Sender ID must be 1-11 alphanumeric chars, e.g., NYERI_GIRLS', 400);
  }

  const school = await School.findByIdAndUpdate(
    schoolId,
    {
      $set: {
        'smsSettings.senderIdRequested': senderIdRequested.toUpperCase(),
        'smsSettings.senderIdStatus': 'pending',
        'smsSettings.requestedAt': new Date(),
      },
    },
    { new: true }
  ).select('name smsSettings');

  logAction(req, {
    action: AUDIT_ACTIONS.UPDATE,
    resource: AUDIT_RESOURCES.SCHOOL,
    resourceId: schoolId,
    meta: { senderIdRequested: senderIdRequested.toUpperCase() },
  });

  // Notify superadmin (fire-and-forget)
  sendSenderIdRequestNotification({
    schoolName: school.name,
    schoolId: schoolId.toString(),
    senderIdRequested: senderIdRequested.toUpperCase(),
    requestedByEmail: req.user.email,
    meta: { schoolId },
  }).catch(() => {});

  return sendSuccess(res, school, 'SMS sender ID requested. Our team will review and approve within 24 hours.');
});

/**
 * GET /api/v1/schools/trial-activity
 * Superadmin — lists all active trial schools with engagement signals.
 * Used to prioritise follow-up calls and monitor onboarding health.
 */
export const getTrialActivity = asyncHandler(async (req, res) => {
  const now = new Date();

  const trialSchools = await School.find({
    subscriptionStatus: SUBSCRIPTION_STATUSES.TRIAL,
    isActive: true,
  })
    .select('name email phone county trialExpiry createdAt')
    .sort({ trialExpiry: 1 })
    .lean();

  if (!trialSchools.length) return sendSuccess(res, { schools: [] });

  const schoolIds = trialSchools.map((s) => s._id);

  // Student counts per school in one aggregation
  const studentCounts = await Student.aggregate([
    { $match: { schoolId: { $in: schoolIds }, status: 'active' } },
    { $group: { _id: '$schoolId', count: { $sum: 1 } } },
  ]);
  const countMap = studentCounts.reduce((acc, r) => {
    acc[r._id.toString()] = r.count;
    return acc;
  }, {});

  // Most recent login per school (school admin only)
  const admins = await User.find({
    schoolId: { $in: schoolIds },
    role: ROLES.SCHOOL_ADMIN,
    isActive: true,
  })
    .select('schoolId email firstName lastName lastLoginAt phone')
    .lean();

  const adminMap = admins.reduce((acc, a) => {
    acc[a.schoolId.toString()] = a;
    return acc;
  }, {});

  const DAY_MS = 24 * 60 * 60 * 1000;

  const data = trialSchools.map((school) => {
    const sid = school._id.toString();
    const admin = adminMap[sid];
    const daysLeft = Math.ceil((new Date(school.trialExpiry).getTime() - now.getTime()) / DAY_MS);
    const daysActive = Math.floor((now.getTime() - new Date(school.createdAt).getTime()) / DAY_MS);

    return {
      _id: school._id,
      name: school.name,
      email: school.email,
      phone: school.phone,
      county: school.county,
      createdAt: school.createdAt,
      trialExpiry: school.trialExpiry,
      daysLeft: Math.max(0, daysLeft),
      daysActive,
      studentCount: countMap[sid] ?? 0,
      admin: admin
        ? {
            name: `${admin.firstName} ${admin.lastName}`.trim(),
            email: admin.email,
            phone: admin.phone,
            lastLoginAt: admin.lastLoginAt ?? null,
          }
        : null,
    };
  });

  return sendSuccess(res, { schools: data });
});
