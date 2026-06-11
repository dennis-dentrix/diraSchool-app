import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  registerSchool,
  login,
  googleAuth,
  logout,
  getMe,
  updateMe,
  changePassword,
  forgotPassword,
  resetPassword,
  acceptInvite,
  verifyEmail,
  verifyEmailByToken,
  resendVerification,
} from './auth.controller.js';
import {
  validateRegisterSchool,
  validateLogin,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword,
  validateAcceptInvite,
  validateResendVerification,
  validateVerifyEmail,
  validateUpdateProfile,
} from './auth.validator.js';
import { protect, blockIfMustChangePassword } from '../../middleware/auth.js';
import { RedisRateLimitStore } from '../../middleware/rateLimitStore.js';

const router = express.Router();

// Tight rate limit on auth endpoints — 20 requests per 15 minutes
// Disabled in test environment so the test suite doesn't hit the limit
const authLimiter =
  process.env.NODE_ENV === 'test'
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        store: new RedisRateLimitStore({ prefix: 'rl:auth' }),
        passOnStoreError: true,
        message: { message: 'Too many attempts. Please try again in 15 minutes.' },
        standardHeaders: true,
        legacyHeaders: false,
      });

// ── Public routes ─────────────────────────────────────────────────────────────
router.post('/register', authLimiter, validateRegisterSchool, registerSchool);
router.post('/login', authLimiter, validateLogin, login);
router.post('/google', authLimiter, googleAuth);
router.post('/forgot-password', authLimiter, validateForgotPassword, forgotPassword);
router.post('/reset-password/:token', authLimiter, validateResetPassword, resetPassword);
router.post('/accept-invite/:token', authLimiter, validateAcceptInvite, acceptInvite);
router.post('/verify-email', authLimiter, validateVerifyEmail, verifyEmail);
router.get('/verify-email/:token', authLimiter, verifyEmailByToken);
router.post('/resend-verification', authLimiter, validateResendVerification, resendVerification);

// ── Protected routes ──────────────────────────────────────────────────────────
router.post('/logout', protect, logout);
router.get('/me', protect, blockIfMustChangePassword, getMe);
router.patch('/me', protect, blockIfMustChangePassword, validateUpdateProfile, updateMe);

// Change-password is accessible even when mustChangePassword = true (that's the point)
router.post('/change-password', protect, validateChangePassword, changePassword);

export default router;
