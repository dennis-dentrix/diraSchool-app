/* eslint-disable no-console */
import 'dotenv/config';
import { fileURLToPath } from 'url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { validateEnv, env } from './config/env.js';
import { connectDB } from './config/db.js';
import { connectRedis, getRedis } from './config/redis.js';
import { captureError, initSentry } from './config/sentry.js';
import { corsOptions } from './config/cors.js';
import logger from './config/logger.js';
import errorHandler from './middleware/errorHandler.js';
import { csrf } from './middleware/csrf.js';
import authRoutes from './features/auth/auth.routes.js';
import userRoutes from './features/users/users.routes.js';
import classRoutes from './features/classes/classes.routes.js';
import studentRoutes from './features/students/students.routes.js';
import attendanceRoutes from './features/attendance/attendance.routes.js';
import subjectRoutes from './features/subjects/subjects.routes.js';
import examRoutes from './features/exams/exams.routes.js';
import resultRoutes from './features/results/results.routes.js';
import feeRoutes from './features/fees/fees.routes.js';
import reportCardRoutes from './features/report-cards/report-cards.routes.js';
import schoolRoutes from './features/schools/schools.routes.js';
import parentRoutes from './features/parent/parent.routes.js';
import auditRoutes from './features/audit/audit.routes.js';
import settingsRoutes from './features/settings/settings.routes.js';
import timetableRoutes from './features/timetable/timetable.routes.js';
import transportRoutes from './features/transport/transport.routes.js';
import adminRoutes from './features/admin/admin.routes.js';
import dashboardRoutes from './features/dashboard/dashboard.routes.js';
import emailRoutes from './features/email/email.routes.js';
import pricingRoutes from './features/pricing/pricing.routes.js';
import exportRoutes from './features/export/export.routes.js';
import notificationRoutes from './features/notifications/notifications.routes.js';
import subscriptionRoutes from './features/subscriptions/subscriptions.routes.js';
import lessonPlanRoutes from './features/lesson-plans/lesson-plans.routes.js';
import smsRoutes from './features/sms/sms.routes.js';
import visitorRoutes from './features/visitors/visitors.routes.js';
import checkInRoutes from './features/checkins/checkins.routes.js';
import leaveRoutes from './features/leave/leave.routes.js';

// ── Startup diagnostic — always runs first, visible in Railway logs ──────────
// This prints BEFORE validateEnv() so missing vars are visible even if we crash.
console.log('='.repeat(50));
console.log('[Boot] Diraschool API starting…');
console.log(`[Boot] NODE_ENV  : ${process.env.NODE_ENV ?? '(not set)'}`);
console.log(`[Boot] PORT      : ${process.env.PORT ?? '(not set — will use 3000)'}`);
console.log(
  `[Boot] MONGO_URI : ${process.env.MONGO_URI ? '✓ set' : '✗ MISSING — server will exit'}`
);
console.log(
  `[Boot] REDIS_URL : ${process.env.REDIS_URL ? '✓ set' : '✗ MISSING — server will exit'}`
);
console.log(
  `[Boot] JWT_SECRET: ${process.env.JWT_SECRET ? '✓ set' : '✗ MISSING — server will exit'}`
);
console.log(`[Boot] CLIENT_URL: ${process.env.CLIENT_URL ?? '✗ MISSING — server will exit'}`);
console.log('='.repeat(50));
// ─────────────────────────────────────────────────────────────────────────────

// Validate env — exits with clear error if any required var is missing
validateEnv();
initSentry('diraschool-api');

const app = express();

// ── Security middleware ──────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions));
app.use(csrf); // Origin/Referer validation — defense-in-depth CSRF guard

// ── Global IP rate limit ─────────────────────────────────────────────────────
// 200 req / IP / minute — coarse protection against scrapers and abusive clients.
// Auth endpoints carry their own tighter limit (20/15 min) in auth.routes.js.
const globalLimiter =
  process.env.NODE_ENV === 'test'
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 60 * 1000,
        max: 200,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: 'Too many requests. Please slow down.' },
      });
app.use(globalLimiter);

// ── Parsing middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── HTTP request logging ─────────────────────────────────────────────────────
// Silence in tests; use morgan piped through Winston in all other envs.
// Production: Apache "combined" format → JSON log file.
// Development: concise "dev" format → coloured console.
if (env.NODE_ENV !== 'test') {
  const morganFormat = env.isProduction ? 'combined' : 'dev';
  const morganStream = {
    // Pipe morgan output into Winston so all logs go to the same place
    write: (message) => logger.http(message.trim()),
  };
  app.use(morgan(morganFormat, { stream: morganStream }));
}

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  // Redis is non-critical — a transient reconnect must not kill the container.
  // We always return HTTP 200 so Railway does not restart on Redis blips.
  let redisStatus = 'not_connected';
  let redisError = null;

  try {
    const redis = getRedis();
    if (redis) {
      const state = redis.status; // 'connecting' | 'connect' | 'ready' | 'reconnecting' | 'end'
      if (state === 'ready') {
        await redis.ping(); // only ping when already ready — avoids 3 s hangs
        redisStatus = 'up';
      } else {
        // Still connecting or reconnecting — report the state but don't block
        redisStatus = state; // e.g. "connecting", "reconnecting"
      }
    }
  } catch (err) {
    redisStatus = 'degraded';
    redisError = err.message;
    logger.warn(`[Health] Redis degraded: ${err.message}`);
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      api: 'up',
      mongodb: 'up',
      redis: redisStatus,
      storage:
        env.DO_SPACES_KEY && env.DO_SPACES_SECRET && env.DO_SPACES_BUCKET
          ? 'configured'
          : 'not_configured',
    },
    // Always include redisError when present so we can debug in Railway logs
    ...(redisError && { redisError }),
  });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/classes', classRoutes);
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/subjects', subjectRoutes);
app.use('/api/v1/exams', examRoutes);
app.use('/api/v1/results', resultRoutes);
app.use('/api/v1/fees', feeRoutes);
app.use('/api/v1/report-cards', reportCardRoutes);
app.use('/api/v1/lesson-plans', lessonPlanRoutes);
app.use('/api/v1/schools', schoolRoutes);
app.use('/api/v1/parent', parentRoutes);
app.use('/api/v1/audit-logs', auditRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/timetables', timetableRoutes);
app.use('/api/v1/transport', transportRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/email', emailRoutes);
app.use('/api/v1/pricing', pricingRoutes);
app.use('/api/v1/export', exportRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/sms', smsRoutes);
app.use('/api/v1/visitors', visitorRoutes);
app.use('/api/v1/checkins', checkInRoutes);
app.use('/api/v1/leave',    leaveRoutes);

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
});

// ── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler);

// ── Boot — only when run directly, not when imported by tests ────────────────
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error(`[Boot] Unhandled rejection: ${error.message}`, { stack: error.stack });
    captureError(error, { process: { type: 'unhandledRejection' } });
  });

  process.on('uncaughtException', (error) => {
    logger.error(`[Boot] Uncaught exception: ${error.message}`, { stack: error.stack });
    captureError(error, { process: { type: 'uncaughtException' } });
  });

  const start = async () => {
    // 1. Start HTTP server FIRST so Railway's health check gets a response
    //    immediately — even before MongoDB and Redis are fully connected.
    //    Without this, Railway waits for connectDB() (can take 5-15 s on Atlas cold
    //    start) before the server listens, and the health check times out.
    const server = app.listen(env.PORT, () => {
      logger.info(`[Boot] HTTP server listening on port ${env.PORT}`);
      logger.info(`[Boot] Health: http://localhost:${env.PORT}/health`);
    });

    // 2. Connect to MongoDB — retry is handled by mongoose internally
    try {
      await connectDB();
    } catch (err) {
      logger.error(`[Boot] MongoDB connection failed: ${err.message}`);
      // Non-fatal at this point — mongoose will keep retrying in the background
    }

    // 3. Connect to Redis — errors are non-fatal, app degrades gracefully
    connectRedis();

    // 4. Graceful shutdown on SIGTERM (Railway sends this before replacing deploys)
    const shutdown = (signal) => {
      logger.info(`[Boot] ${signal} received — shutting down gracefully`);
      server.close(() => {
        logger.info('[Boot] HTTP server closed');
        process.exit(0);
      });
      // Force-exit after 10 s if connections hang
      setTimeout(() => process.exit(1), 10_000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  };

  start().catch((err) => {
    console.error('[Boot] Fatal startup error:', err);
    process.exit(1);
  });
}

export default app;
