/**
 * Parent Portal — read-only API for parents/guardians.
 *
 * All endpoints verify that the requested studentId is in req.user.children
 * (the parent's own linked children). No cross-tenant leakage is possible
 * because the student lookup always filters by schoolId AND _id.
 */
import Student from '../students/Student.model.js';
import Attendance from '../attendance/Attendance.model.js';
import Result from '../results/Result.model.js';
import Payment from '../fees/Payment.model.js';
import FeeStructure from '../fees/FeeStructure.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import { PAYMENT_STATUSES } from '../../constants/index.js';

// ── Guard helper — verify student belongs to this parent ──────────────────────

const resolveChild = async (req, studentId) => {
  // Parent's children array is set at enrollment time
  const isLinked = req.user.children?.some((id) => id.toString() === studentId);
  if (!isLinked) return null;

  return Student.findOne({ _id: studentId, schoolId: req.user.schoolId })
    .populate('classId', 'name stream levelCategory academicYear term');
};

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/parent/children
 * Lists all students linked to the logged-in parent.
 */
export const getMyChildren = asyncHandler(async (req, res) => {
  const children = await Student.find({
    _id: { $in: req.user.children ?? [] },
    schoolId: req.user.schoolId,
  })
    .populate('classId', 'name stream levelCategory academicYear term')
    .sort({ lastName: 1, firstName: 1 });

  return sendSuccess(res, { children });
});

/**
 * GET /api/v1/parent/children/:studentId/fees
 * Fee balance summary for a child.
 * Query: ?academicYear=2025&term=Term%201
 */
export const getChildFees = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  // Default to current year / Term 1 when not supplied by client
  const currentYear = String(new Date().getFullYear());
  const academicYear = req.query.academicYear || currentYear;
  const term = req.query.term || 'Term 1';

  const student = await resolveChild(req, studentId);
  if (!student) return sendError(res, 'Child not found.', 404);

  const structure = await FeeStructure.findOne({
    schoolId: req.user.schoolId,
    classId: student.classId,
    academicYear,
    term,
  });

  const [agg] = await Payment.aggregate([
    {
      $match: {
        schoolId: req.user.schoolId,
        studentId: student._id,
        academicYear,
        term,
        status: PAYMENT_STATUSES.COMPLETED,
      },
    },
    { $group: { _id: null, totalPaid: { $sum: '$amount' } } },
  ]);

  const totalPaid = agg?.totalPaid ?? 0;
  const totalBilled = structure?.totalAmount ?? 0;
  const balance = Math.max(0, totalBilled - totalPaid);

  // Recent payments (latest 10 — enough for parent view)
  const payments = await Payment.find({
    schoolId: req.user.schoolId,
    studentId: student._id,
    academicYear,
    term,
    status: PAYMENT_STATUSES.COMPLETED,
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('amount method reference createdAt paidAt receiptUrl description');

  return sendSuccess(res, {
    student: {
      _id: student._id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
    },
    academicYear,
    term,
    totalBilled,
    totalPaid,
    balance,
    isPaidUp: balance === 0,
    payments,
  });
});

/**
 * GET /api/v1/parent/children/:studentId/attendance
 * Attendance summary and register list for a child.
 * Query: ?academicYear=2025&term=Term%201
 */
export const getChildAttendance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { academicYear, term } = req.query;

  const student = await resolveChild(req, studentId);
  if (!student) return sendError(res, 'Child not found.', 404);

  const filter = {
    schoolId: req.user.schoolId,
    'entries.studentId': student._id,
    status: 'submitted', // only show finalised registers
  };
  if (academicYear) filter.academicYear = academicYear;
  if (term) filter.term = term;

  const registers = await Attendance.find(filter)
    .sort({ date: -1 })
    .limit(200)
    .select('date academicYear term entries');

  // Flatten to this student's entry per day
  const records = registers.map((r) => {
    const entry = r.entries.find((e) => e.studentId.toString() === studentId);
    return {
      _id: r._id,
      date: r.date,
      academicYear: r.academicYear,
      term: r.term,
      status: entry?.status ?? 'unknown',
      note: entry?.note,
    };
  });

  // Compute summary counts
  const summary = records.reduce(
    (acc, r) => {
      const s = r.status;
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, excused: 0 }
  );

  return sendSuccess(res, {
    student: { firstName: student.firstName, lastName: student.lastName },
    summary,
    records,
  });
});

/**
 * GET /api/v1/parent/children/:studentId/results
 * Exam results for a child.
 * Query: ?academicYear=2025&term=Term%201
 */
export const getChildResults = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { academicYear, term } = req.query;

  const student = await resolveChild(req, studentId);
  if (!student) return sendError(res, 'Child not found.', 404);

  const filter = { schoolId: req.user.schoolId, studentId: student._id };
  if (academicYear) filter.academicYear = academicYear;
  if (term) filter.term = term;

  const total = await Result.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const results = await Result.find(filter)
    .sort({ academicYear: -1, term: -1, percentage: -1 })
    .skip(skip)
    .limit(limit)
    .populate('examId', 'name type term academicYear')
    .populate('subjectId', 'name code');

  return sendSuccess(res, {
    student: { firstName: student.firstName, lastName: student.lastName },
    results,
    meta,
  });
});
