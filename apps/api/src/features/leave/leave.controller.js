import mongoose from 'mongoose';
import Leave, { LEAVE_ENTITLEMENTS, LEAVE_TYPES } from './Leave.model.js';
import User from '../users/User.model.js';
import SchoolSettings from '../settings/SchoolSettings.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { ROLES } from '../../constants/index.js';

const APPROVER_ROLES = [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.HEADTEACHER, ROLES.DEPUTY_HEADTEACHER];

// Returns the number of Mon–Fri non-holiday days between two date strings inclusive
function countWorkingDays(startStr, endStr, holidays = []) {
  const holidaySet = new Set(
    holidays.map((h) => new Date(h.date).toISOString().split('T')[0])
  );
  let count = 0;
  const cur  = new Date(startStr);
  const last = new Date(endStr);
  cur.setHours(0, 0, 0, 0);
  last.setHours(0, 0, 0, 0);
  while (cur <= last) {
    const d = cur.getDay();
    const dateStr = cur.toISOString().split('T')[0];
    if (d !== 0 && d !== 6 && !holidaySet.has(dateStr)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Compute leave balances for a staff member in a given year
async function computeBalances(staffId, schoolId, year) {
  const rows = await Leave.aggregate([
    {
      $match: {
        staffId:  new mongoose.Types.ObjectId(staffId),
        schoolId: new mongoose.Types.ObjectId(schoolId),
        year,
        status: 'approved',
      },
    },
    { $group: { _id: '$leaveType', used: { $sum: '$workingDays' } } },
  ]);

  const usedMap = Object.fromEntries(rows.map((r) => [r._id, r.used]));

  return LEAVE_TYPES.map((type) => {
    const entitlement = LEAVE_ENTITLEMENTS[type];
    const used        = usedMap[type] ?? 0;
    return { leaveType: type, entitlement, used, remaining: Math.max(0, entitlement - used) };
  });
}

// ── POST /api/v1/leave ────────────────────────────────────────────────────────
export const applyLeave = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, reason, supportingDocUrl } = req.body;
  const staffId  = req.user._id;
  const schoolId = req.user.schoolId;

  // Validate date range
  if (new Date(startDate) > new Date(endDate)) {
    return sendError(res, 'End date cannot be before start date', 400);
  }

  // Reject past leave applications (more than 7 days in the past)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  if (new Date(startDate) < cutoff) {
    return sendError(res, 'Leave cannot be applied for dates more than 7 days in the past', 400);
  }

  const schoolSettings = await SchoolSettings.findOne({ schoolId }).lean();
  const holidays = schoolSettings?.holidays ?? [];
  const workingDays = countWorkingDays(startDate, endDate, holidays);
  if (workingDays < 1) {
    return sendError(res, 'Selected dates fall entirely on weekends or public holidays. Please choose working days.', 400);
  }

  // Check for overlapping pending/approved leaves
  const overlap = await Leave.findOne({
    staffId,
    schoolId,
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: new Date(endDate) },
    endDate:   { $gte: new Date(startDate) },
  });
  if (overlap) {
    return sendError(res, 'You already have a pending or approved leave that overlaps with these dates', 409);
  }

  const year   = new Date(startDate).getFullYear();
  const record = await Leave.create({
    staffId, schoolId, leaveType, startDate, endDate,
    workingDays, reason, supportingDocUrl, year,
  });

  return sendSuccess(res, { leave: record }, 201);
});

// ── GET /api/v1/leave ─────────────────────────────────────────────────────────
// Staff: own leaves. Admin: all school leaves with filters.
export const listLeaves = asyncHandler(async (req, res) => {
  const { role, _id: userId, schoolId } = req.user;
  const isApprover = APPROVER_ROLES.includes(role);

  const { status, leaveType, staffId, from, to, page = 1, limit = 30 } = req.query;

  const filter = { schoolId };

  if (isApprover) {
    if (staffId) filter.staffId = staffId;
  } else {
    filter.staffId = userId;
  }

  if (status)    filter.status    = status;
  if (leaveType) filter.leaveType = leaveType;
  if (from || to) {
    filter.startDate = {};
    if (from) filter.startDate.$gte = new Date(from);
    if (to)   filter.startDate.$lte = new Date(to);
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [leaves, total] = await Promise.all([
    Leave.find(filter)
      .populate('staffId',   'firstName lastName role')
      .populate('approvedBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    Leave.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    leaves,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// ── GET /api/v1/leave/balances ────────────────────────────────────────────────
export const getBalances = asyncHandler(async (req, res) => {
  const { role, _id: userId, schoolId } = req.user;
  const isApprover = APPROVER_ROLES.includes(role);

  // Admin can query any staff member's balance
  const targetId = (isApprover && req.query.staffId) ? req.query.staffId : String(userId);
  const year     = Number(req.query.year) || new Date().getFullYear();

  const balances = await computeBalances(targetId, String(schoolId), year);
  return sendSuccess(res, { balances, year });
});

// ── GET /api/v1/leave/pending-count ──────────────────────────────────────────
export const getPendingCount = asyncHandler(async (req, res) => {
  const count = await Leave.countDocuments({ schoolId: req.user.schoolId, status: 'pending' });
  return sendSuccess(res, { count });
});

// ── GET /api/v1/leave/on-leave-today ─────────────────────────────────────────
export const getOnLeaveToday = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const leaves = await Leave.find({
    schoolId: req.user.schoolId,
    status:   'approved',
    startDate: { $lte: tomorrow },
    endDate:   { $gte: today },
  })
    .populate('staffId', 'firstName lastName role')
    .lean();

  return sendSuccess(res, { leaves, count: leaves.length });
});

// ── GET /api/v1/leave/:id ─────────────────────────────────────────────────────
export const getLeave = asyncHandler(async (req, res) => {
  const { _id: userId, role, schoolId } = req.user;
  const isApprover = APPROVER_ROLES.includes(role);

  const leave = await Leave.findOne({ _id: req.params.id, schoolId })
    .populate('staffId',   'firstName lastName role')
    .populate('approvedBy', 'firstName lastName')
    .lean();

  if (!leave) return sendError(res, 'Leave record not found', 404);

  // Staff can only view their own leave
  if (!isApprover && String(leave.staffId?._id ?? leave.staffId) !== String(userId)) {
    return sendError(res, 'Not authorised', 403);
  }

  return sendSuccess(res, { leave });
});

// ── PATCH /api/v1/leave/:id/approve ──────────────────────────────────────────
export const approveLeave = asyncHandler(async (req, res) => {
  const { comment } = req.body;

  const leave = await Leave.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!leave) return sendError(res, 'Leave record not found', 404);
  if (leave.status !== 'pending') return sendError(res, `Leave is already ${leave.status}`, 400);

  leave.status          = 'approved';
  leave.approvedBy      = req.user._id;
  leave.approvedAt      = new Date();
  leave.approverComment = comment?.trim() || undefined;
  await leave.save();

  const populated = await leave.populate([
    { path: 'staffId',   select: 'firstName lastName role' },
    { path: 'approvedBy', select: 'firstName lastName' },
  ]);

  return sendSuccess(res, { leave: populated });
});

// ── PATCH /api/v1/leave/:id/reject ───────────────────────────────────────────
export const rejectLeave = asyncHandler(async (req, res) => {
  const { comment } = req.body;

  const leave = await Leave.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!leave) return sendError(res, 'Leave record not found', 404);
  if (leave.status !== 'pending') return sendError(res, `Leave is already ${leave.status}`, 400);

  leave.status          = 'rejected';
  leave.approvedBy      = req.user._id;
  leave.approvedAt      = new Date();
  leave.approverComment = comment;
  await leave.save();

  return sendSuccess(res, { leave });
});

// ── DELETE /api/v1/leave/:id ──────────────────────────────────────────────────
// Staff can cancel their own pending leave
export const cancelLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findOne({
    _id:      req.params.id,
    staffId:  req.user._id,
    schoolId: req.user.schoolId,
  });
  if (!leave) return sendError(res, 'Leave record not found', 404);
  if (leave.status !== 'pending') {
    return sendError(res, 'Only pending leave requests can be cancelled', 400);
  }

  leave.status = 'cancelled';
  await leave.save();

  return sendSuccess(res, { message: 'Leave request cancelled' });
});
