import { JOB_NAMES } from '../constants/index.js';
import { emailQueue } from '../jobs/queues.js';
import {
  sendInviteEmail,
  sendParentEnrollmentEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendTrialDay3Email,
  sendTrialMidpointEmail,
  sendTrialExpiryEmail,
  sendSystemEventEmail,
  sendNewSchoolInviteEmail,
} from '../services/email.service.js';
import logger from '../config/logger.js';

const errorMessage = (err) => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return err?.message ?? err?.error?.message ?? JSON.stringify(err ?? {});
};

const sendDirect = (type, payload) => {
  switch (type) {
    case JOB_NAMES.SEND_INVITE_EMAIL:
      return sendInviteEmail(payload);
    case JOB_NAMES.SEND_PARENT_ENROLLMENT_EMAIL:
      return sendParentEnrollmentEmail(payload);
    case JOB_NAMES.SEND_RESET_EMAIL:
      return sendPasswordResetEmail(payload);
    case JOB_NAMES.SEND_VERIFICATION_EMAIL:
      return sendVerificationEmail(payload);
    case JOB_NAMES.SEND_WELCOME_EMAIL:
      return sendWelcomeEmail(payload);
    case JOB_NAMES.SEND_TRIAL_DAY3_EMAIL:
      return sendTrialDay3Email(payload);
    case JOB_NAMES.SEND_TRIAL_MIDPOINT_EMAIL:
      return sendTrialMidpointEmail(payload);
    case JOB_NAMES.SEND_TRIAL_EXPIRY_EMAIL:
      return sendTrialExpiryEmail(payload);
    case JOB_NAMES.SEND_SYSTEM_EVENT_EMAIL:
      return sendSystemEventEmail(payload);
    case JOB_NAMES.SEND_NEW_SCHOOL_INVITE_EMAIL:
      return sendNewSchoolInviteEmail(payload);
    default:
      throw new Error(`Unknown email job type: ${type}`);
  }
};

export const enqueueEmail = (type, payload) =>
  emailQueue.add(type, { type, payload });

export const queueEmailWithDirectFallback = (type, payload, context = 'Email') => {
  Promise.resolve()
    .then(() => enqueueEmail(type, payload))
    .catch(async (queueErr) => {
      logger.error(`[${context}] Email queue failed; sending directly`, {
        type,
        to: payload?.to,
        err: errorMessage(queueErr),
      });

      try {
        await sendDirect(type, payload);
      } catch (sendErr) {
        logger.error(`[${context}] Direct email fallback failed`, {
          type,
          to: payload?.to,
          err: errorMessage(sendErr),
        });
      }
    });
};
