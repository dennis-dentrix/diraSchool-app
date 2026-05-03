/**
 * School-admin dashboard controller.
 *
 * GET /api/v1/dashboard
 *
 * Returns a summary of the authenticated user's school:
 *   - school info (name, status, plan, trial expiry)
 *   - staff counts by role
 *   - student count (total + by status)
 *   - fee summary (collected, target, by class, recent payments)
 *   - pending actions
 *
 * Accessible to all admin roles (school_admin, director, headteacher, deputy_headteacher).
 */
import School        from '../schools/School.model.js';
import User          from '../users/User.model.js';
import Student       from '../students/Student.model.js';
import Payment       from '../fees/Payment.model.js';
import FeeStructure  from '../fees/FeeStructure.model.js';
import Attendance    from '../attendance/Attendance.model.js';
import Timetable     from '../timetable/Timetable.model.js';
import LessonPlan    from '../lesson-plans/LessonPlan.model.js';
import Class         from '../classes/Class.model.js';
import asyncHandler  from '../../utils/asyncHandler.js';
import { sendSuccess, sendError, sendForbidden } from '../../utils/response.js';
import { ADMIN_ROLES, ROLES, CACHE_TTL } from '../../constants/index.js';
import { cacheGet, cacheSet } from '../../config/redis.js';

const FINANCE_ROLES = [ROLES.SECRETARY, ROLES.ACCOUNTANT];

export const getDashboard = asyncHandler(async (req, res) => {
  // Secretary and accountant get a fee-focused summary instead of full admin dashboard
  if (FINANCE_ROLES.includes(req.user.role)) {
    return getFinanceDashboard(req, res);
  }

  if (!ADMIN_ROLES.includes(req.user.role)) {
    return sendForbidden(res, 'Dashboard is only available to school administrators.');
  }

  const schoolId = req.user.schoolId;

  // Serve from cache if available — prevents simultaneous page renders firing 8+ aggregations each
  const cacheKey = `dashboard:admin:${schoolId}`;
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) return sendSuccess(res, cached);
  } catch { /* Redis unavailable — proceed to DB */ }
  const currentYear = String(new Date().getFullYear());
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [school, staffByRole, studentStats, pendingUsers, feeStructures, paymentStats, studentsByClass, studentsWithPayments] = await Promise.all([
    School.findById(schoolId)
      .select('name email phone county subscriptionStatus planTier trialExpiry isActive createdAt')
      .lean(),

    User.aggregate([
      { $match: { schoolId, isActive: true } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort:  { _id: 1 } },
    ]),

    Student.aggregate([
      { $match: { schoolId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    User.countDocuments({
      schoolId,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: { $exists: false },
    }),

    // Fee structures for current year — to compute targets per class
    FeeStructure.find({ schoolId, academicYear: currentYear })
      .populate('classId', 'name stream')
      .lean(),

    // Payment aggregation — totals, method breakdown, and recent
    Payment.aggregate([
      { $match: { schoolId } },
      {
        $facet: {
          allTime:   [{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }],
          today:     [{ $match: { status: 'completed', createdAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }],
          month:     [{ $match: { status: 'completed', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }],
          byClass:   [{ $match: { status: 'completed' } }, { $group: { _id: '$classId', collected: { $sum: '$amount' } } }],
          byMethod:  [{ $match: { status: 'completed' } }, { $group: { _id: '$method', total: { $sum: '$amount' } } }],
          pending:   [{ $match: { status: 'pending' } }, { $group: { _id: null, count: { $sum: 1 } } }],
          recent: [
            { $match: { status: 'completed' } },
            { $sort: { createdAt: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 'student' } },
            { $unwind: '$student' },
            { $project: { amount: 1, method: 1, status: 1, createdAt: 1, 'student.firstName': 1, 'student.lastName': 1 } },
          ],
        },
      },
    ]),

    // Active student count per class
    Student.aggregate([
      { $match: { schoolId, status: 'active' } },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
    ]),

    // Distinct students who have made at least one payment this year (per class)
    Payment.aggregate([
      { $match: { schoolId, academicYear: currentYear, status: 'completed' } },
      { $group: { _id: { classId: '$classId', studentId: '$studentId' } } },
      { $group: { _id: '$_id.classId', paidCount: { $sum: 1 } } },
    ]),
  ]);

  if (!school) return sendError(res, 'School not found.', 404);

  // ── Trial expiry ───────────────────────────────────────────────────────────
  const trialDaysLeft =
    school.subscriptionStatus === 'trial' && school.trialExpiry
      ? Math.max(0, Math.ceil((new Date(school.trialExpiry) - new Date()) / (1000 * 60 * 60 * 24)))
      : null;

  // ── Staff summary ──────────────────────────────────────────────────────────
  const staffSummary = staffByRole.reduce(
    (acc, { _id, count }) => { acc.byRole[_id] = count; acc.total += count; return acc; },
    { total: 0, byRole: {} }
  );

  // ── Student summary ────────────────────────────────────────────────────────
  const studentSummary = studentStats.reduce(
    (acc, { _id, count }) => { acc.byStatus[_id ?? 'unknown'] = count; acc.total += count; return acc; },
    { total: 0, byStatus: {} }
  );

  // ── Fee summary ────────────────────────────────────────────────────────────
  const facet = paymentStats[0] ?? {};
  const totalCollected  = facet.allTime?.[0]?.total  ?? 0;
  const todayAmount     = facet.today?.[0]?.total    ?? 0;
  const monthAmount     = facet.month?.[0]?.total    ?? 0;
  const pendingReceipts = facet.pending?.[0]?.count  ?? 0;

  const methodBreakdown = Object.fromEntries(
    (facet.byMethod ?? []).map((m) => [m._id ?? 'unknown', m.total])
  );

  // Build lookup maps
  const studentCountMap = Object.fromEntries(studentsByClass.map((s) => [String(s._id), s.count]));
  const collectedMap    = Object.fromEntries((facet.byClass ?? []).map((p) => [String(p._id), p.collected]));
  const paidCountMap    = Object.fromEntries(studentsWithPayments.map((p) => [String(p._id), p.paidCount]));

  // Aggregate fee structures by classId (sum across terms)
  const targetByClass = {};
  for (const fs of feeStructures) {
    if (!fs.classId) continue;
    const id = String(fs.classId._id);
    if (!targetByClass[id]) {
      targetByClass[id] = {
        name: `${fs.classId.name}${fs.classId.stream ? ` ${fs.classId.stream}` : ''}`,
        totalPerStudent: 0,
      };
    }
    targetByClass[id].totalPerStudent += fs.totalAmount;
  }

  let totalTarget = 0;
  let studentsOverdue = 0;
  let amountOverdue = 0;
  const byClass = {};

  for (const [classId, data] of Object.entries(targetByClass)) {
    const studentCount = studentCountMap[classId] ?? 0;
    const target       = data.totalPerStudent * studentCount;
    const collected    = collectedMap[classId]  ?? 0;
    const paidCount    = paidCountMap[classId]  ?? 0;
    const unpaid       = studentCount - paidCount;

    totalTarget    += target;
    studentsOverdue += unpaid;
    amountOverdue  += Math.max(0, target - collected);

    if (studentCount > 0 && target > 0) {
      byClass[data.name] = {
        percent:   Math.min(100, Math.round((collected / target) * 100)),
        paidCount,
        total: studentCount,
      };
    }
  }

  const recentPayments = (facet.recent ?? []).map((p) => ({
    name:   `${p.student.firstName} ${p.student.lastName}`,
    amount: p.amount,
    method: p.method,
    time:   new Date(p.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
    status: p.status,
  }));

  const fees = {
    totalCollected,
    totalTarget,
    studentsOverdue,
    amountOverdue,
    studentsToFollowUp: studentsOverdue,
    pendingReceipts,
    methodBreakdown,
    todayAmount,
    monthAmount,
    byClass,
    recentPayments,
  };

  const payload = {
    school: {
      _id:                school._id,
      name:               school.name,
      email:              school.email,
      phone:              school.phone,
      county:             school.county,
      subscriptionStatus: school.subscriptionStatus,
      planTier:           school.planTier,
      trialExpiry:        school.trialExpiry,
      trialDaysLeft,
      isActive:           school.isActive,
      createdAt:          school.createdAt,
    },
    fees,
    staff:    staffSummary,
    students: studentSummary,
    alerts: {
      staffAwaitingFirstLogin: pendingUsers,
      trialExpiringSoon: trialDaysLeft !== null && trialDaysLeft <= 7,
    },
  };

  try { await cacheSet(cacheKey, payload, CACHE_TTL.DASHBOARD); } catch { /* non-fatal */ }

  return sendSuccess(res, payload);
});

// ── Finance dashboard (accountant) / Secretary dashboard ─────────────────────
async function getFinanceDashboard(req, res) {
  const schoolId    = req.user.schoolId;
  const isSecretary = req.user.role === ROLES.SECRETARY;

  const cacheKey = `dashboard:finance:${schoolId}:${req.user.role}`;
  try {
    const cached = await cacheGet(cacheKey);
    if (cached) return sendSuccess(res, cached);
  } catch { /* Redis unavailable — proceed to DB */ }

  const now         = new Date();
  const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentYear = String(now.getFullYear());

  const basePromises = [
    School.findById(schoolId).select('name subscriptionStatus planTier settings').lean(),
    Student.countDocuments({ schoolId, status: 'active' }),
    Payment.aggregate([
      { $match: { schoolId } },
      {
        $facet: {
          allTime:   [{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }],
          today:     [{ $match: { status: 'completed', createdAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }],
          week:      [{ $match: { status: 'completed', createdAt: { $gte: weekStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }],
          month:     [{ $match: { status: 'completed', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }],
          pending:   [{ $match: { status: 'pending' } }, { $group: { _id: null, count: { $sum: 1 } } }],
          byMethod:  [{ $match: { status: 'completed' } }, { $group: { _id: '$method', total: { $sum: '$amount' } } }],
          mpesaToday: [
            { $match: { status: 'completed', method: 'mpesa', createdAt: { $gte: todayStart } } },
            { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
          ],
          recent: [
            { $match: { status: 'completed' } },
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            { $lookup: { from: 'students', localField: 'studentId', foreignField: '_id', as: 'student' } },
            { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
            { $project: { amount: 1, method: 1, status: 1, createdAt: 1, receiptNumber: 1, 'student.firstName': 1, 'student.lastName': 1, 'student.admissionNumber': 1 } },
          ],
        },
      },
    ]),
    Payment.distinct('studentId', { schoolId, academicYear: currentYear, status: 'completed' }),
    // Fee structures for current year → compute per-class targets
    FeeStructure.find({ schoolId, academicYear: currentYear }).populate('classId', 'name stream').lean(),
    // Active students per class
    Student.aggregate([
      { $match: { schoolId, status: 'active' } },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
    ]),
    // Collected per class (current year)
    Payment.aggregate([
      { $match: { schoolId, academicYear: currentYear, status: 'completed' } },
      { $group: { _id: '$classId', collected: { $sum: '$amount' } } },
    ]),
    // Distinct students who paid (per class, current year)
    Payment.aggregate([
      { $match: { schoolId, academicYear: currentYear, status: 'completed' } },
      { $group: { _id: { classId: '$classId', studentId: '$studentId' } } },
      { $group: { _id: '$_id.classId', paidCount: { $sum: 1 } } },
    ]),
    // Top 10 defaulters — students with largest outstanding balance this year
    Student.aggregate([
      { $match: { schoolId, status: 'active' } },
      { $lookup: {
        from: 'feestructures',
        let: { cid: '$classId' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$schoolId', schoolId] }, { $eq: ['$classId', '$$cid'] }, { $eq: ['$academicYear', currentYear] }] } } },
          { $group: { _id: null, target: { $sum: '$totalAmount' } } },
        ],
        as: 'feeTarget',
      }},
      { $unwind: { path: '$feeTarget', preserveNullAndEmptyArrays: true } },
      { $match: { 'feeTarget.target': { $gt: 0 } } },
      { $lookup: {
        from: 'payments',
        let: { sid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$schoolId', schoolId] }, { $eq: ['$studentId', '$$sid'] }, { $eq: ['$academicYear', currentYear] }, { $eq: ['$status', 'completed'] }] } } },
          { $group: { _id: null, paid: { $sum: '$amount' }, lastDate: { $max: '$paymentDate' } } },
        ],
        as: 'payments',
      }},
      { $unwind: { path: '$payments', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'classes', localField: 'classId', foreignField: '_id', as: 'class' } },
      { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
      { $addFields: {
        paid:        { $ifNull: ['$payments.paid', 0] },
        target:      { $ifNull: ['$feeTarget.target', 0] },
        outstanding: { $max: [0, { $subtract: ['$feeTarget.target', { $ifNull: ['$payments.paid', 0] }] }] },
        lastPaymentDate: '$payments.lastDate',
      }},
      { $match: { outstanding: { $gt: 0 } } },
      { $sort: { outstanding: -1 } },
      { $limit: 10 },
      { $project: {
        firstName: 1, lastName: 1, admissionNumber: 1,
        className: { $concat: ['$class.name', { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$class.stream', ''] } }, 0] }, { $concat: [' ', '$class.stream'] }, ''] }] },
        target: 1, paid: 1, outstanding: 1, lastPaymentDate: 1,
      }},
    ]),
  ];

  // Secretary also needs attendance summary and recent student registrations
  const secretaryPromises = isSecretary ? [
    Attendance.aggregate([
      { $match: { schoolId, date: { $gte: todayStart } } },
      { $unwind: '$entries' },
      { $group: {
        _id: null,
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$entries.status', 'present'] }, 1, 0] } },
        absent:  { $sum: { $cond: [{ $eq: ['$entries.status', 'absent'] }, 1, 0] } },
        late:    { $sum: { $cond: [{ $eq: ['$entries.status', 'late'] }, 1, 0] } },
      }},
    ]),
    Student.find({ schoolId }).sort({ createdAt: -1 }).limit(5)
      .select('firstName lastName admissionNumber classId status createdAt').populate('classId', 'name stream').lean(),
    User.countDocuments({ schoolId, isActive: true }),
  ] : [];

  const results = await Promise.all([...basePromises, ...secretaryPromises]);

  const [
    school, studentCount, paymentStats, paidStudentIds,
    feeStructures, studentsByClass, collectedByClass, paidByClass,
    topDefaulters,
    ...secretaryResults
  ] = results;

  if (!school) return sendError(res, 'School not found.', 404);

  const facet = paymentStats[0] ?? {};

  // ── Per-class fee progress ─────────────────────────────────────────────────
  const studentCountMap = Object.fromEntries(studentsByClass.map((s) => [String(s._id), s.count]));
  const collectedMap    = Object.fromEntries(collectedByClass.map((p) => [String(p._id), p.collected]));
  const paidCountMap    = Object.fromEntries(paidByClass.map((p) => [String(p._id), p.paidCount]));

  const targetByClass = {};
  for (const fs of feeStructures) {
    if (!fs.classId) continue;
    const id = String(fs.classId._id);
    if (!targetByClass[id]) {
      targetByClass[id] = {
        name: `${fs.classId.name}${fs.classId.stream ? ` ${fs.classId.stream}` : ''}`,
        totalPerStudent: 0,
      };
    }
    targetByClass[id].totalPerStudent += fs.totalAmount;
  }

  let totalTarget = 0;
  const byClass = {};
  for (const [classId, data] of Object.entries(targetByClass)) {
    const total     = studentCountMap[classId] ?? 0;
    const target    = data.totalPerStudent * total;
    const collected = collectedMap[classId] ?? 0;
    const paidCount = paidCountMap[classId] ?? 0;
    totalTarget += target;
    if (total > 0 && target > 0) {
      byClass[data.name] = {
        percent:   Math.min(100, Math.round((collected / target) * 100)),
        paidCount,
        total,
        collected,
        target,
      };
    }
  }

  const totalCollected         = facet.allTime?.[0]?.total  ?? 0;
  const feeCollectionPercent   = totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0;

  const fees = {
    totalCollected,
    totalTarget,
    feeCollectionPercent,
    todayAmount:        facet.today?.[0]?.total   ?? 0,
    todayCount:         facet.today?.[0]?.count   ?? 0,
    weekAmount:         facet.week?.[0]?.total    ?? 0,
    monthAmount:        facet.month?.[0]?.total   ?? 0,
    monthCount:         facet.month?.[0]?.count   ?? 0,
    pendingReceipts:    facet.pending?.[0]?.count  ?? 0,
    mpesaToday:         facet.mpesaToday?.[0]?.count ?? 0,
    mpesaTodayAmount:   facet.mpesaToday?.[0]?.total ?? 0,
    studentsToFollowUp: Math.max(0, studentCount - (paidStudentIds?.length ?? 0)),
    methodBreakdown:    Object.fromEntries((facet.byMethod ?? []).map((m) => [m._id ?? 'unknown', m.total])),
    byClass,
    topDefaulters: topDefaulters.map((d) => ({
      _id:             String(d._id),
      name:            `${d.firstName} ${d.lastName}`,
      admissionNumber: d.admissionNumber,
      className:       d.className ?? '—',
      target:          d.target,
      paid:            d.paid,
      outstanding:     d.outstanding,
      lastPaymentDate: d.lastPaymentDate ?? null,
    })),
    recentPayments: (facet.recent ?? []).map((p) => ({
      name:            `${p.student?.firstName ?? '—'} ${p.student?.lastName ?? ''}`.trim(),
      admissionNumber: p.student?.admissionNumber,
      amount:          p.amount,
      method:          p.method,
      receiptNumber:   p.receiptNumber,
      time:            new Date(p.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
      date:            new Date(p.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' }),
      status:          p.status,
    })),
  };

  const secretaryData = isSecretary ? (() => {
    const [attendanceAgg, recentStudents, staffCount] = secretaryResults;
    const att = attendanceAgg?.[0] ?? {};
    return {
      attendance: {
        total:   att.total   ?? 0,
        present: att.present ?? 0,
        absent:  att.absent  ?? 0,
        late:    att.late    ?? 0,
        percent: att.total > 0 ? Math.round((att.present / att.total) * 100) : null,
      },
      recentStudents: (recentStudents ?? []).map((s) => ({
        _id:             String(s._id),
        name:            `${s.firstName} ${s.lastName}`,
        admissionNumber: s.admissionNumber,
        className:       s.classId ? `${s.classId.name}${s.classId.stream ? ` ${s.classId.stream}` : ''}` : '—',
        status:          s.status,
        joinedAt:        s.createdAt,
      })),
      staffCount: staffCount ?? 0,
    };
  })() : null;

  const financePayload = {
    school: { _id: school._id, name: school.name, subscriptionStatus: school.subscriptionStatus },
    fees,
    students:  { total: studentCount, activeCount: studentCount },
    staff:     { total: secretaryData?.staffCount ?? 0, byRole: {} },
    alerts:    { staffAwaitingFirstLogin: 0, trialExpiringSoon: false },
    secretary: secretaryData,
  };

  try { await cacheSet(cacheKey, financePayload, CACHE_TTL.DASHBOARD); } catch { /* non-fatal */ }

  return sendSuccess(res, financePayload);
}

// ── Teacher dashboard ─────────────────────────────────────────────────────────
export const getTeacherDashboard = asyncHandler(async (req, res) => {
  const teacherId = req.user._id;
  const schoolId  = req.user.schoolId;
  const now       = new Date();

  const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayName  = DAY_NAMES[now.getDay()];
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const currentYear = String(now.getFullYear());

  const [allTimetables, myClass, lessonPlansThisWeek] = await Promise.all([
    Timetable.find({ schoolId, 'slots.teacherId': teacherId })
      .populate('classId', 'name stream')
      .populate('slots.subjectId', 'name code')
      .lean(),
    Class.findOne({ classTeacherId: teacherId, schoolId, isActive: true }).lean(),
    LessonPlan.countDocuments({ schoolId, teacherId, createdAt: { $gte: weekStart } }),
  ]);

  // Build today's slots from all timetables this teacher appears in
  const todaySlots = [];
  for (const tt of allTimetables) {
    const className = tt.classId
      ? `${tt.classId.name}${tt.classId.stream ? ` ${tt.classId.stream}` : ''}`
      : '—';
    for (const slot of tt.slots) {
      if (String(slot.teacherId) !== String(teacherId)) continue;
      if (slot.day !== todayName) continue;
      todaySlots.push({
        period:      slot.period,
        startTime:   slot.startTime,
        endTime:     slot.endTime,
        subject:     slot.subjectId?.name ?? '—',
        subjectCode: slot.subjectId?.code ?? null,
        className,
        room:        slot.room ?? null,
      });
    }
  }
  todaySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Today's attendance register for the class this teacher is class teacher of
  let attendanceToday = null;
  let studentCount    = 0;

  if (myClass) {
    const [att, count] = await Promise.all([
      Attendance.findOne({ schoolId, classId: myClass._id, date: { $gte: todayStart, $lt: todayEnd } }).lean(),
      Student.countDocuments({ schoolId, classId: myClass._id, status: 'active' }),
    ]);
    studentCount = count;
    if (att) {
      const present = att.entries.filter((e) => e.status === 'present').length;
      const absent  = att.entries.filter((e) => e.status === 'absent').length;
      const late    = att.entries.filter((e) => e.status === 'late').length;
      attendanceToday = {
        submitted: att.status === 'submitted',
        status:    att.status,
        total:     att.entries.length,
        present,
        absent,
        late,
        percent:   att.entries.length > 0 ? Math.round((present / att.entries.length) * 100) : null,
      };
    }
  }

  return sendSuccess(res, {
    todaySlots,
    myClass: myClass ? {
      _id:          String(myClass._id),
      name:         myClass.name,
      stream:       myClass.stream ?? null,
      fullName:     `${myClass.name}${myClass.stream ? ` ${myClass.stream}` : ''}`,
      studentCount,
      attendanceToday,
    } : null,
    lessonPlansThisWeek,
    academicYear: currentYear,
  });
});
