/**
 * SMS Outbound Controller
 *
 * POST /api/v1/sms/send      — single message to one phone number
 * POST /api/v1/sms/broadcast — bulk to class parents, all parents, or all staff
 * GET  /api/v1/sms/history   — paginated log of sent messages
 *
 * Roles: secretary, accountant, deputy_headteacher, headteacher, director, school_admin
 */
import Student from '../students/Student.model.js';
import User from '../users/User.model.js';
import SmsLog from './SmsLog.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { smsQueue } from '../../jobs/queues.js';
import { env } from '../../config/env.js';
import logger from '../../config/logger.js';
import { SMS_TRIGGER_TYPES, JOB_NAMES, STUDENT_STATUSES } from '../../constants/index.js';
import { paginate } from '../../utils/pagination.js';
import { normalisePhone, isValidKenyanPhone } from './sms-inbound.controller.js';

const AT_CHUNK_SIZE = 200; // Africa's Talking recommended batch size

function atConfigured() {
  return !!(env.AT_USERNAME && env.AT_API_KEY);
}

function collectGuardianPhones(students) {
  const phones = new Set();
  for (const student of students) {
    for (const g of (student.guardians ?? [])) {
      const p = normalisePhone(g.phone);
      if (p && isValidKenyanPhone(p)) phones.add(p);
    }
  }
  return [...phones];
}

async function queueChunked({ to, message, schoolId, trigger, smsLogId }) {
  const recipients = Array.isArray(to) ? to : [to];
  for (let i = 0; i < recipients.length; i += AT_CHUNK_SIZE) {
    await smsQueue.add(JOB_NAMES.SEND_SMS, {
      to: recipients.slice(i, i + AT_CHUNK_SIZE),
      message,
      schoolId,
      trigger,
      smsLogId,
    });
  }
}

/**
 * POST /api/v1/sms/send
 * Body: { to: string, message: string }
 */
export const sendSingle = asyncHandler(async (req, res) => {
  if (!atConfigured()) {
    return sendError(res, 'SMS service is not configured on this server.', 503);
  }

  const { to, message } = req.body;
  const phone = normalisePhone(to);

  if (!phone || !isValidKenyanPhone(phone)) {
    return sendError(res, `Invalid Kenyan phone number: ${to}. Use format 07XX or +2547XX.`, 400);
  }

  const log = await SmsLog.create({
    schoolId: req.user.schoolId,
    trigger: SMS_TRIGGER_TYPES.CUSTOM_BROADCAST,
    target: 'single',
    message,
    recipientCount: 1,
    sentByUserId: req.user._id,
    status: 'queued',
  });

  await queueChunked({
    to: phone,
    message,
    schoolId: req.user.schoolId.toString(),
    trigger: SMS_TRIGGER_TYPES.CUSTOM_BROADCAST,
    smsLogId: log._id.toString(),
  });

  logger.info('[SMS-OUTBOUND] Single message queued', { schoolId: req.user.schoolId, phone });

  return sendSuccess(res, { smsLogId: log._id, recipientCount: 1 });
});

/**
 * POST /api/v1/sms/broadcast
 * Body: { target: 'class_parents'|'all_parents'|'all_staff', classId?: string, message: string }
 */
export const broadcastSms = asyncHandler(async (req, res) => {
  if (!atConfigured()) {
    return sendError(res, 'SMS service is not configured on this server.', 503);
  }

  const { target, classId, message } = req.body;
  const schoolId = req.user.schoolId;

  let phones = [];

  if (target === 'class_parents') {
    const students = await Student.find({
      schoolId, classId, status: STUDENT_STATUSES.ACTIVE,
    }).select('guardians');
    phones = collectGuardianPhones(students);
  } else if (target === 'all_parents') {
    const students = await Student.find({
      schoolId, status: STUDENT_STATUSES.ACTIVE,
    }).select('guardians');
    phones = collectGuardianPhones(students);
  } else if (target === 'all_staff') {
    const users = await User.find({ schoolId, isActive: true, role: { $ne: 'parent' } }).select('phone');
    const staffPhones = new Set();
    for (const u of users) {
      const p = normalisePhone(u.phone);
      if (p && isValidKenyanPhone(p)) staffPhones.add(p);
    }
    phones = [...staffPhones];
  }

  if (phones.length === 0) {
    return sendError(res, 'No valid recipients found for the selected target.', 422);
  }

  const log = await SmsLog.create({
    schoolId,
    trigger: SMS_TRIGGER_TYPES.CUSTOM_BROADCAST,
    target,
    classId: target === 'class_parents' ? classId : undefined,
    message,
    recipientCount: phones.length,
    sentByUserId: req.user._id,
    status: 'queued',
  });

  await queueChunked({
    to: phones,
    message,
    schoolId: schoolId.toString(),
    trigger: SMS_TRIGGER_TYPES.CUSTOM_BROADCAST,
    smsLogId: log._id.toString(),
  });

  logger.info('[SMS-OUTBOUND] Broadcast queued', {
    target, recipientCount: phones.length, schoolId,
  });

  return sendSuccess(res, { smsLogId: log._id, recipientCount: phones.length });
});

/**
 * GET /api/v1/sms/history
 * Returns paginated SMS log for the school.
 */
export const smsHistory = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;
  const total = await SmsLog.countDocuments({ schoolId });
  const { skip, limit, meta } = paginate(req.query, total);

  const logs = await SmsLog.find({ schoolId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sentByUserId', 'firstName lastName')
    .populate('classId', 'name');

  return sendSuccess(res, { logs, meta });
});
