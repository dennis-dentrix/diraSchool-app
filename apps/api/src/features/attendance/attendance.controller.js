import Attendance from './Attendance.model.js';
import Class from '../classes/Class.model.js';
import Student from '../students/Student.model.js';
import User from '../users/User.model.js';
import SchoolSettings from '../settings/SchoolSettings.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import { resolveCurrentTermAndYear } from '../../utils/term.js';
import {
  ATTENDANCE_REGISTER_STATUSES,
  ROLES,
  STUDENT_STATUSES,
} from '../../constants/index.js';

// Day names matching SchoolSettings.workingDays enum values
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const checkSchoolOpen = async (schoolId, dateString) => {
  const settings = await SchoolSettings.findOne({ schoolId }).lean();
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const dayName = DAY_NAMES[date.getUTCDay()];

  const workingDays = settings?.workingDays ?? ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  if (!workingDays.includes(dayName)) {
    return { open: false, reason: `School does not operate on ${dayName}s.` };
  }

  if (settings?.holidays?.length) {
    const dateMs = date.getTime();
    const holiday = settings.holidays.find((h) => {
      const hDate = new Date(h.date);
      return hDate.getUTCFullYear() === date.getUTCFullYear() &&
             hDate.getUTCMonth()    === date.getUTCMonth() &&
             hDate.getUTCDate()     === date.getUTCDate();
    });
    if (holiday) {
      return { open: false, reason: `School is closed: ${holiday.name}.` };
    }
  }

  return { open: true };
};

const normaliseDate = (dateString) => {
  return new Date(`${dateString}T00:00:00.000Z`);
};

const validateEntriesForClass = async (schoolId, classId, entries) => {
  if (!entries || entries.length === 0) return true;

  const studentIds = entries.map((entry) => entry.studentId);

  const matchingStudents = await Student.countDocuments({
    _id: { $in: studentIds },
    schoolId,
    classId,
    status: STUDENT_STATUSES.ACTIVE,
  });

  return matchingStudents === studentIds.length;
};

const resolveSubstituteMeta = async (req, cls, substituteTeacherId) => {
  if (!substituteTeacherId) {
    return {
      takenByUserId: req.user._id,
      substituteTeacherId: undefined,
      isSubstitute: false,
    };
  }

  const substitute = await User.findOne({
    _id: substituteTeacherId,
    schoolId: req.user.schoolId,
    role: { $in: [ROLES.TEACHER, ROLES.DEPARTMENT_HEAD] },
    isActive: true,
  }).select('_id');

  if (!substitute) return null;

  const isSubstitute =
    !cls.classTeacherId || !cls.classTeacherId.equals(substituteTeacherId);

  return {
    takenByUserId: substitute._id,
    substituteTeacherId: substitute._id,
    isSubstitute,
  };
};

/**
 * POST /api/v1/attendance/registers
 * Creates a class attendance register for a specific date and session.
 */
export const createAttendanceRegister = asyncHandler(async (req, res) => {
  const { classId, date, session, term: bodyTerm, entries, substituteTeacherId, substituteNote } = req.body;

  const schoolStatus = await checkSchoolOpen(req.user.schoolId, date);
  if (!schoolStatus.open) {
    return sendError(res, schoolStatus.reason, 422);
  }

  const cls = await Class.findOne({ _id: classId, schoolId: req.user.schoolId });
  if (!cls) return sendError(res, 'Class not found.', 404);

  const entriesAreValid = await validateEntriesForClass(
    req.user.schoolId,
    classId,
    entries
  );
  if (!entriesAreValid) {
    return sendError(
      res,
      'One or more students are invalid, inactive, or not in the selected class.',
      400
    );
  }

  const substituteMeta = await resolveSubstituteMeta(req, cls, substituteTeacherId);
  if (!substituteMeta) {
    return sendError(res, 'Substitute teacher not found in this school.', 404);
  }

  // Auto-populate entries from all active students in the class when none are provided
  let finalEntries = entries && entries.length > 0 ? entries : null;
  if (!finalEntries) {
    const classStudents = await Student.find({
      classId,
      schoolId: req.user.schoolId,
      status: STUDENT_STATUSES.ACTIVE,
    }).select('_id').lean();
    finalEntries = classStudents.map((s) => ({ studentId: s._id, status: 'present' }));
  }

  // Resolve term: use provided term or default to currentTerm from school settings
  let finalTerm = bodyTerm;
  if (!finalTerm) {
    const schoolSettings = await SchoolSettings.findOne({ schoolId: req.user.schoolId }).lean();
    finalTerm = schoolSettings?.currentTerm || cls.term;
  }

  const register = await Attendance.create({
    schoolId: req.user.schoolId,
    classId,
    date: normaliseDate(date),
    session,
    academicYear: cls.academicYear,
    term: finalTerm,
    entries: finalEntries,
    substituteNote: substituteNote || undefined,
    ...substituteMeta,
  });

  const populated = await Attendance.findById(register._id)
    .populate('classId', 'name stream academicYear term')
    .populate('takenByUserId', 'firstName lastName role')
    .populate('substituteTeacherId', 'firstName lastName role')
    .populate('entries.studentId', 'firstName lastName admissionNumber');

  return sendSuccess(res, { register: populated }, 201);
});

/**
 * GET /api/v1/attendance/registers
 * Lists attendance registers for a school with optional session filtering.
 */
export const listAttendanceRegisters = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };

  // Teachers see their own class's registers plus any they were assigned to take
  if ([ROLES.TEACHER, ROLES.DEPARTMENT_HEAD].includes(req.user.role)) {
    const teacherClass = await Class.findOne({
      classTeacherId: req.user._id,
      schoolId: req.user.schoolId,
      isActive: true,
    }).select('_id');

    const orConditions = [
      { takenByUserId: req.user._id },
      { substituteTeacherId: req.user._id },
    ];
    if (teacherClass) orConditions.push({ classId: teacherClass._id });
    filter.$or = orConditions;
  } else if (req.query.classId) {
    filter.classId = req.query.classId;
  }
  if (req.query.date) filter.date = normaliseDate(req.query.date);
  if (req.query.session) filter.session = req.query.session;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.term) filter.term = req.query.term;
  if (req.query.academicYear) filter.academicYear = req.query.academicYear;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = normaliseDate(req.query.from);
    if (req.query.to)   filter.date.$lte = normaliseDate(req.query.to);
  }

  const total = await Attendance.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const registers = await Attendance.find(filter)
    .sort({ date: -1, session: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('classId', 'name stream academicYear term')
    .populate('takenByUserId', 'firstName lastName role')
    .populate('substituteTeacherId', 'firstName lastName role');

  return sendSuccess(res, { registers, meta });
});

/**
 * GET /api/v1/attendance/registers/:id
 */
export const getAttendanceRegister = asyncHandler(async (req, res) => {
  const register = await Attendance.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  })
    .populate('classId', 'name stream academicYear term')
    .populate('takenByUserId', 'firstName lastName role')
    .populate('substituteTeacherId', 'firstName lastName role')
    .populate('entries.studentId', 'firstName lastName admissionNumber');

  if (!register) return sendError(res, 'Attendance register not found.', 404);

  return sendSuccess(res, { register });
});

/**
 * PATCH /api/v1/attendance/registers/:id
 * Edits a draft register only.
 */
export const updateAttendanceRegister = asyncHandler(async (req, res) => {
  const register = await Attendance.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!register) return sendError(res, 'Attendance register not found.', 404);

  if (register.status === ATTENDANCE_REGISTER_STATUSES.SUBMITTED) {
    return sendError(res, 'Submitted attendance cannot be edited.', 409);
  }

  const cls = await Class.findOne({ _id: register.classId, schoolId: req.user.schoolId });
  if (!cls) return sendError(res, 'Class not found.', 404);

  const { entries, substituteTeacherId, substituteNote } = req.body;

  if (entries !== undefined) {
    const entriesAreValid = await validateEntriesForClass(
      req.user.schoolId,
      register.classId,
      entries
    );
    if (!entriesAreValid) {
      return sendError(
        res,
        'One or more students are invalid, inactive, or not in the selected class.',
        400
      );
    }
    register.entries = entries;
  }

  if (substituteTeacherId !== undefined) {
    if (substituteTeacherId === null) {
      register.substituteTeacherId = undefined;
      register.substituteNote = undefined;
      register.takenByUserId = req.user._id;
      register.isSubstitute = false;
    } else {
      const substituteMeta = await resolveSubstituteMeta(req, cls, substituteTeacherId);
      if (!substituteMeta) {
        return sendError(res, 'Substitute teacher not found in this school.', 404);
      }
      register.takenByUserId = substituteMeta.takenByUserId;
      register.substituteTeacherId = substituteMeta.substituteTeacherId;
      register.isSubstitute = substituteMeta.isSubstitute;
    }
  }

  if (substituteNote !== undefined) {
    register.substituteNote = substituteNote || undefined;
  }

  await register.save();

  const populated = await Attendance.findById(register._id)
    .populate('classId', 'name stream academicYear term')
    .populate('takenByUserId', 'firstName lastName role')
    .populate('substituteTeacherId', 'firstName lastName role')
    .populate('entries.studentId', 'firstName lastName admissionNumber');

  return sendSuccess(res, { register: populated });
});

/**
 * GET /api/v1/attendance/daily
 * Gets both morning and afternoon attendance registers for a specific class and date.
 */
export const getDailyAttendanceSessions = asyncHandler(async (req, res) => {
  const { classId, date } = req.query;

  if (!classId || !date) {
    return sendError(res, 'classId and date are required query parameters.', 400);
  }

  const filter = {
    schoolId: req.user.schoolId,
    classId,
    date: normaliseDate(date),
  };

  // Teachers see their own class's registers plus any they were assigned to take
  if ([ROLES.TEACHER, ROLES.DEPARTMENT_HEAD].includes(req.user.role)) {
    const teacherClass = await Class.findOne({
      classTeacherId: req.user._id,
      schoolId: req.user.schoolId,
      isActive: true,
    }).select('_id');

    const orConditions = [
      { takenByUserId: req.user._id },
      { substituteTeacherId: req.user._id },
    ];
    if (teacherClass && teacherClass._id.toString() !== classId) {
      return sendError(res, 'You do not have permission to view this class.', 403);
    }
  }

  const registers = await Attendance.find(filter)
    .sort({ session: 1 })
    .populate('classId', 'name stream academicYear term')
    .populate('takenByUserId', 'firstName lastName role')
    .populate('substituteTeacherId', 'firstName lastName role')
    .populate('entries.studentId', 'firstName lastName admissionNumber');

  return sendSuccess(res, { registers });
});

/**
 * POST /api/v1/attendance/registers/:id/submit
 * Finalises a draft register and locks edits.
 */
export const submitAttendanceRegister = asyncHandler(async (req, res) => {
  const register = await Attendance.findOne({
    _id: req.params.id,
    schoolId: req.user.schoolId,
  });

  if (!register) return sendError(res, 'Attendance register not found.', 404);

  if (register.status === ATTENDANCE_REGISTER_STATUSES.SUBMITTED) {
    return sendError(res, 'Attendance register already submitted.', 400);
  }

  if (!register.entries || register.entries.length === 0) {
    return sendError(res, 'Cannot submit attendance with no student entries.', 400);
  }

  register.status = ATTENDANCE_REGISTER_STATUSES.SUBMITTED;
  register.submittedAt = new Date();
  await register.save();

  return sendSuccess(res, {
    register,
    message: 'Attendance register submitted.',
  });
});
