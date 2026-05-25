import Subject from './Subject.model.js';
import Class from '../classes/Class.model.js';
import User from '../users/User.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import { LEVEL_CATEGORIES, ROLES, CACHE_TTL } from '../../constants/index.js';
import { bustCachePattern } from '../../utils/cache.js';

const bustSubjectCache = (schoolId) => bustCachePattern(`school:subjects:${schoolId}:*`);

// ── Helpers ───────────────────────────────────────────────────────────────────

const validateClassForSubject = async (schoolId, classId) => {
  const cls = await Class.findOne({ _id: classId, schoolId });
  if (!cls) return { error: { message: 'Class not found.', statusCode: 404 } };

  if (cls.levelCategory === LEVEL_CATEGORIES.PRE_PRIMARY) {
    return {
      error: {
        message: 'Pre-Primary classes cannot have subjects.',
        statusCode: 400,
      },
    };
  }

  return { cls };
};

/**
 * Validates that all provided teacher IDs belong to active teachers in this school.
 * Returns the resolved teacher IDs or an error object.
 */
const resolveTeacherIds = async (schoolId, teacherIds = []) => {
  if (!teacherIds.length) return { ids: [] };

  const teachers = await User.find({
    _id: { $in: teacherIds },
    schoolId,
    role: { $in: [ROLES.TEACHER, ROLES.DEPARTMENT_HEAD] },
    isActive: true,
  }).select('_id');

  if (teachers.length !== teacherIds.length) {
    return { error: { message: 'One or more teacher IDs are invalid or not active teachers in this school.', statusCode: 404 } };
  }

  return { ids: teachers.map((t) => t._id) };
};

/**
 * Validates that the provided HOD ID belongs to an active user (any management role) in this school.
 */
const resolveHodId = async (schoolId, hodId) => {
  if (!hodId) return { id: undefined };

  const hod = await User.findOne({
    _id: hodId,
    schoolId,
    role: { $in: [ROLES.TEACHER, ROLES.DEPARTMENT_HEAD] },
    isActive: true,
  });

  if (!hod) return { error: { message: 'Head of Department user not found or inactive.', statusCode: 404 } };
  // Promote teacher to Department Head when assigned as HOD.
  if (hod.role === ROLES.TEACHER) {
    hod.role = ROLES.DEPARTMENT_HEAD;
    await hod.save();
  }
  return { id: hod._id };
};

const populateSubject = (query) =>
  query
    .populate('classId', 'name stream levelCategory academicYear term')
    .populate('teacherIds', 'firstName lastName email')
    .populate('hodId', 'firstName lastName email');

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/subjects
 */
export const createSubject = asyncHandler(async (req, res) => {
  const { classId, name, code, department, teacherIds = [], hodId } = req.body;

  const check = await validateClassForSubject(req.user.schoolId, classId);
  if (check.error) return sendError(res, check.error.message, check.error.statusCode);

  // Validate teachers
  const tResult = await resolveTeacherIds(req.user.schoolId, teacherIds);
  if (tResult.error) return sendError(res, tResult.error.message, tResult.error.statusCode);

  // Validate HOD
  const hodResult = await resolveHodId(req.user.schoolId, hodId);
  if (hodResult.error) return sendError(res, hodResult.error.message, hodResult.error.statusCode);

  const subject = await Subject.create({
    schoolId:   req.user.schoolId,
    classId,
    name:       name.trim(),
    code:       code?.trim().toUpperCase(),
    department: department?.trim(),
    teacherIds: tResult.ids,
    hodId:      hodResult.id,
  });

  await bustSubjectCache(req.user.schoolId);
  const populated = await populateSubject(Subject.findById(subject._id));

  return sendSuccess(res, { subject: populated }, 201);
});

/**
 * GET /api/v1/subjects
 */
export const listSubjects = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };
  if (req.query.classId)              filter.classId    = req.query.classId;
  if (req.query.department)           filter.department = req.query.department;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';

  const isTeacherRole = [ROLES.TEACHER, ROLES.DEPARTMENT_HEAD].includes(req.user.role);

  // Teachers see only their own subjects unless ?all=true is requested (for self-assignment browsing)
  if (isTeacherRole && req.query.all !== 'true') {
    filter.teacherIds = req.user._id;
  }

  // Cache unfiltered admin queries (most frequent — sidebar, form selects)
  const isSimpleQuery = !isTeacherRole && !req.query.classId && !req.query.department &&
    req.query.isActive === undefined && (!req.query.page || req.query.page === '1') && !req.query.limit;

  const cacheKey = `school:subjects:${req.user.schoolId}:all`;
  const redis = getRedis();

  if (isSimpleQuery && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return sendSuccess(res, JSON.parse(cached));
    } catch { /* cache miss */ }
  }

  const total = await Subject.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const subjects = await populateSubject(
    Subject.find(filter).sort({ name: 1 }).skip(skip).limit(limit)
  );

  const payload = { subjects, meta };

  if (isSimpleQuery && redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', CACHE_TTL.SUBJECT_LIST);
    } catch { /* non-fatal */ }
  }

  return sendSuccess(res, payload);
});

/**
 * GET /api/v1/subjects/:id
 */
export const getSubject = asyncHandler(async (req, res) => {
  const subject = await populateSubject(
    Subject.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
  );

  if (!subject) return sendError(res, 'Subject not found.', 404);

  return sendSuccess(res, { subject });
});

/**
 * PATCH /api/v1/subjects/:id
 */
export const updateSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!subject) return sendError(res, 'Subject not found.', 404);

  const { classId, name, code, isActive, department, teacherIds, hodId } = req.body;

  if (classId !== undefined) {
    const check = await validateClassForSubject(req.user.schoolId, classId);
    if (check.error) return sendError(res, check.error.message, check.error.statusCode);
    subject.classId = classId;
  }

  if (teacherIds !== undefined) {
    const tResult = await resolveTeacherIds(req.user.schoolId, teacherIds);
    if (tResult.error) return sendError(res, tResult.error.message, tResult.error.statusCode);
    subject.teacherIds = tResult.ids;
  }

  if (hodId !== undefined) {
    if (hodId === null) {
      subject.hodId = undefined;
    } else {
      const hodResult = await resolveHodId(req.user.schoolId, hodId);
      if (hodResult.error) return sendError(res, hodResult.error.message, hodResult.error.statusCode);
      subject.hodId = hodResult.id;
    }
  }

  if (name       !== undefined) subject.name       = name.trim();
  if (code       !== undefined) subject.code       = code ? code.trim().toUpperCase() : undefined;
  if (isActive   !== undefined) subject.isActive   = isActive;
  if (department !== undefined) subject.department = department ? department.trim() : undefined;

  await subject.save();
  await bustSubjectCache(req.user.schoolId);

  const populated = await populateSubject(Subject.findById(subject._id));

  return sendSuccess(res, { subject: populated });
});

/**
 * PATCH /api/v1/subjects/:id/teachers
 * Replaces the full teacher list (and optionally the HOD) for a subject.
 * Body: { teacherIds: ["id1","id2"], hodId: "id" | null }
 */
export const assignTeachers = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!subject) return sendError(res, 'Subject not found.', 404);

  const { teacherIds, hodId } = req.body;

  const tResult = await resolveTeacherIds(req.user.schoolId, teacherIds);
  if (tResult.error) return sendError(res, tResult.error.message, tResult.error.statusCode);
  subject.teacherIds = tResult.ids;

  if (hodId !== undefined) {
    if (hodId === null) {
      subject.hodId = undefined;
    } else {
      const hodResult = await resolveHodId(req.user.schoolId, hodId);
      if (hodResult.error) return sendError(res, hodResult.error.message, hodResult.error.statusCode);
      subject.hodId = hodResult.id;
    }
  }

  await subject.save();
  await bustSubjectCache(req.user.schoolId);

  const populated = await populateSubject(Subject.findById(subject._id));

  return sendSuccess(res, { subject: populated });
});

/**
 * DELETE /api/v1/subjects/:id
 */
export const deleteSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!subject) return sendError(res, 'Subject not found.', 404);

  await subject.deleteOne();
  await bustSubjectCache(req.user.schoolId);
  return sendSuccess(res, { message: 'Subject deleted.' });
});

/**
 * GET /api/v1/subjects/my-subjects
 * Returns subjects assigned to the currently logged-in teacher.
 */
export const mySubjects = asyncHandler(async (req, res) => {
  const subjects = await populateSubject(
    Subject.find({
      schoolId:   req.user.schoolId,
      teacherIds: req.user._id,
      isActive:   true,
    }).sort({ name: 1 })
  );

  return sendSuccess(res, { subjects });
});

/**
 * PATCH /api/v1/subjects/:id/self-assign
 * Teachers add or remove themselves from a subject's teacherIds.
 * Body: { action: 'join' | 'leave' }
 */
export const selfAssignSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
    isActive: true,
  });

  if (!subject) return sendError(res, 'Subject not found.', 404);

  const { action } = req.body;
  const teacherId = req.user._id;

  if (action === 'join') {
    if (!subject.teacherIds.some((id) => id.equals(teacherId))) {
      subject.teacherIds.push(teacherId);
    }
  } else if (action === 'leave') {
    subject.teacherIds = subject.teacherIds.filter((id) => !id.equals(teacherId));
  } else {
    return sendError(res, 'action must be "join" or "leave".', 400);
  }

  await subject.save();
  await bustSubjectCache(req.user.schoolId);

  const populated = await populateSubject(Subject.findById(subject._id));
  return sendSuccess(res, { subject: populated });
});
