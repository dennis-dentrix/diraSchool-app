import mongoose from 'mongoose';
import FeeStructure from './FeeStructure.model.js';
import Payment from './Payment.model.js';
import PaymentNotification from './PaymentNotification.model.js';
import Student from '../students/Student.model.js';
import Class from '../classes/Class.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import { PAYMENT_STATUSES, STUDENT_STATUSES, JOB_NAMES, AUDIT_ACTIONS, AUDIT_RESOURCES } from '../../constants/index.js';
import { receiptQueue } from '../../jobs/queues.js';
import { logAction } from '../../utils/auditLogger.js';

// ── Fee Structures ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/fees/structures
 * Defines the fee schedule for a class in a given term/year.
 */
export const createFeeStructure = asyncHandler(async (req, res) => {
  const { classId, academicYear, term, items } = req.body;

  // Verify class belongs to this school
  const cls = await Class.findOne({ _id: classId, schoolId: req.user.schoolId });
  if (!cls) return sendError(res, 'Class not found.', 404);

  const structure = await FeeStructure.create({
    schoolId: req.user.schoolId,
    classId,
    academicYear,
    term,
    items,
  });

  const populated = await FeeStructure.findById(structure._id).populate(
    'classId',
    'name stream levelCategory academicYear term'
  );

  return sendSuccess(res, { structure: populated }, 201);
});

/**
 * POST /api/v1/fees/structures/adapt
 * Copies fee structures from one academic year/term into a new year/term.
 *
 * Supports:
 *  - class-specific adaptation (classId provided), or
 *  - all classes in the school (classId omitted)
 *  - optional overwrite of existing target structures (blocked if payments exist)
 */
export const adaptFeeStructures = asyncHandler(async (req, res) => {
  const {
    fromAcademicYear,
    toAcademicYear,
    fromTerm,
    toTerm,
    classId,
    overwrite = false,
  } = req.body;

  const targetTerm = toTerm || fromTerm;

  if (fromAcademicYear === toAcademicYear && fromTerm === targetTerm) {
    return sendError(res, 'Source and target period are the same.', 400);
  }

  const sourceFilter = {
    schoolId: req.user.schoolId,
    academicYear: fromAcademicYear,
    term: fromTerm,
  };
  if (classId) sourceFilter.classId = classId;

  const sourceStructures = await FeeStructure.find(sourceFilter).lean();
  if (sourceStructures.length === 0) {
    return sendError(res, 'No source fee structures found for the selected period.', 404);
  }

  let created = 0;
  let updated = 0;
  let skippedExisting = 0;
  let blockedWithPayments = 0;

  for (const source of sourceStructures) {
    const targetFilter = {
      schoolId: req.user.schoolId,
      classId: source.classId,
      academicYear: toAcademicYear,
      term: targetTerm,
    };

    const existing = await FeeStructure.findOne(targetFilter);

    if (existing && !overwrite) {
      skippedExisting += 1;
      continue;
    }

    if (existing && overwrite) {
      const paymentCount = await Payment.countDocuments({
        schoolId: req.user.schoolId,
        classId: source.classId,
        academicYear: toAcademicYear,
        term: targetTerm,
        status: PAYMENT_STATUSES.COMPLETED,
      });

      if (paymentCount > 0) {
        blockedWithPayments += 1;
        continue;
      }

      existing.items = source.items.map((item) => ({
        category: item.category || 'School Fees',
        name: item.name,
        amount: item.amount,
      }));
      existing.notes = source.notes;
      await existing.save();
      updated += 1;
      continue;
    }

    await FeeStructure.create({
      schoolId: req.user.schoolId,
      classId: source.classId,
      academicYear: toAcademicYear,
      term: targetTerm,
      items: source.items.map((item) => ({
        category: item.category || 'School Fees',
        name: item.name,
        amount: item.amount,
      })),
      notes: source.notes,
    });
    created += 1;
  }

  return sendSuccess(res, {
    message: 'Fee structure adaptation completed.',
    summary: {
      sourceCount: sourceStructures.length,
      created,
      updated,
      skippedExisting,
      blockedWithPayments,
      overwrite,
      fromAcademicYear,
      fromTerm,
      toAcademicYear,
      toTerm: targetTerm,
    },
  });
});

/**
 * GET /api/v1/fees/structures
 */
export const listFeeStructures = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  if (req.query.term) filter.term = req.query.term;

  const total = await FeeStructure.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const structures = await FeeStructure.find(filter)
    .sort({ academicYear: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('classId', 'name stream levelCategory');

  return sendSuccess(res, { structures, meta });
});

/**
 * GET /api/v1/fees/structures/:id
 */
export const getFeeStructure = asyncHandler(async (req, res) => {
  const structure = await FeeStructure.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  }).populate('classId', 'name stream levelCategory academicYear term');

  if (!structure) return sendError(res, 'Fee structure not found.', 404);

  return sendSuccess(res, { structure });
});

/**
 * PATCH /api/v1/fees/structures/:id
 * Replaces the fee items (and recalculates totalAmount via pre-save hook).
 */
export const updateFeeStructure = asyncHandler(async (req, res) => {
  const structure = await FeeStructure.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!structure) return sendError(res, 'Fee structure not found.', 404);

  if (req.body.items !== undefined) {
    structure.items = req.body.items;
  }

  await structure.save(); // pre-save hook recalculates totalAmount

  return sendSuccess(res, { structure });
});

/**
 * DELETE /api/v1/fees/structures/:id
 * Blocked if any payments exist for this structure's term/year/class combo.
 */
export const deleteFeeStructure = asyncHandler(async (req, res) => {
  const structure = await FeeStructure.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!structure) return sendError(res, 'Fee structure not found.', 404);

  const paymentCount = await Payment.countDocuments({
    schoolId: req.user.schoolId,
    classId: structure.classId,
    academicYear: structure.academicYear,
    term: structure.term,
    status: PAYMENT_STATUSES.COMPLETED,
  });

  if (paymentCount > 0) {
    return sendError(
      res,
      `Cannot delete fee structure — ${paymentCount} payment(s) already recorded for this term.`,
      409
    );
  }

  await structure.deleteOne();
  return sendSuccess(res, { message: 'Fee structure deleted.' });
});

// ── Payments ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/fees/payments
 * Records a payment for a student in a specific term.
 */
export const createPayment = asyncHandler(async (req, res) => {
  const { studentId, academicYear, term, amount, method, paymentType, feeItemName, reference, notes, paymentDate } = req.body;

  // Verify the student belongs to this school and is active
  const student = await Student.findOne({
    _id: studentId,
    schoolId: req.user.schoolId,
    status: STUDENT_STATUSES.ACTIVE,
  });
  if (!student) return sendError(res, 'Active student not found in this school.', 404);

  const payment = await Payment.create({
    schoolId: req.user.schoolId,
    studentId,
    classId: student.classId,
    academicYear,
    term,
    amount,
    method,
    paymentType: paymentType || 'fees',
    feeItemName: paymentType === 'other' ? (feeItemName || undefined) : undefined,
    reference: reference || undefined,
    notes: notes || undefined,
    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
    status: PAYMENT_STATUSES.COMPLETED,
    recordedByUserId: req.user._id,
  });

  const populated = await Payment.findById(payment._id)
    .populate('studentId', 'firstName lastName admissionNumber')
    .populate('classId', 'name stream')
    .populate('recordedByUserId', 'firstName lastName role')
    .populate('receiptIssuedByUserId', 'firstName lastName role');

  logAction(req, {
    action: AUDIT_ACTIONS.CREATE,
    resource: AUDIT_RESOURCES.PAYMENT,
    resourceId: payment._id,
    meta: { amount, method, studentId: studentId.toString(), term, academicYear },
  });

  // Enqueue async PDF receipt generation (fire-and-forget — receipt arrives later via Cloudinary)
  try {
    await receiptQueue.add(JOB_NAMES.GENERATE_PDF, {
      paymentId: payment._id.toString(),
      schoolId: req.user.schoolId.toString(),
    });
  } catch {
    // Non-fatal — receipt generation will be retried or skipped; payment is already recorded
  }

  return sendSuccess(res, { payment: populated }, 201);
});

/**
 * GET /api/v1/fees/payments
 */
export const listPayments = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };
  if (req.query.studentId) filter.studentId = req.query.studentId;
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  if (req.query.term) filter.term = req.query.term;
  if (req.query.method) filter.method = req.query.method;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.paymentType) filter.paymentType = req.query.paymentType;
  if (req.query.search) {
    filter.reference = new RegExp(req.query.search.trim(), 'i');
  }
  if (req.query.dateFrom || req.query.dateTo) {
    filter.paymentDate = {};
    if (req.query.dateFrom) filter.paymentDate.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) {
      const end = new Date(req.query.dateTo);
      end.setHours(23, 59, 59, 999);
      filter.paymentDate.$lte = end;
    }
  }

  const total = await Payment.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const payments = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('studentId', 'firstName lastName admissionNumber')
    .populate('classId', 'name stream')
    .populate('recordedByUserId', 'firstName lastName role')
    .populate('receiptIssuedByUserId', 'firstName lastName role');

  return sendSuccess(res, { payments, meta });
});

/**
 * GET /api/v1/fees/payments/:id
 */
export const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  })
    .populate('studentId', 'firstName lastName admissionNumber')
    .populate('classId', 'name stream')
    .populate('recordedByUserId', 'firstName lastName role')
    .populate('receiptIssuedByUserId', 'firstName lastName role')
    .populate('reversedByUserId', 'firstName lastName role');

  if (!payment) return sendError(res, 'Payment not found.', 404);

  return sendSuccess(res, { payment });
});

/**
 * PATCH /api/v1/fees/payments/:id   (school_admin only)
 * Edits mutable fields on a payment. Reversed payments cannot be edited.
 */
export const updatePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!payment) return sendError(res, 'Payment not found.', 404);

  if (payment.status === PAYMENT_STATUSES.REVERSED) {
    return sendError(res, 'Reversed payments cannot be edited.', 400);
  }

  const EDITABLE = ['amount', 'method', 'reference', 'notes', 'paymentDate', 'payerName', 'payerPhone', 'feeItemName'];
  for (const field of EDITABLE) {
    if (req.body[field] !== undefined) {
      payment[field] = field === 'paymentDate' ? new Date(req.body[field]) : req.body[field];
    }
  }

  await payment.save();

  const populated = await Payment.findById(payment._id)
    .populate('studentId', 'firstName lastName admissionNumber')
    .populate('classId', 'name stream')
    .populate('recordedByUserId', 'firstName lastName role')
    .populate('receiptIssuedByUserId', 'firstName lastName role');

  logAction(req, {
    action: AUDIT_ACTIONS.UPDATE,
    resource: AUDIT_RESOURCES.PAYMENT,
    resourceId: payment._id,
    meta: { fields: Object.keys(req.body) },
  });

  return sendSuccess(res, { payment: populated });
});

/**
 * DELETE /api/v1/fees/payments/:id   (school_admin only)
 * Permanently removes a payment record.
 */
export const deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!payment) return sendError(res, 'Payment not found.', 404);

  logAction(req, {
    action: AUDIT_ACTIONS.DELETE,
    resource: AUDIT_RESOURCES.PAYMENT,
    resourceId: payment._id,
    meta: { amount: payment.amount, studentId: payment.studentId?.toString(), receiptNumber: payment.receiptNumber },
  });

  await payment.deleteOne();

  return sendSuccess(res, { message: 'Payment deleted.' });
});

/**
 * POST /api/v1/fees/payments/:id/reverse
 * Marks a completed payment as reversed (void/refund).
 */
export const reversePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!payment) return sendError(res, 'Payment not found.', 404);

  if (payment.status === PAYMENT_STATUSES.REVERSED) {
    return sendError(res, 'Payment is already reversed.', 400);
  }

  payment.status = PAYMENT_STATUSES.REVERSED;
  payment.reversalReason = req.body.reversalReason;
  payment.reversedByUserId = req.user._id;
  payment.reversedAt = new Date();
  await payment.save();

  logAction(req, {
    action: AUDIT_ACTIONS.REVERSE,
    resource: AUDIT_RESOURCES.PAYMENT,
    resourceId: payment._id,
    meta: { reason: req.body.reversalReason, amount: payment.amount },
  });

  return sendSuccess(res, { payment });
});

/**
 * POST /api/v1/fees/payments/:id/issue-receipt
 * Marks a payment receipt as issued. Reprints keep the original issuer.
 */
export const issueReceipt = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!payment) return sendError(res, 'Payment not found.', 404);

  if (!payment.receiptIssuedByUserId) {
    payment.receiptIssuedByUserId = req.user._id;
    payment.receiptIssuedAt = new Date();
    await payment.save();
  }

  const populated = await Payment.findById(payment._id)
    .populate('studentId', 'firstName lastName admissionNumber')
    .populate('classId', 'name stream')
    .populate('recordedByUserId', 'firstName lastName role')
    .populate('receiptIssuedByUserId', 'firstName lastName role')
    .populate('reversedByUserId', 'firstName lastName role');

  logAction(req, {
    action: AUDIT_ACTIONS.ISSUE,
    resource: AUDIT_RESOURCES.PAYMENT,
    resourceId: payment._id,
    meta: {
      receiptNumber: payment.receiptNumber ?? null,
      issuedByRole: req.user.role,
    },
  });

  return sendSuccess(res, { payment: populated });
});

// ── Balance ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/fees/balance?studentId=&academicYear=&term=
 * Computes outstanding fee balance for a student in a given term.
 *
 * balance = feeStructure.totalAmount - sum(completed payments)
 */
export const getStudentBalance = asyncHandler(async (req, res) => {
  const { studentId, academicYear, term } = req.query;

  // Verify student belongs to this school
  const student = await Student.findOne({
    _id: studentId,
    schoolId: req.user.schoolId,
  }).populate('classId', 'name stream');

  if (!student) return sendError(res, 'Student not found.', 404);

  // Look up the fee structure for the student's class + term/year
  const structure = await FeeStructure.findOne({
    schoolId: req.user.schoolId,
    classId: student.classId,
    academicYear,
    term,
  });

  // Aggregate completed payments
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
  const expectedFee = structure?.totalAmount ?? 0;
  const outstanding = Math.max(0, expectedFee - totalPaid);
  const overpaid = Math.max(0, totalPaid - expectedFee);

  return sendSuccess(res, {
    student: {
      _id: student._id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
      classId: student.classId,
    },
    academicYear,
    term,
    feeStructure: structure
      ? { _id: structure._id, totalAmount: structure.totalAmount, items: structure.items }
      : null,
    totalPaid,
    outstanding,
    overpaid,
    isPaidUp: outstanding === 0,
  });
});

/**
 * GET /api/v1/fees/bulk-stats?studentIds=id1,id2,...&academicYear=&term=
 * Returns fee payment stats for a batch of students (max 50).
 * academicYear and term are optional — omit to aggregate across all time.
 */
export const getBulkFeeStats = asyncHandler(async (req, res) => {
  const { studentIds, academicYear, term } = req.query;
  if (!studentIds) return sendSuccess(res, { stats: {} });

  const ids = studentIds.split(',').filter(Boolean).slice(0, 50);
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

  const paymentMatch = {
    schoolId: req.user.schoolId,
    studentId: { $in: objectIds },
    status: PAYMENT_STATUSES.COMPLETED,
  };
  if (academicYear) paymentMatch.academicYear = academicYear;
  if (term) paymentMatch.term = term;

  const [payments, students] = await Promise.all([
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: '$studentId', totalPaid: { $sum: '$amount' } } },
    ]),
    Student.find({ _id: { $in: objectIds }, schoolId: req.user.schoolId })
      .select('classId')
      .lean(),
  ]);

  const classIds = [...new Set(students.map((s) => s.classId?.toString()).filter(Boolean))];
  const structureMatch = { schoolId: req.user.schoolId, classId: { $in: classIds } };
  if (academicYear) structureMatch.academicYear = academicYear;
  if (term) structureMatch.term = term;

  const structures = await FeeStructure.find(structureMatch).select('classId totalAmount').lean();
  const structureByClass = Object.fromEntries(structures.map((s) => [s.classId.toString(), s.totalAmount]));
  const paidByStudent = Object.fromEntries(payments.map((p) => [p._id.toString(), p.totalPaid]));
  const classIdByStudent = Object.fromEntries(students.map((s) => [s._id.toString(), s.classId?.toString()]));

  const stats = {};
  for (const id of ids) {
    const classId = classIdByStudent[id];
    const totalAmount = classId ? (structureByClass[classId] ?? 0) : 0;
    const totalPaid = paidByStudent[id] ?? 0;
    stats[id] = {
      totalPaid,
      totalAmount,
      percentage: totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 100)) : null,
    };
  }

  return sendSuccess(res, { stats });
});

/**
 * GET /api/v1/fees/dashboard-summary
 * Server-side finance totals for dashboard cards and follow-up metrics.
 *
 * Query params (optional):
 *   month=1..12
 *   year=YYYY
 */
export const getFinanceDashboardSummary = asyncHandler(async (req, res) => {
  const now = new Date();
  const month = Number(req.query.month) || (now.getUTCMonth() + 1);
  const year = Number(req.query.year) || now.getUTCFullYear();

  const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));

  const baseMatch = {
    schoolId: req.user.schoolId,
    status: PAYMENT_STATUSES.COMPLETED,
  };

  const [
    monthAgg,
    todayAgg,
    monthPaidStudentsAgg,
    unissuedReceipts,
    totalStudents,
    recentPayments,
  ] = await Promise.all([
    Payment.aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: monthStart, $lt: monthEnd } } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: dayStart, $lt: dayEnd } } },
      { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: monthStart, $lt: monthEnd } } },
      { $group: { _id: '$studentId' } },
      { $count: 'total' },
    ]),
    Payment.countDocuments({
      ...baseMatch,
      receiptIssuedByUserId: { $exists: false },
    }),
    Student.countDocuments({
      schoolId: req.user.schoolId,
      status: STUDENT_STATUSES.ACTIVE,
    }),
    Payment.find(baseMatch)
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('studentId', 'firstName lastName admissionNumber')
      .select('amount method status createdAt receiptNumber receiptIssuedByUserId studentId')
      .lean(),
  ]);

  const monthTotal = monthAgg[0]?.totalAmount ?? 0;
  const monthPaymentsCount = monthAgg[0]?.count ?? 0;
  const todayTotal = todayAgg[0]?.totalAmount ?? 0;
  const todayPaymentsCount = todayAgg[0]?.count ?? 0;
  const studentsPaidThisMonth = monthPaidStudentsAgg[0]?.total ?? 0;
  const studentsToFollowUp = Math.max(0, totalStudents - studentsPaidThisMonth);

  return sendSuccess(res, {
    summary: {
      month,
      year,
      today: {
        totalAmount: todayTotal,
        paymentsCount: todayPaymentsCount,
      },
      monthToDate: {
        totalAmount: monthTotal,
        paymentsCount: monthPaymentsCount,
      },
      students: {
        totalActive: totalStudents,
        paidThisMonth: studentsPaidThisMonth,
        followUpCount: studentsToFollowUp,
      },
      unissuedReceipts,
    },
    recentPayments,
  });
});

/**
 * GET /api/v1/fees/payment-notifications
 * Lists payment SMS notifications parsed by the interim SMS automation.
 */
export const listPaymentNotifications = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.provider) filter.provider = req.query.provider;

  const total = await PaymentNotification.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const notifications = await PaymentNotification.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('matchedStudentId', 'firstName lastName admissionNumber')
    .populate('paymentId', 'amount method reference receiptNumber status')
    .lean();

  return sendSuccess(res, { notifications, meta });
});
