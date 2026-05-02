import crypto from 'node:crypto';
import User from './User.model.js';
import School from '../schools/School.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import { normalisePhone } from '../../utils/phone.js';
import { JOB_NAMES, AUDIT_ACTIONS, AUDIT_RESOURCES, ROLES } from '../../constants/index.js';
import { logAction } from '../../utils/auditLogger.js';
import { sendInviteEmail } from '../../services/email.service.js';
import { emailQueue } from '../../jobs/queues.js';
import { env } from '../../config/env.js';
import logger from '../../config/logger.js';

const enqueueEmail = async (type, payload) =>
  emailQueue.add(type, { type, payload });

const DEPUTY_ALLOWED_TARGET_ROLES = new Set([
  ROLES.TEACHER,
  ROLES.DEPARTMENT_HEAD,
]);

const isDeputy = (user) => user?.role === ROLES.DEPUTY_HEADTEACHER;

const canManageSchoolAdminRecord = (actor, targetUser) =>
  actor?.role === ROLES.SUPERADMIN || actor?._id?.equals?.(targetUser._id);

const assertTargetManageable = (req, targetUser) => {
  if (targetUser.role === ROLES.SCHOOL_ADMIN && !canManageSchoolAdminRecord(req.user, targetUser)) {
    return 'School admin accounts can only be edited by superadmin or the owner account.';
  }

  if (isDeputy(req.user) && !DEPUTY_ALLOWED_TARGET_ROLES.has(targetUser.role)) {
    return 'Deputy headteacher can only manage teacher accounts.';
  }

  return null;
};

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/users
 * Creates a staff user scoped to the logged-in admin's school.
 *
 * Flow:
 *   1. Admin submits name, email, role.
 *   2. A cryptographic invite token is generated and stored (hash only).
 *   3. An invitation email is sent with a secure link (7-day expiry).
 *   4. The user clicks the link → POST /api/v1/auth/accept-invite/:token
 *      to set their own password and activate the account.
 *
 * No temporary passwords are generated — the user sets their own password
 * on first visit via the invite link.
 */
export const createUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, phone, role, staffId, tscNumber } = req.body;
  if (isDeputy(req.user) && !DEPUTY_ALLOWED_TARGET_ROLES.has(role)) {
    return sendError(res, 'Deputy headteacher can only invite teacher accounts.', 403);
  }

  const school = await School.findById(req.user.schoolId).select('name').lean();
  const schoolName = school?.name ?? 'your school';

  // Generate invite token upfront — embed in User.create to avoid an extra save round-trip
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiry    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const user = await User.create({
    firstName:         firstName.trim(),
    lastName:          lastName.trim(),
    email:             email.toLowerCase().trim(),
    phone:             phone ? normalisePhone(phone) : undefined,
    // Random placeholder — the pre-save hash hook runs on it, but it is
    // never used: acceptInvite overwrites it when the user sets their password.
    password:          crypto.randomBytes(16).toString('hex'),
    role,
    staffId:           staffId   ?? undefined,
    tscNumber:         tscNumber ?? undefined,
    schoolId:          req.user.schoolId,
    mustChangePassword: false,
    invitePending:      true,
    inviteToken:        tokenHash,
    inviteTokenExpiry:  expiry,
    // Admin-created accounts are within a verified school — skip email verification.
    emailVerified:      true,
  });

  // Fire-and-forget — a mail failure must never fail the 201 response.
  // Send directly first so the email goes out even if the worker process is down.
  // Fall back to the queue only when the direct send itself fails (worker will retry).
  const inviteUrl = `${env.CLIENT_URL}/accept-invite/${rawToken}`;
  const invitePayload = {
    to:           user.email,
    firstName:    user.firstName,
    schoolName,
    inviteUrl,
    expiresInDays: 7,
    meta: {
      schoolId: req.user.schoolId,
      userId: user._id,
      flow: 'create-user',
      initiatedBy: req.user._id,
    },
  };
  sendInviteEmail(invitePayload).catch((err) => {
    logger.error('[Users] Invite email direct send failed, falling back to queue', {
      err: err.message,
    });
    enqueueEmail(JOB_NAMES.SEND_INVITE_EMAIL, invitePayload).catch((qErr) =>
      logger.error('[Users] Invite email queue fallback also failed:', qErr.message)
    );
  });

  return sendSuccess(
    res,
    {
      user:    user.toSafeObject(),
      message: `Account created. An invitation email has been sent to ${user.email}.`,
    },
    201
  );
});

/**
 * GET /api/v1/users
 * Lists all users in the school. Supports ?role= filter.
 */
export const listUsers = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };
  if (req.query.role) {
    const roles = String(req.query.role)
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
      .filter((r) => r !== ROLES.PARENT); // parent accounts are never staff
    filter.role = roles.length > 1 ? { $in: roles } : roles[0] ?? { $in: [] };
  }

  // Never expose parent accounts through staff management endpoints
  if (!filter.role) {
    filter.role = { $ne: ROLES.PARENT };
  } else if (typeof filter.role === 'string' && filter.role !== ROLES.PARENT) {
    // keep single role filter as-is (parent already stripped above)
  } else if (filter.role?.$in) {
    // already filtered above
  }

  if (isDeputy(req.user)) {
    const allowed = [...DEPUTY_ALLOWED_TARGET_ROLES];
    if (!filter.role) {
      filter.role = { $in: allowed };
    } else if (typeof filter.role === 'string') {
      if (!allowed.includes(filter.role)) {
        filter.role = { $in: [] };
      }
    } else if (filter.role?.$in) {
      filter.role = { $in: filter.role.$in.filter((role) => allowed.includes(role)) };
    }
  }
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive !== 'false';
  if (req.query.invitePending !== undefined) filter.invitePending = req.query.invitePending !== 'false';
  if (req.query.search) {
    const r = new RegExp(req.query.search.trim(), 'i');
    filter.$or = [{ firstName: r }, { lastName: r }, { email: r }, { staffId: r }];
  }

  const total = await User.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const users = await User.find(filter)
    .sort({ lastName: 1, firstName: 1 })
    .skip(skip)
    .limit(limit);

  return sendSuccess(res, { users: users.map((u) => u.toSafeObject()), meta });
});

/**
 * GET /api/v1/users/:id
 */
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!user) return sendError(res, 'User not found.', 404);
  const restrictionError = assertTargetManageable(req, user);
  if (restrictionError) return sendError(res, restrictionError, 403);
  return sendSuccess(res, { user: user.toSafeObject() });
});

/**
 * PATCH /api/v1/users/:id
 */
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!user) return sendError(res, 'User not found.', 404);

  if (user._id.equals(req.user._id)) {
    return sendError(res, 'Use /auth/change-password to update your own account.', 400);
  }
  const restrictionError = assertTargetManageable(req, user);
  if (restrictionError) return sendError(res, restrictionError, 403);

  const { firstName, lastName, email, phone, role, isActive, staffId, tscNumber, reason } = req.body;
  if (role !== undefined && isDeputy(req.user) && !DEPUTY_ALLOWED_TARGET_ROLES.has(role)) {
    return sendError(res, 'Deputy headteacher can only assign teacher roles.', 403);
  }
  const previousIsActive = user.isActive;

  if (email !== undefined) {
    const nextEmail = email.toLowerCase().trim();
    if (nextEmail !== user.email) {
      const duplicate = await User.findOne({
        schoolId: req.user.schoolId,
        email: nextEmail,
        _id: { $ne: user._id },
      });
      if (duplicate) return sendError(res, 'A user with this email already exists in this school.', 409);
      user.email = nextEmail;
    }
  }
  if (firstName  !== undefined) user.firstName  = firstName;
  if (lastName   !== undefined) user.lastName   = lastName;
  if (phone      !== undefined) user.phone      = normalisePhone(phone);
  if (role       !== undefined) user.role       = role;
  if (isActive   !== undefined) user.isActive   = isActive;
  if (staffId    !== undefined) user.staffId    = staffId;
  if (tscNumber  !== undefined) user.tscNumber  = tscNumber;

  await user.save();

  if (isActive !== undefined && isActive !== previousIsActive) {
    logAction(req, {
      action: isActive ? AUDIT_ACTIONS.ACTIVATE : AUDIT_ACTIONS.SUSPEND,
      resource: AUDIT_RESOURCES.USER,
      resourceId: user._id,
      meta: {
        targetName: `${user.firstName} ${user.lastName}`,
        role: user.role,
        ...(reason ? { reason } : {}),
      },
    });
  }

  return sendSuccess(res, { user: user.toSafeObject() });
});

/**
 * DELETE /api/v1/users/:id
 * Permanently deletes a staff account in this school.
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!user) return sendError(res, 'User not found.', 404);

  if (user._id.equals(req.user._id)) {
    return sendError(res, 'You cannot delete your own account.', 400);
  }
  if (user.role === ROLES.PARENT) {
    return sendError(res, 'Parent accounts cannot be deleted from staff management.', 400);
  }
  const restrictionError = assertTargetManageable(req, user);
  if (restrictionError) return sendError(res, restrictionError, 403);

  await user.deleteOne();

  logAction(req, {
    action: AUDIT_ACTIONS.DELETE,
    resource: AUDIT_RESOURCES.USER,
    resourceId: user._id,
    meta: {
      targetName: `${user.firstName} ${user.lastName}`,
      role: user.role,
      email: user.email,
    },
  });

  return sendSuccess(res, { message: 'User deleted successfully.' });
});

/**
 * POST /api/v1/users/:id/resend-invite
 * Issues a fresh invite token and re-sends the invitation email.
 * Use when a staff member hasn't accepted their invite yet, or the link expired.
 */
export const resendInvite = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!user) return sendError(res, 'User not found.', 404);

  if (user._id.equals(req.user._id)) {
    return sendError(res, 'Use /auth/forgot-password to reset your own password.', 400);
  }
  const restrictionError = assertTargetManageable(req, user);
  if (restrictionError) return sendError(res, restrictionError, 403);

  const school = await School.findById(req.user.schoolId).select('name').lean();
  const schoolName = school?.name ?? 'your school';

  // Rotate the token so the old link is immediately invalidated
  const rawToken  = crypto.randomBytes(32).toString('hex');
  user.inviteToken       = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  user.invitePending     = true;
  await user.save({ validateBeforeSave: false });

  const inviteUrl = `${env.CLIENT_URL}/accept-invite/${rawToken}`;
  const resendInvitePayload = {
    to:           user.email,
    firstName:    user.firstName,
    schoolName,
    inviteUrl,
    expiresInDays: 7,
    meta: {
      schoolId: req.user.schoolId,
      userId: user._id,
      flow: 'resend-invite',
      initiatedBy: req.user._id,
    },
  };
  sendInviteEmail(resendInvitePayload).catch((err) => {
    logger.error('[Users] Resend invite email direct send failed, falling back to queue', {
      err: err.message,
    });
    enqueueEmail(JOB_NAMES.SEND_INVITE_EMAIL, resendInvitePayload).catch((qErr) =>
      logger.error('[Users] Resend invite email queue fallback also failed:', qErr.message)
    );
  });

  return sendSuccess(res, {
    message: `A new invitation link has been sent to ${user.email}.`,
  });
});

/**
 * POST /api/v1/users/:id/reset-password
 * Admin triggers a password-reset email for any staff member.
 * Generates a reset token (same flow as forgot-password) so the user
 * sets their own new password via the standard reset link.
 */
export const adminResetPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!user) return sendError(res, 'User not found.', 404);

  if (user._id.equals(req.user._id)) {
    return sendError(res, 'Use /auth/change-password to reset your own password.', 400);
  }
  const restrictionError = assertTargetManageable(req, user);
  if (restrictionError) return sendError(res, restrictionError, 403);

  const { sendPasswordResetEmail } = await import('../../services/email.service.js');

  const rawToken  = crypto.randomBytes(32).toString('hex');
  user.resetPasswordToken  = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.CLIENT_URL}/reset-password/${rawToken}`;
  sendPasswordResetEmail({ to: user.email, firstName: user.firstName, resetUrl }).catch((err) =>
    logger.error('[Users] Admin reset-password email failed:', err.message)
  );

  return sendSuccess(res, {
    message: `A password reset link has been sent to ${user.email}.`,
  });
});
