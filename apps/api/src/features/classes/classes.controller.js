import mongoose from 'mongoose';
import { withTransaction } from '../../utils/withTransaction.js';
import Class from './Class.model.js';
import Student from '../students/Student.model.js';
import ReportCard from '../report-cards/ReportCard.model.js';
import User from '../users/User.model.js';
import School from '../schools/School.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import { getRedis } from '../../config/redis.js';
import { bustCachePattern } from '../../utils/cache.js';
import { CACHE_TTL, STUDENT_STATUSES, PAYMENT_STATUSES } from '../../constants/index.js';
import { createNotification } from '../../services/notification.service.js';
import { sendAttendancePermissionEmail } from '../../services/email.service.js';
import logger from '../../config/logger.js';

// Lazy-load to avoid circular deps at module init time
const getPaymentModel  = () => mongoose.model('Payment');
const getFeeStructureModel = () => mongoose.model('FeeStructure');

const notifyClassTeacher = async (schoolId, teacherId, cls) => {
  try {
    const [teacher, school] = await Promise.all([
      User.findById(teacherId).select('firstName lastName email').lean(),
      School.findById(schoolId).select('name').lean(),
    ]);
    if (!teacher) return;
    const schoolName = school?.name ?? 'your school';
    const className = `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}`;
    await Promise.all([
      createNotification({
        schoolId,
        userId: teacher._id,
        title: `Class teacher — ${className}`,
        message: `You have been assigned as class teacher of ${className} at ${schoolName}. You can now take attendance for this class.`,
        type: 'info',
        link: '/attendance',
      }),
      sendAttendancePermissionEmail({
        to: teacher.email,
        firstName: teacher.firstName,
        schoolName,
        className,
        meta: { schoolId: String(schoolId), userId: String(teacher._id) },
      }).catch((err) => logger.warn('[Class] attendance-permission email failed', { err: err.message })),
    ]);
  } catch (err) {
    logger.warn('[Class] Failed to notify class teacher', { err: err.message });
  }
};

const bustClassCache = (schoolId) => bustCachePattern(`school:classes:${schoolId}:*`);

/**
 * POST /api/v1/classes
 * Creates a new class for the logged-in admin's school.
 */
export const createClass = asyncHandler(async (req, res) => {
  const { name, stream, levelCategory, academicYear, term, classTeacherId } = req.body;

  const cls = await Class.create({
    schoolId: req.user.schoolId,
    name: name.trim(),
    stream: stream?.trim(),
    levelCategory,
    academicYear,
    term,
    classTeacherId: classTeacherId || undefined,
  });

  await bustClassCache(req.user.schoolId);

  if (classTeacherId) {
    notifyClassTeacher(req.user.schoolId, classTeacherId, cls).catch(() => {});
  }

  return sendSuccess(res, { class: cls }, 201);
});

/**
 * GET /api/v1/classes
 * Lists all classes for the school. Supports ?academicYear=, ?term=, ?levelCategory=, ?isActive=
 * Results are Redis-cached for 10 minutes when no query filters are used.
 */
export const listClasses = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  if (req.query.term) filter.term = req.query.term;
  if (req.query.levelCategory) filter.levelCategory = req.query.levelCategory;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive !== 'false';

  // Cache only unfiltered first-page queries (the most common dashboard call)
  const isSimpleQuery = !req.query.academicYear && !req.query.term &&
    !req.query.levelCategory && req.query.isActive === undefined &&
    (!req.query.page || req.query.page === '1') && !req.query.limit;

  const cacheKey = `school:classes:${req.user.schoolId}:all`;
  const redis = getRedis();

  if (isSimpleQuery && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return sendSuccess(res, JSON.parse(cached));
      }
    } catch { /* cache miss */ }
  }

  const total = await Class.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const classes = await Class.find(filter)
    .sort({ name: 1, stream: 1 })
    .skip(skip)
    .limit(limit)
    .populate('classTeacherId', 'firstName lastName email');

  const payload = { classes, meta };

  if (isSimpleQuery && redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL.CLASS_LIST);
    } catch { /* non-fatal */ }
  }

  return sendSuccess(res, payload);
});

/**
 * Shared helper: fetches a class with students + per-student fee balance for the
 * class's current academic year + term.
 */
async function fetchClassDetails(cls) {
  const Payment      = getPaymentModel();
  const FeeStructure = getFeeStructureModel();

  // Students in this class (active only for the detail view)
  const students = await Student.find({
    classId:  cls._id,
    schoolId: cls.schoolId,
    status:   STUDENT_STATUSES.ACTIVE,
  })
    .select('admissionNumber firstName lastName gender dateOfBirth status parentIds guardians')
    .populate('parentIds', 'firstName lastName phone email')
    .lean();

  // Fee structure for this class/term/year
  const feeStructure = await FeeStructure.findOne({
    schoolId:     cls.schoolId,
    classId:      cls._id,
    academicYear: cls.academicYear,
    term:         cls.term,
  }).lean();

  let studentBalances = [];

  if (feeStructure && students.length) {
    // Aggregate total completed payments per student in this term
    const payments = await Payment.aggregate([
      {
        $match: {
          schoolId:     cls.schoolId,
          classId:      cls._id,
          academicYear: cls.academicYear,
          term:         cls.term,
          status:       PAYMENT_STATUSES.COMPLETED,
        },
      },
      { $group: { _id: '$studentId', totalPaid: { $sum: '$amount' } } },
    ]);

    const paidMap = Object.fromEntries(
      payments.map((p) => [p._id.toString(), p.totalPaid])
    );

    studentBalances = students.map((s) => {
      const totalPaid = paidMap[s._id.toString()] ?? 0;
      const expected  = feeStructure.totalAmount ?? 0;
      return {
        ...s,
        fees: {
          expected,
          paid:        totalPaid,
          balance:     Math.max(0, expected - totalPaid),
          overpaid:    Math.max(0, totalPaid - expected),
        },
      };
    });
  } else {
    studentBalances = students.map((s) => ({ ...s, fees: null }));
  }

  return { students: studentBalances, feeStructure };
}

/**
 * GET /api/v1/classes/:id
 * Returns a class with its students + fee balance summary.
 */
export const getClass = asyncHandler(async (req, res) => {
  const cls = await Class.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
    .populate('classTeacherId', 'firstName lastName email');

  if (!cls) return sendError(res, 'Class not found.', 404);

  const { students, feeStructure } = await fetchClassDetails(cls);

  return sendSuccess(res, { class: cls, students, feeStructure });
});

/**
 * GET /api/v1/classes/my-class
 * Returns the class where the logged-in user is the class teacher, including
 * full student list and fee balance summary.
 */
export const myClass = asyncHandler(async (req, res) => {
  const cls = await Class.findOne({
    classTeacherId: req.user._id,
    schoolId:       req.user.schoolId,
    isActive:       true,
  }).populate('classTeacherId', 'firstName lastName email');

  if (!cls) {
    return sendError(res, 'You are not assigned as class teacher of any active class.', 404);
  }

  const { students, feeStructure } = await fetchClassDetails(cls);

  return sendSuccess(res, { class: cls, students, feeStructure });
});

/**
 * PATCH /api/v1/classes/:id
 * Updates a class. Setting classTeacherId to null unassigns the teacher.
 */
export const updateClass = asyncHandler(async (req, res) => {
  const cls = await Class.findOne({ _id: req.params.id, schoolId: req.user.schoolId });

  if (!cls) return sendError(res, 'Class not found.', 404);

  const { name, stream, levelCategory, academicYear, term, classTeacherId, isActive } = req.body;

  const prevTeacherId = cls.classTeacherId ? String(cls.classTeacherId) : null;

  if (name !== undefined) cls.name = name;
  if (stream !== undefined) cls.stream = stream;
  if (levelCategory !== undefined) cls.levelCategory = levelCategory;
  if (academicYear !== undefined) cls.academicYear = academicYear;
  if (term !== undefined) cls.term = term;
  if (classTeacherId !== undefined) cls.classTeacherId = classTeacherId; // null clears it
  if (isActive !== undefined) cls.isActive = isActive;

  await cls.save();
  await bustClassCache(req.user.schoolId);

  // Notify newly assigned class teacher
  const newTeacherId = classTeacherId && classTeacherId !== prevTeacherId ? classTeacherId : null;
  if (newTeacherId) {
    notifyClassTeacher(req.user.schoolId, newTeacherId, cls).catch(() => {});
  }

  return sendSuccess(res, { class: cls });
});

/**
 * DELETE /api/v1/classes/:id
 * Soft-deletes by setting isActive = false.
 * Hard delete is blocked if the class has students.
 */
export const deleteClass = asyncHandler(async (req, res) => {
  const cls = await Class.findOne({ _id: req.params.id, schoolId: req.user.schoolId });

  if (!cls) return sendError(res, 'Class not found.', 404);

  if (cls.studentCount > 0) {
    return sendError(
      res,
      `Cannot delete a class with ${cls.studentCount} enrolled student(s). Transfer or withdraw them first.`,
      409
    );
  }

  await cls.deleteOne();
  await bustClassCache(req.user.schoolId);

  return sendSuccess(res, { message: 'Class deleted.' });
});

/**
 * POST /api/v1/classes/:id/promote
 * Bulk-moves all active students from the source class to the target class.
 * Designed for end-of-year grade promotions (e.g. all Grade 3 → Grade 4).
 *
 * Rules:
 *  - Both classes must belong to the same school.
 *  - Source and target cannot be the same class.
 *  - Only ACTIVE students are moved; withdrawn/transferred/graduated are left.
 *  - studentCount is updated on both classes atomically.
 */
export const promoteClass = asyncHandler(async (req, res) => {
  const { targetClassId, eligibilityMode = 'all', action = 'promote' } = req.body;
  const sourceClassId = req.params.id;

  if (action === 'promote' && sourceClassId === targetClassId) {
    return sendError(res, 'Source and target class cannot be the same.', 400);
  }

  const [source, target] = await Promise.all([
    Class.findOne({ _id: sourceClassId, schoolId: req.user.schoolId }),
    action === 'promote'
      ? Class.findOne({ _id: targetClassId, schoolId: req.user.schoolId })
      : Promise.resolve(null),
  ]);

  if (!source) return sendError(res, 'Source class not found.', 404);
  if (action === 'promote' && !target) return sendError(res, 'Target class not found.', 404);

  const promotionCycle = `${source.academicYear}:${source.term}`;

  const { movedCount, skippedCount, notEligibleCount } = await withTransaction(async (session) => {
    const baseFilter = {
      classId: sourceClassId,
      schoolId: req.user.schoolId,
      status: STUDENT_STATUSES.ACTIVE,
      $or: [
        { lastPromotionCycle: { $exists: false } },
        { lastPromotionCycle: { $ne: promotionCycle } },
      ],
    };

    const eligibleCount = await Student.countDocuments(baseFilter).session(session);

    let promotionFilter = baseFilter;
    let notEligibleCount = 0;

    if (eligibilityMode === 'cbc_recommended') {
      const candidates = await Student.find(baseFilter).select('_id').session(session).lean();
      const candidateIds = candidates.map((s) => s._id);

      const cards = await ReportCard.find({
        schoolId: req.user.schoolId,
        studentId: { $in: candidateIds },
        academicYear: source.academicYear,
        term: source.term,
      })
        .select('studentId overallGrade attendanceSummary')
        .session(session)
        .lean();

      const cardMap = new Map(cards.map((c) => [String(c.studentId), c]));
      const isPromotable = (card) => {
        if (!card) return false;
        const grade = String(card.overallGrade || '').toUpperCase();
        const isBelowExpectation = ['BE', 'BE1', 'BE2'].includes(grade);
        const totalDays = card.attendanceSummary?.totalDays ?? 0;
        const present = card.attendanceSummary?.present ?? 0;
        const attendanceRate = totalDays > 0 ? present / totalDays : 1;
        return !isBelowExpectation && attendanceRate >= 0.7;
      };

      const promotableIds = candidateIds.filter((id) => isPromotable(cardMap.get(String(id))));
      notEligibleCount = Math.max(0, candidateIds.length - promotableIds.length);
      promotionFilter = { _id: { $in: promotableIds }, schoolId: req.user.schoolId };
    }

    const updates =
      action === 'graduate'
        ? { $set: { status: STUDENT_STATUSES.GRADUATED, lastPromotionCycle: promotionCycle, lastPromotedAt: new Date() } }
        : { $set: { classId: targetClassId, lastPromotionCycle: promotionCycle, lastPromotedAt: new Date() } };

    const result = await Student.updateMany(promotionFilter, updates, { session });
    const movedCount = result.modifiedCount;

    await Class.updateOne({ _id: sourceClassId }, { $inc: { studentCount: -movedCount } }, { session });
    if (action === 'promote') {
      await Class.updateOne({ _id: targetClassId }, { $inc: { studentCount: movedCount } }, { session });
    }

    return { movedCount, skippedCount: Math.max(0, eligibleCount - movedCount), notEligibleCount };
  });

  await bustClassCache(req.user.schoolId);

  const actionLabel = action === 'graduate' ? 'graduated' : 'promoted';
  const targetName = action === 'graduate' ? 'Graduation list' : target.name;

  return sendSuccess(res, {
    message: `${movedCount} student(s) ${actionLabel} from ${source.name} to ${targetName}.`,
    movedCount,
    skippedCount,
    notEligibleCount,
    eligibilityMode,
    action,
    promotionCycle,
    sourceClass: { _id: source._id, name: source.name },
    targetClass: action === 'promote' ? { _id: target._id, name: target.name } : null,
  });
});
