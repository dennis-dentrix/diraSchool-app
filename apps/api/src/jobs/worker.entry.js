/**
 * Worker process entry point.
 *
 * Run separately from the API server:
 *   node src/jobs/worker.entry.js
 *
 * In production (PM2 ecosystem.config.js):
 *   { name: 'worker', script: 'src/jobs/worker.entry.js' }
 *
 * This process connects to MongoDB + Redis, registers BullMQ processors
 * for each queue, and runs indefinitely — consuming jobs as they arrive.
 */
import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import mongoose from 'mongoose';
import { validateEnv } from '../config/env.js';
import { connectDB } from '../config/db.js';
import logger from '../config/logger.js';
import { QUEUE_NAMES, JOB_NAMES } from '../constants/index.js';
import { createBullMQConnection, logRedisConnectionError } from '../config/redis.js';
import { captureError, initSentry } from '../config/sentry.js';
import { processSmsJob } from './workers/sms.worker.js';
import { processReportJob } from './workers/report.worker.js';
import { processReceiptJob } from './workers/receipt.worker.js';
import { processImportJob } from './workers/import.worker.js';
import { startEmailWorker } from './workers/email.worker.js';
import { processCheckoutReminderScan } from './workers/checkout-reminder.worker.js';
import { processTrialReminderScan } from './workers/trial-reminder.worker.js';
import { processWeeklySummaryScan } from './workers/weekly-summary.worker.js';

validateEnv();
initSentry('diraschool-worker');

const serializeWorkerError = (err) => {
  if (err instanceof Error) {
    return {
      message: err.message,
      stack: err.stack,
      code: err.code,
      provider: err.provider,
      providerError: err.providerError,
    };
  }

  if (typeof err === 'string') {
    return { message: err };
  }

  return {
    message: err?.message ?? JSON.stringify(err ?? {}),
    code: err?.code,
    provider: err?.provider,
    providerError: err?.providerError,
  };
};

// Must be a Redis *instance* — see redis.js createBullMQConnection() for details.
const connection = createBullMQConnection();

// ── Start DB then register workers ────────────────────────────────────────────

await connectDB();


// ── Checkout-reminder repeatable job ─────────────────────────────────────────
// Runs every 15 minutes Mon–Fri. The processor checks which schools' checkout
// window ended ~60 min ago and fans out reminder emails to staff still checked in.
const checkoutQueue = new Queue(QUEUE_NAMES.CHECKOUT_REMINDER, { connection });
checkoutQueue.on('error', (err) => logRedisConnectionError('Queue:checkout-reminder', err));
await checkoutQueue.upsertJobScheduler(
  'checkout-reminder-scan',
  { pattern: '*/15 * * * 1-5' }, // every 15 min, Mon–Fri (UTC, runs ~18:00-20:00 EAT)
  { name: JOB_NAMES.RUN_CHECKOUT_REMINDER_SCAN, data: {} }
);

const checkoutReminderWorker = new Worker(
  QUEUE_NAMES.CHECKOUT_REMINDER,
  async () => processCheckoutReminderScan(),
  { connection, concurrency: 1 }
);

// ── Trial-reminder daily job ──────────────────────────────────────────────────
// Runs at 08:00 UTC daily (11:00 EAT). Sends engagement emails to trial
// schools at day 3, day 15, and day 27 of their 30-day trial.
const trialReminderQueue = new Queue(QUEUE_NAMES.TRIAL_REMINDER, { connection });
trialReminderQueue.on('error', (err) => logRedisConnectionError('Queue:trial-reminder', err));
await trialReminderQueue.upsertJobScheduler(
  'trial-reminder-scan',
  { pattern: '0 8 * * *' },
  { name: JOB_NAMES.RUN_TRIAL_REMINDER_SCAN, data: {} }
);

const trialReminderWorker = new Worker(
  QUEUE_NAMES.TRIAL_REMINDER,
  async () => processTrialReminderScan(),
  { connection, concurrency: 1 }
);

// ── Weekly summary job ────────────────────────────────────────────────────────
// Runs every Saturday at 02:00 UTC (05:00 EAT). Generates and emails 3-PDF
// weekly summaries (attendance, check-ins, fees) to every school that was
// in session at least once during the Mon–Fri week.
const weeklySummaryQueue = new Queue(QUEUE_NAMES.WEEKLY_SUMMARY, { connection });
weeklySummaryQueue.on('error', (err) => logRedisConnectionError('Queue:weekly-summary', err));
await weeklySummaryQueue.upsertJobScheduler(
  'weekly-summary-scan',
  { pattern: '0 2 * * 6' }, // 02:00 UTC Saturday = 05:00 EAT
  { name: JOB_NAMES.RUN_WEEKLY_SUMMARY_SCAN, data: {} }
);

const weeklySummaryWorker = new Worker(
  QUEUE_NAMES.WEEKLY_SUMMARY,
  async (job) => processWeeklySummaryScan(job.data),
  { connection, concurrency: 1 }
);

const smsWorker = new Worker(QUEUE_NAMES.SMS, processSmsJob, {
  connection,
  concurrency: 5,    // process up to 5 SMS jobs in parallel
});

const reportWorker = new Worker(QUEUE_NAMES.REPORT, processReportJob, {
  connection,
  concurrency: 2,    // PDF generation is CPU-heavy — keep concurrency low
});

const receiptWorker = new Worker(QUEUE_NAMES.RECEIPT, processReceiptJob, {
  connection,
  concurrency: 5,
});

const importWorker = new Worker(QUEUE_NAMES.IMPORT, processImportJob, {
  connection,
  concurrency: 1,    // serial imports prevent DB contention and transaction conflicts
});

const emailWorker = startEmailWorker();

// ── Event logging ─────────────────────────────────────────────────────────────

for (const [name, worker] of [
  ['sms',               smsWorker],
  ['report',            reportWorker],
  ['receipt',           receiptWorker],
  ['import',            importWorker],
  ['email',             emailWorker],
  ['checkout-reminder', checkoutReminderWorker],
  ['trial-reminder',    trialReminderWorker],
  ['weekly-summary',    weeklySummaryWorker],
]) {
  worker.on('completed', (job) => {
    logger.info(`[Worker:${name}] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    const serializedError = serializeWorkerError(err);
    logger.error(`[Worker:${name}] Job ${job?.id} failed: ${serializedError.message}`, {
      ...serializedError,
    });
    captureError(err, {
      worker: { name, jobId: job?.id?.toString(), queue: job?.queueName },
    });
  });
  worker.on('error', (err) => {
    logger.error(`[Worker:${name}] Worker error: ${err.message}`);
    captureError(err, {
      worker: { name },
    });
  });
}

logger.info('[Worker] All workers started and listening for jobs');

// ── Graceful shutdown ─────────────────────────────────────────────────────────

const shutdown = async (signal) => {
  logger.info(`[Worker] ${signal} received — shutting down gracefully`);
  await smsWorker.close();
  await reportWorker.close();
  await receiptWorker.close();
  await importWorker.close();
  await emailWorker.close();
  await checkoutReminderWorker.close();
  await checkoutQueue.close();
  await trialReminderWorker.close();
  await trialReminderQueue.close();
  await weeklySummaryWorker.close();
  await weeklySummaryQueue.close();
  await mongoose.disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  captureError(error, { process: { type: 'unhandledRejection' } });
});
process.on('uncaughtException', (error) => {
  captureError(error, { process: { type: 'uncaughtException' } });
});
