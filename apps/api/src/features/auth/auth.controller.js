import crypto from 'node:crypto';
import { generateToken, hashToken } from '../../utils/tokens.js';
import { withTransaction } from '../../utils/withTransaction.js';
import { getCookieDomain } from '../../utils/cookies.js';
import jwt from 'jsonwebtoken';
import School from '../schools/School.model.js';
import User from '../users/User.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { env } from '../../config/env.js';
import { ROLES, SUBSCRIPTION_STATUSES, PLAN_TIERS, JOB_NAMES, CACHE_TTL } from '../../constants/index.js';
import { cacheGet, cacheSet } from '../../config/redis.js';
import { normalisePhone } from '../../utils/phone.js';
import { sendNewSchoolNotification } from '../../services/email.service.js';
import { queueEmailWithDirectFallback } from '../../utils/emailJobs.js';
import logger from '../../config/logger.js';
import { logAction } from '../../utils/auditLogger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const signToken = (userId) =>
  jwt.sign({ id: userId }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

const attachCookie = (res, token) => {
  const oneDay = 24 * 60 * 60 * 1000;
  res.cookie('token', token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'strict' : 'lax',
    maxAge: oneDay,
    domain: getCookieDomain(), // undefined in dev; '.diraschool.com' in prod
  });
};

const SCHOOL_SAFE_FIELDS =
  'name email phone county constituency registrationNumber address isActive subscriptionStatus planTier trialExpiry';

const buildAuthUser = async (userDoc) => {
  if (!userDoc) return null;

  const user = typeof userDoc.toSafeObject === 'function'
    ? userDoc.toSafeObject()
    : (typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc });

  delete user.password;

  if (!user.schoolId || user.role === ROLES.SUPERADMIN) {
    user.school = null;
    return user;
  }

  if (typeof user.schoolId === 'object' && user.schoolId !== null && user.schoolId.name) {
    user.school = user.schoolId;
    user.schoolId = user.schoolId._id ?? user.schoolId;
    return user;
  }

  const schoolInfoKey = `school:info:${user.schoolId}`;
  try {
    const cached = await cacheGet(schoolInfoKey);
    if (cached) { user.school = cached; return user; }
  } catch { /* Redis unavailable — fall through */ }

  const school = await School.findById(user.schoolId).select(SCHOOL_SAFE_FIELDS).lean();
  user.school = school ?? null;
  if (school) {
    try { await cacheSet(schoolInfoKey, school, CACHE_TTL.SCHOOL_INFO); } catch { /* non-fatal */ }
  }
  return user;
};

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 * Creates a new school + school_admin user atomically, then sends a
 * verification email. The admin cannot log in until they verify.
 * Public route — no auth required.
 */
export const registerSchool = asyncHandler(async (req, res) => {
  const { schoolName, schoolPhone, county, firstName, lastName, email, phone, password } = req.body;

  // Reject duplicate school email upfront with a clear message
  const existingSchool = await School.findOne({ email: email.toLowerCase().trim() });
  if (existingSchool) {
    return sendError(res, 'A school with this email is already registered.', 409);
  }

  // Generate OTP (manual entry) + token (fallback link), both valid for 30 minutes
  const otp = String(crypto.randomInt(100_000, 1_000_000)); // e.g. "482917"
  const { raw: rawToken, hash: tokenHash } = generateToken();
  const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  // Both School and User must be created atomically
  const { school, user } = await withTransaction(async (session) => {
    const [school] = await School.create(
      [
        {
          name: schoolName,
          email: email.toLowerCase().trim(),
          phone: normalisePhone(schoolPhone),
          county,
          subscriptionStatus: SUBSCRIPTION_STATUSES.TRIAL,
          planTier: PLAN_TIERS.TRIAL,
        },
      ],
      { session }
    );

    const [user] = await User.create(
      [
        {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.toLowerCase().trim(),
          phone: phone ? normalisePhone(phone) : undefined,
          password,
          role: ROLES.SCHOOL_ADMIN,
          schoolId: school._id,
          mustChangePassword: false,
          emailVerified: false,
          emailVerificationCode: otp,
          emailVerificationToken: tokenHash,
          emailVerificationExpiry: expiry,
        },
      ],
      { session }
    );

    return { school, user };
  });

  // Queue verification email asynchronously; send directly only if Redis/queueing fails.
  const verifyUrl = `${env.CLIENT_URL}/verify-email/${rawToken}`;
  queueEmailWithDirectFallback(
    JOB_NAMES.SEND_VERIFICATION_EMAIL,
    {
      to: user.email,
      firstName: user.firstName,
      schoolName: school.name,
      code: otp,
      verifyUrl,
      expiresInMinutes: 30,
      meta: { schoolId: school._id, userId: user._id, flow: 'register' },
    },
    'Auth verification'
  );

  // Notify the DiraSchool admin of the new registration (fire-and-forget)
  sendNewSchoolNotification({
    schoolName: school.name,
    schoolEmail: user.email,
    schoolPhone: school.phone,
    county: school.county,
    adminName: `${user.firstName} ${user.lastName}`,
    meta: { schoolId: school._id, userId: user._id },
  }).catch((err) =>
    logger.error('[Auth] Admin new-school notification failed:', err.message)
  );

  // Do NOT set a cookie — user must verify email before logging in
  return sendSuccess(
    res,
    {
      message: `Account created! Please check ${user.email} for a verification link to activate your account.`,
      email: user.email,
      school: { _id: school._id, name: school.name },
    },
    201
  );
});

/**
 * POST /api/v1/auth/login
 * Authenticates user and sets JWT cookie.
 * Public route — no auth required.
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Explicitly select password (it's excluded by default)
  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    isActive: true,
  }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return sendError(res, 'Invalid email or password.', 401);
  }

  // Block login until email is verified (applies to self-registered school admins)
  if (!user.emailVerified) {
    return sendError(
      res,
      'Please verify your email address before logging in. Check your inbox for the verification link.',
      403
    );
  }

  // Block login until the user accepts their invite and sets a real password
  if (user.invitePending) {
    return sendError(
      res,
      'Your account setup is incomplete. Please check your email for an invitation link.',
      403
    );
  }

  // Update last login timestamp
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  const token = signToken(user._id);
  attachCookie(res, token);

  const authUser = await buildAuthUser(user);

  logAction(
    { user, ip: req.ip, headers: req.headers },
    { action: 'login', resource: 'Auth', meta: { method: 'password' } }
  );

  return sendSuccess(res, {
    user: authUser,
    mustChangePassword: user.mustChangePassword,
  });
});

/**
 * POST /api/v1/auth/logout
 * Clears the JWT cookie.
 * Protected route.
 */
export const logout = asyncHandler(async (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0),
    domain: getCookieDomain(),
  });
  if (req.user) {
    logAction(req, { action: 'logout', resource: 'Auth' });
  }
  return sendSuccess(res, { message: 'Logged out successfully.' });
});

/**
 * GET /api/v1/auth/me
 * Returns the currently authenticated user.
 * Protected route.
 */
export const getMe = asyncHandler(async (req, res) => {
  // req.user is already loaded by the protect middleware
  const authUser = await buildAuthUser(req.user);
  return sendSuccess(res, { user: authUser });
});

/**
 * POST /api/v1/auth/forgot-password
 * Generates a password reset token and sends it via email.
 * Public route — no auth required.
 *
 * Security: always returns the same success message whether the email exists or
 * not — prevents user-enumeration attacks.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    isActive: true,
  }).select('+passwordResetToken +passwordResetExpiry');

  // Always respond with 200 — don't leak whether the email exists
  if (!user) {
    return sendSuccess(res, {
      message: 'If an account with that email exists, a reset token has been generated.',
    });
  }

  const { raw: rawToken, hash } = generateToken();
  user.passwordResetToken = hash;
  user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.CLIENT_URL}/reset-password/${rawToken}`;

  const resetPayload = {
    to: user.email,
    firstName: user.firstName,
    resetUrl,
    expiresInHours: 1,
    meta: {
      schoolId: user.schoolId,
      userId: user._id,
      flow: 'forgot-password',
    },
  };
  queueEmailWithDirectFallback(JOB_NAMES.SEND_RESET_EMAIL, resetPayload, 'Auth reset');

  return sendSuccess(res, {
    message: 'If an account with that email exists, a password reset link has been sent.',
  });
});

/**
 * POST /api/v1/auth/reset-password/:token
 * Validates the reset token and sets a new password.
 * Public route — no auth required.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  // Hash the incoming token to compare against the stored hash
  const hashedToken = hashToken(token);

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpiry: { $gt: new Date() }, // not expired
    isActive: true,
  }).select('+passwordResetToken +passwordResetExpiry');

  if (!user) {
    return sendError(res, 'Reset token is invalid or has expired.', 400);
  }

  // Set new password and clear reset fields
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpiry = undefined;
  user.mustChangePassword = false;
  await user.save();

  // Sign them in immediately after reset
  const jwtToken = signToken(user._id);
  attachCookie(res, jwtToken);

  const authUser = await buildAuthUser(user);

  return sendSuccess(res, {
    message: 'Password reset successfully. You are now logged in.',
    user: authUser,
  });
});

/**
 * POST /api/v1/auth/accept-invite/:token
 * Validates an account invitation token and sets the user's password.
 * This is how newly created staff accounts are activated.
 *
 * Flow:
 *   1. Admin creates user → invite email sent with token in URL
 *   2. User clicks link → frontend POSTs here with their chosen password
 *   3. Token validated → password set → invitePending cleared → auto-login
 *
 * Public route — no auth required (user has no password yet).
 */
export const acceptInvite = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const hashedToken = hashToken(token);

  const user = await User.findOne({
    inviteToken: hashedToken,
    inviteTokenExpiry: { $gt: new Date() },
    isActive: true,
  }).select('+inviteToken +inviteTokenExpiry');

  if (!user) {
    return sendError(
      res,
      'This invitation link is invalid or has expired. Ask your administrator to resend the invite.',
      400
    );
  }

  // Set the user's chosen password and fully activate the account
  user.password = password;
  user.inviteToken = undefined;
  user.inviteTokenExpiry = undefined;
  user.invitePending = false;
  user.mustChangePassword = false;
  user.emailVerified = true; // admin-created accounts are trusted — no separate email check
  await user.save();

  // Send onboarding welcome email to new school admins (fire-and-forget)
  if (user.role === ROLES.SCHOOL_ADMIN && user.schoolId) {
    School.findById(user.schoolId).select('name').then((school) => {
      if (!school) return;
      queueEmailWithDirectFallback(
        JOB_NAMES.SEND_WELCOME_EMAIL,
        {
          to: user.email,
          firstName: user.firstName,
          schoolName: school.name,
          dashboardUrl: env.CLIENT_URL,
          meta: { schoolId: user.schoolId, userId: user._id, flow: 'onboarding-welcome' },
        },
        'Welcome email'
      );
    }).catch(() => {/* non-fatal */});
  }

  // Auto-sign the user in immediately
  const jwtToken = signToken(user._id);
  attachCookie(res, jwtToken);

  const authUser = await buildAuthUser(user);

  return sendSuccess(res, {
    message: 'Your account is set up. Welcome!',
    user: authUser,
  });
});

/**
 * POST /api/v1/auth/verify-email
 * Activates a school admin account by validating the 6-digit OTP they received.
 * Public route — no auth required (user isn't logged in yet).
 *
 * Body: { email, code }
 * On success: marks emailVerified=true, auto-logs the user in via cookie.
 */
export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    emailVerified: false,
  }).select('+emailVerificationCode +emailVerificationToken +emailVerificationExpiry');

  // Unified error — don't reveal whether the email exists or the code is wrong
  const invalid = () =>
    sendError(res, 'Verification code is invalid or has expired. Request a new code.', 400);

  if (!user) return invalid();
  if (!user.emailVerificationCode) return invalid();
  if (user.emailVerificationCode !== code.trim()) return invalid();
  if (user.emailVerificationExpiry < new Date()) return invalid();

  // Activate the account — clear both OTP and link token
  user.emailVerified = true;
  user.emailVerificationCode = undefined;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  // Ensure the school is active before auto-logging in. This guards against an
  // edge case where the school was manually deactivated between registration and
  // email verification (e.g. duplicate registration flagged by superadmin).
  if (user.schoolId) {
    const school = await School.findById(user.schoolId).select('isActive').lean();
    if (school && school.isActive === false) {
      return sendError(
        res,
        'Your school account is currently inactive. Please contact support to activate it.',
        403
      );
    }
    // School not found at all — auto-activate so the account is usable while
    // support investigates (the protect middleware will catch it on next request)
  }

  // Auto-log the user in — submitting the correct OTP proves email ownership
  const jwtToken = signToken(user._id);
  attachCookie(res, jwtToken);

  const authUser = await buildAuthUser(user);

  return sendSuccess(res, {
    message: 'Email verified! Welcome to Diraschool.',
    user: authUser,
  });
});

/**
 * GET /api/v1/auth/verify-email/:token
 * Fallback one-click verification via the link sent in the email.
 * Validates the token, marks the account verified, and auto-logs the user in.
 * Public route — no auth required.
 */
export const verifyEmailByToken = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const hashedToken = hashToken(token);

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpiry: { $gt: new Date() },
    emailVerified: false,
  }).select('+emailVerificationCode +emailVerificationToken +emailVerificationExpiry');

  if (!user) {
    return sendError(res, 'Verification link is invalid or has expired. Request a new code.', 400);
  }

  // Activate — clear both OTP and token so neither can be reused
  user.emailVerified = true;
  user.emailVerificationCode = undefined;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  await user.save({ validateBeforeSave: false });

  const jwtToken = signToken(user._id);
  attachCookie(res, jwtToken);

  const authUser = await buildAuthUser(user);

  return sendSuccess(res, {
    message: 'Email verified! Welcome to Diraschool.',
    user: authUser,
  });
});

/**
 * POST /api/v1/auth/resend-verification
 * Re-sends the verification email with a fresh 30-minute OTP + token.
 * Public route — call this when the original link has expired.
 *
 * Always returns 200 — no user enumeration.
 */
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
    isActive: true,
    emailVerified: false, // already-verified accounts are silently skipped
  }).select('+emailVerificationToken +emailVerificationExpiry');

  // Respond immediately — do not reveal whether the email exists
  if (!user) {
    return sendSuccess(res, {
      message:
        'If an unverified account with that email exists, a new verification link has been sent.',
    });
  }

  // Issue a fresh OTP + fallback link token (30-minute expiry)
  const otp = String(crypto.randomInt(100_000, 1_000_000));
  const { raw: rawToken, hash: verifyHash } = generateToken();
  user.emailVerificationCode = otp;
  user.emailVerificationToken = verifyHash;
  user.emailVerificationExpiry = new Date(Date.now() + 30 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  // Get school name for the email subject
  const school = await School.findById(user.schoolId).select('name').lean();
  const verifyUrl = `${env.CLIENT_URL}/verify-email/${rawToken}`;

  const resendPayload = {
    to: user.email,
    firstName: user.firstName,
    schoolName: school?.name ?? 'your school',
    code: otp,
    verifyUrl,
    expiresInMinutes: 30,
    meta: {
      schoolId: user.schoolId,
      userId: user._id,
      flow: 'resend-verification',
    },
  };
  queueEmailWithDirectFallback(
    JOB_NAMES.SEND_VERIFICATION_EMAIL,
    resendPayload,
    'Auth resend verification'
  );

  return sendSuccess(res, {
    message:
      'If an unverified account with that email exists, a new verification link has been sent.',
  });
});

/**
 * PATCH /api/v1/auth/me
 * Updates the authenticated user's own profile (name, phone).
 * Protected route.
 */
export const updateMe = asyncHandler(async (req, res) => {
  const { firstName, lastName, phone } = req.body;
  const user = await User.findById(req.user._id);

  if (firstName) user.firstName = firstName.trim();
  if (lastName) user.lastName = lastName.trim();
  if (phone !== undefined) user.phone = phone ? normalisePhone(phone) : undefined;

  await user.save({ validateBeforeSave: false });

  logAction(req, { action: 'update_profile', resource: 'Auth' });

  const authUser = await buildAuthUser(user);
  return sendSuccess(res, { user: authUser });
});

/**
 * POST /api/v1/auth/change-password
 * Changes the user's password and clears mustChangePassword.
 * Protected route — accessible even when mustChangePassword is true.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    return sendError(res, 'Current password is incorrect.', 401);
  }

  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();

  return sendSuccess(res, { message: 'Password changed successfully.' });
});
