import { generateToken, randomPassword } from '../../utils/tokens.js';
import { searchRegex } from '../../utils/search.js';
import mongoose from 'mongoose';
import Student from './Student.model.js';
import Class from '../classes/Class.model.js';
import User from '../users/User.model.js';
import School from '../schools/School.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { paginate } from '../../utils/pagination.js';
import { normalisePhone } from '../../utils/phone.js';
import { ROLES, STUDENT_STATUSES, JOB_NAMES, AUDIT_ACTIONS, AUDIT_RESOURCES } from '../../constants/index.js';
import { importQueue } from '../../jobs/queues.js';
import { getRedis } from '../../config/redis.js';
import { logAction } from '../../utils/auditLogger.js';
import { env } from '../../config/env.js';
import { queueEmailWithDirectFallback } from '../../utils/emailJobs.js';
import { uploadBuffer } from '../../jobs/helpers/spacesUpload.js';
import { parseImportFile } from '../../utils/parseImportFile.js';

// ── Private helpers ───────────────────────────────────────────────────────────

const createParentWithInvite = async ({ firstName, lastName, email, phone, schoolId, session }) => {
  const { raw: rawToken, hash: tokenHash } = generateToken();
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [parent] = await User.create(
    [
      {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        phone,
        password: randomPassword(),
        role: ROLES.PARENT,
        schoolId,
        mustChangePassword: false,
        invitePending: true,
        inviteToken: tokenHash,
        inviteTokenExpiry: expiry,
        emailVerified: true,
      },
    ],
    { session }
  );
  return { parent, inviteUrl: `${env.CLIENT_URL}/accept-invite/${rawToken}` };
};

const buildInvitePayload = ({ parent, schoolName, childName, inviteUrl, flow, schoolId }) => ({
  to: parent.email,
  firstName: parent.firstName,
  schoolName,
  childName,
  inviteUrl,
  meta: { schoolId, userId: parent._id, flow },
});

const buildNoticePayload = ({ parent, schoolName, childName, flow, schoolId }) => ({
  to: parent.email,
  firstName: parent.firstName,
  schoolName,
  childName,
  isAdditionalChild: Array.isArray(parent.children) && parent.children.length > 0,
  meta: { schoolId, userId: parent._id, flow },
});

/**
 * POST /api/v1/students
 * Enrolls a new student.
 *
 * Guardian handling:
 *   - guardians[] — rich contact details; stored on the student record
 *   - If a guardian has an email, a parent portal account is created and an
 *     invite email is sent (fire-and-forget). No invite = placeholder account
 *     only when a portal account is explicitly requested via existingUserId or email.
 *   - parent (legacy) — single-guardian shortcut, still supported
 */
export const enrollStudent = asyncHandler(async (req, res) => {
  const {
    classId,
    admissionNumber,
    firstName,
    lastName,
    gender,
    dateOfBirth,
    birthCertificateNumber,
    assessmentNumber,
    enrollmentDate,
    guardians = [],
    parent, // legacy single-guardian field
  } = req.body;

  // Verify the target class belongs to this school
  const cls = await Class.findOne({ _id: classId, schoolId: req.user.schoolId });
  if (!cls) return sendError(res, 'Class not found.', 404);

  // Fetch school name for invite emails
  const school = await School.findById(req.user.schoolId).select('name').lean();
  const schoolName = school?.name ?? 'your school';
  const studentFullName = `${firstName.trim()} ${lastName.trim()}`;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const parentIds = new Set();
    const guardianEntries = [];
    // Track pending invite emails so we can fire them AFTER commit
    const pendingInvites = new Map();
    const pendingEnrollmentNotices = new Map();

    // ── Process guardians array ───────────────────────────────────────────────
    for (const guardian of guardians) {
      // Normalize guardian data
      const guardianEntry = {
        firstName:    guardian.firstName.trim(),
        lastName:     guardian.lastName.trim(),
        relationship: guardian.relationship,
        phone:        guardian.phone ? normalisePhone(guardian.phone) : undefined,
        email:        guardian.email?.toLowerCase().trim(),
        occupation:   guardian.occupation?.trim(),
      };

      if (guardian.existingUserId) {
        // Link an already-existing parent user
        const existingUser = await User.findOne({
          _id: guardian.existingUserId,
          schoolId: req.user.schoolId,
          role: ROLES.PARENT,
        }).session(session);

        if (!existingUser) {
          await session.abortTransaction();
          return sendError(res, `Parent user ${guardian.existingUserId} not found in this school.`, 404);
        }
        guardianEntry.userId = existingUser._id;
        parentIds.add(existingUser._id.toString());
      } else if (guardian.email) {
        // Email provided → re-use existing parent account when available,
        // otherwise create one and send invite.
        const email = guardian.email.toLowerCase().trim();
        let parentUser = await User.findOne({
          schoolId: req.user.schoolId,
          role: ROLES.PARENT,
          email,
        }).session(session);

        if (!parentUser) {
          const { parent: newParent, inviteUrl } = await createParentWithInvite({
            firstName: guardian.firstName,
            lastName: guardian.lastName,
            email,
            phone: guardian.phone ? normalisePhone(guardian.phone) : undefined,
            schoolId: req.user.schoolId,
            session,
          });
          parentUser = newParent;
          pendingInvites.set(parentUser.email, buildInvitePayload({
            parent: parentUser, schoolName, childName: studentFullName,
            inviteUrl, flow: 'parent-invite', schoolId: req.user.schoolId,
          }));
        } else {
          pendingEnrollmentNotices.set(parentUser.email, buildNoticePayload({
            parent: parentUser, schoolName, childName: studentFullName,
            flow: 'parent-existing-child-linked', schoolId: req.user.schoolId,
          }));
        }

        guardianEntry.userId = parentUser._id;
        parentIds.add(parentUser._id.toString());
      }
      guardianEntries.push(guardianEntry);
      // No email and no existingUserId → store contact only, no portal account
    }

    // ── Legacy single-parent shortcut ─────────────────────────────────────────
    if (parent && !guardians.length) {
      if (parent.existingUserId) {
        const existingUser = await User.findOne({
          _id: parent.existingUserId,
          schoolId: req.user.schoolId,
          role: ROLES.PARENT,
        }).session(session);

        if (!existingUser) {
          await session.abortTransaction();
          return sendError(res, 'Existing parent user not found in this school.', 404);
        }
        parentIds.add(existingUser._id.toString());
      } else {
        const phone = normalisePhone(parent.phone);
        const email = parent.email?.toLowerCase().trim();
        let parentUser = null;

        if (email) {
          parentUser = await User.findOne({
            schoolId: req.user.schoolId,
            role: ROLES.PARENT,
            email,
          }).session(session);
        }

        if (!parentUser) {
          if (email) {
            const { parent: newParent, inviteUrl } = await createParentWithInvite({
              firstName: parent.firstName,
              lastName: parent.lastName,
              email,
              phone,
              schoolId: req.user.schoolId,
              session,
            });
            parentUser = newParent;
            pendingInvites.set(parentUser.email, buildInvitePayload({
              parent: parentUser, schoolName, childName: studentFullName,
              inviteUrl, flow: 'parent-invite', schoolId: req.user.schoolId,
            }));
          } else {
            // No email — create a placeholder account (phone-only parent)
            const { raw: rawToken, hash: tokenHash } = generateToken();
            const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            const [newParent] = await User.create(
              [
                {
                  firstName: parent.firstName.trim(),
                  lastName: parent.lastName.trim(),
                  email: `parent${phone.replace('+', '')}@placeholder.diraschool`,
                  phone,
                  password: randomPassword(),
                  role: ROLES.PARENT,
                  schoolId: req.user.schoolId,
                  mustChangePassword: false,
                  invitePending: false,
                  inviteToken: rawToken ? tokenHash : undefined,
                  inviteTokenExpiry: expiry,
                  emailVerified: true,
                },
              ],
              { session }
            );
            parentUser = newParent;
          }
        } else {
          pendingEnrollmentNotices.set(parentUser.email, buildNoticePayload({
            parent: parentUser, schoolName, childName: studentFullName,
            flow: 'parent-existing-child-linked', schoolId: req.user.schoolId,
          }));
        }

        parentIds.add(parentUser._id.toString());
      }
    }

    // ── Create student ────────────────────────────────────────────────────────
    const [student] = await Student.create(
      [
        {
          schoolId:               req.user.schoolId,
          classId,
          admissionNumber:        admissionNumber.trim().toUpperCase(),
          firstName:              firstName.trim(),
          lastName:               lastName.trim(),
          gender,
          dateOfBirth:            dateOfBirth ? new Date(dateOfBirth) : undefined,
          birthCertificateNumber: birthCertificateNumber?.trim(),
          assessmentNumber:       assessmentNumber?.trim(),
          enrollmentDate:         enrollmentDate ? new Date(enrollmentDate) : new Date(),
          guardians: guardianEntries,
          parentIds: Array.from(parentIds),
        },
      ],
      { session }
    );

    // Link student to all parent portal accounts
    if (parentIds.size) {
      await User.updateMany(
        { _id: { $in: Array.from(parentIds) } },
        { $addToSet: { children: student._id } },
        { session }
      );
    }

    await session.commitTransaction();

    // ── Fire invite emails after commit (fire-and-forget) ─────────────────────
    for (const invite of pendingInvites.values()) {
      queueEmailWithDirectFallback(
        JOB_NAMES.SEND_INVITE_EMAIL,
        invite,
        'Students parent invite'
      );
    }

    for (const notice of pendingEnrollmentNotices.values()) {
      queueEmailWithDirectFallback(
        JOB_NAMES.SEND_PARENT_ENROLLMENT_EMAIL,
        notice,
        'Students enrollment notice'
      );
    }

    const populated = await Student.findById(student._id)
      .populate('classId', 'name stream levelCategory academicYear term')
      .populate('parentIds', 'firstName lastName phone email');

    logAction(req, {
      action:     AUDIT_ACTIONS.CREATE,
      resource:   AUDIT_RESOURCES.STUDENT,
      resourceId: student._id,
      meta: { admissionNumber: student.admissionNumber, classId: classId.toString() },
    });

    return sendSuccess(res, { student: populated }, 201);
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/**
 * GET /api/v1/students
 * Lists students for the school. Supports ?classId=, ?status=, ?gender=, ?search= (name/admission), ?page=, ?limit=
 */
export const listStudents = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };
  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.gender && ['male', 'female'].includes(req.query.gender)) filter.gender = req.query.gender;

  if (req.query.search) {
    const rx = searchRegex(req.query.search);
    filter.$or = [
      { firstName: rx },
      { lastName: rx },
      { admissionNumber: rx },
    ];
  }

  const SORT_FIELDS = { name: 'lastName', admNo: 'admissionNumber', status: 'status', enrolled: 'enrollmentDate' };
  const sortField = SORT_FIELDS[req.query.sortBy] ?? 'lastName';
  const sortDir   = req.query.order === 'desc' ? -1 : 1;
  const sortSpec  = { [sortField]: sortDir };
  if (sortField !== 'lastName') { sortSpec.lastName = 1; sortSpec.firstName = 1; }
  else { sortSpec.firstName = sortDir; }

  const total = await Student.countDocuments(filter);
  const { skip, limit, meta } = paginate(req.query, total);

  const students = await Student.find(filter)
    .sort(sortSpec)
    .skip(skip)
    .limit(limit)
    .populate('classId', 'name stream levelCategory')
    .populate('parentIds', 'firstName lastName phone email');

  return sendSuccess(res, { students, meta });
});

/**
 * GET /api/v1/students/:id
 */
export const getStudent = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
    .populate('classId', 'name stream levelCategory academicYear term')
    .populate('parentIds', 'firstName lastName phone email');

  if (!student) return sendError(res, 'Student not found.', 404);

  return sendSuccess(res, { student });
});

/**
 * PATCH /api/v1/students/:id
 * Updates basic details. Does NOT handle class transfer (use /transfer).
 */
export const updateStudent = asyncHandler(async (req, res) => {
  const schoolId = req.user.schoolId;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const student = await Student.findOne({ _id: req.params.id, schoolId }).session(session);
    if (!student) {
      await session.abortTransaction();
      return sendError(res, 'Student not found.', 404);
    }

    const {
      firstName, lastName, gender, dateOfBirth, admissionNumber, birthCertificateNumber, assessmentNumber, enrollmentDate, guardians,
    } = req.body;

    if (firstName !== undefined) student.firstName = firstName;
    if (lastName !== undefined) student.lastName = lastName;
    if (gender !== undefined) student.gender = gender;
    if (dateOfBirth !== undefined) student.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : undefined;
    if (admissionNumber !== undefined) student.admissionNumber = admissionNumber.trim().toUpperCase();
    if (birthCertificateNumber !== undefined) student.birthCertificateNumber = birthCertificateNumber || undefined;
    if (assessmentNumber !== undefined) student.assessmentNumber = assessmentNumber?.trim() || undefined;
    if (enrollmentDate !== undefined) student.enrollmentDate = enrollmentDate ? new Date(enrollmentDate) : undefined;

    const pendingInvites = new Map();
    const pendingEnrollmentNotices = new Map();
    if (guardians !== undefined) {
      const school = await School.findById(schoolId).select('name').session(session);
      const schoolName = school?.name ?? 'your school';

      const existingParentIds = new Set((student.parentIds ?? []).map((id) => id.toString()));
      const nextParentIds = new Set();
      const nextGuardians = [];

      for (let idx = 0; idx < guardians.length; idx += 1) {
        const g = guardians[idx];
        const existing = student.guardians?.[idx];
        const email = g.email?.trim().toLowerCase() || undefined;
        const phone = g.phone ? normalisePhone(g.phone) : undefined;

        let linkedUserId = existing?.userId ? existing.userId.toString() : undefined;
        let linkedUser = null;

        if (linkedUserId) {
          linkedUser = await User.findOne({ _id: linkedUserId, schoolId, role: ROLES.PARENT }).session(session);
          if (!linkedUser) linkedUserId = undefined;
        }

        if (email) {
          const emailChanged = !linkedUser || linkedUser.email?.toLowerCase() !== email;
          if (emailChanged) {
            let parentUser = await User.findOne({ schoolId, role: ROLES.PARENT, email }).session(session);

            if (!parentUser) {
              const childName = `${student.firstName} ${student.lastName}`;
              const { parent: newParent, inviteUrl } = await createParentWithInvite({
                firstName: g.firstName,
                lastName: g.lastName,
                email,
                phone,
                schoolId,
                session,
              });
              parentUser = newParent;
              pendingInvites.set(parentUser.email, buildInvitePayload({
                parent: parentUser, schoolName, childName,
                inviteUrl, flow: 'parent-invite-update', schoolId,
              }));
            } else if (!parentUser.children?.some((id) => id.toString() === student._id.toString())) {
              pendingEnrollmentNotices.set(parentUser.email, buildNoticePayload({
                parent: parentUser, schoolName,
                childName: `${student.firstName} ${student.lastName}`,
                flow: 'parent-existing-child-linked-update', schoolId,
              }));
            }

            linkedUserId = parentUser._id.toString();
          }
        }

        if (linkedUserId) nextParentIds.add(linkedUserId);

        nextGuardians.push({
          ...(linkedUserId ? { userId: linkedUserId } : {}),
          firstName: g.firstName,
          lastName: g.lastName,
          relationship: g.relationship,
          phone,
          email,
          occupation: g.occupation || undefined,
        });
      }

      student.guardians = nextGuardians;
      student.parentIds = Array.from(nextParentIds);

      if (student.parentIds.length) {
        await User.updateMany(
          { _id: { $in: student.parentIds } },
          { $addToSet: { children: student._id } },
          { session }
        );
      }

      const removedParentIds = Array.from(existingParentIds).filter((id) => !nextParentIds.has(id));
      if (removedParentIds.length) {
        await User.updateMany(
          { _id: { $in: removedParentIds } },
          { $pull: { children: student._id } },
          { session }
        );
      }
    }

    // Prevent the post('save') hook from double-incrementing studentCount
    student.wasNew = false;
    await student.save({ session });
    await session.commitTransaction();

    for (const invite of pendingInvites.values()) {
      queueEmailWithDirectFallback(
        JOB_NAMES.SEND_INVITE_EMAIL,
        invite,
        'Students updated guardian invite'
      );
    }

    for (const notice of pendingEnrollmentNotices.values()) {
      queueEmailWithDirectFallback(
        JOB_NAMES.SEND_PARENT_ENROLLMENT_EMAIL,
        notice,
        'Students updated enrollment notice'
      );
    }

    const populated = await Student.findById(student._id)
      .populate('classId', 'name stream levelCategory academicYear term')
      .populate('parentIds', 'firstName lastName phone email');

    return sendSuccess(res, { student: populated });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

/**
 * POST /api/v1/students/:id/transfer
 * Moves a student to a different class within the same school.
 */
export const transferStudent = asyncHandler(async (req, res) => {
  const { newClassId, note } = req.body;

  const student = await Student.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!student) return sendError(res, 'Student not found.', 404);

  const newClass = await Class.findOne({ _id: newClassId, schoolId: req.user.schoolId });
  if (!newClass) return sendError(res, 'Target class not found.', 404);

  if (student.classId.equals(newClassId)) {
    return sendError(res, 'Student is already in this class.', 400);
  }

  const oldClassId = student.classId;

  // Update counts
  await Class.updateOne({ _id: oldClassId }, { $inc: { studentCount: -1 } });
  await Class.updateOne({ _id: newClassId }, { $inc: { studentCount: 1 } });

  student.classId = newClassId;
  if (note) student.transferNote = note;
  student.wasNew = false;
  await student.save();

  logAction(req, {
    action: AUDIT_ACTIONS.TRANSFER,
    resource: AUDIT_RESOURCES.STUDENT,
    resourceId: student._id,
    meta: { from: oldClassId.toString(), to: newClassId.toString() },
  });

  return sendSuccess(res, { student, message: 'Student transferred successfully.' });
});

/**
 * POST /api/v1/students/:id/withdraw
 * Marks a student as withdrawn (soft delete).
 */
export const withdrawStudent = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!student) return sendError(res, 'Student not found.', 404);

  if (student.status !== STUDENT_STATUSES.ACTIVE) {
    return sendError(res, `Student is already ${student.status}.`, 400);
  }

  student.status = STUDENT_STATUSES.WITHDRAWN;
  student.wasNew = false;
  await student.save();

  // Decrement class count
  await Class.updateOne({ _id: student.classId }, { $inc: { studentCount: -1 } });

  logAction(req, {
    action: AUDIT_ACTIONS.WITHDRAW,
    resource: AUDIT_RESOURCES.STUDENT,
    resourceId: student._id,
    meta: { admissionNumber: student.admissionNumber },
  });

  return sendSuccess(res, { student, message: 'Student withdrawn.' });
});

/**
 * POST /api/v1/students/:id/photo
 * Uploads/updates a student's profile photo.
 * Field name: "photo" (multipart/form-data)
 */
export const uploadStudentPhoto = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!student) return sendError(res, 'Student not found.', 404);

  const upload = await uploadBuffer(req.file.buffer, {
    folder: `students/${req.user.schoolId}`,
    public_id: `${student.admissionNumber}_${student._id}`,
    resource_type: 'image',
    overwrite: true,
  });

  if (!upload?.url) {
    return sendError(
      res,
      'Photo upload unavailable. Configure DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, and DO_SPACES_REGION.',
      503
    );
  }

  student.photo = upload.url;
  student.wasNew = false;
  await student.save();

  return sendSuccess(res, { photo: student.photo, studentId: student._id });
});

// ── Bulk Import ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/students/import
 *
 * Accepts a CSV, XLSX, XLS, or ODS file (field: "file").
 *
 * Two modes:
 *
 * 1. Single-class  — classId provided in body (required for CSV / single-sheet Excel).
 *    Returns { jobId, total, preValidationErrors }.
 *
 * 2. All-classes   — no classId, multi-sheet Excel only.
 *    Each worksheet name must match a class name in the school.
 *    Returns { jobs: [{ sheetName, classId, jobId, total, preValidationErrors }] }.
 *
 * In both cases the client polls GET /import/:jobId/status for each jobId.
 */
export const importStudents = asyncHandler(async (req, res) => {
  const { classId } = req.body;
  const { buffer, originalname, mimetype } = req.file;

  let parsed;
  try {
    parsed = parseImportFile(buffer, originalname, mimetype);
  } catch (e) {
    return sendError(res, e.message, 400);
  }

  // ── Single-class mode ──────────────────────────────────────────────────────
  if (parsed.mode === 'single' || classId) {
    if (!classId) {
      return sendError(res, 'classId is required for single-class imports.', 400);
    }

    const cls = await Class.findOne({ _id: classId, schoolId: req.user.schoolId });
    if (!cls) return sendError(res, 'Class not found.', 404);

    // For multi-sheet Excel with an explicit classId, use the first sheet
    const rows = parsed.mode === 'multi' ? parsed.sheets[0]?.rows ?? [] : parsed.rows;
    const parseErrors = parsed.mode === 'multi' ? parsed.sheets[0]?.parseErrors ?? [] : parsed.parseErrors;

    if (rows.length === 0) {
      return sendError(res, `No valid rows found. Parse errors: ${parseErrors.length}`, 400);
    }

    const job = await importQueue.add(JOB_NAMES.IMPORT_STUDENTS_CSV, {
      jobId: null,
      schoolId: req.user.schoolId.toString(),
      requestedByUserId: req.user._id.toString(),
      classId,
      rows,
    });
    await job.updateData({ ...job.data, jobId: job.id });

    return sendSuccess(res, {
      message: `Import queued. ${rows.length} rows to process, ${parseErrors.length} pre-validation errors.`,
      jobId: job.id,
      total: rows.length,
      preValidationErrors: parseErrors,
    }, 202);
  }

  // ── All-classes mode (multi-sheet Excel, no classId) ──────────────────────
  if (parsed.sheets.length === 0) {
    return sendError(res, 'No worksheets found in the Excel file.', 400);
  }

  // Load all classes for this school once
  const allClasses = await Class.find({ schoolId: req.user.schoolId }).lean();
  const classByName = new Map(
    allClasses.map((c) => [c.name.toLowerCase().trim(), c])
  );
  // Also index by "name stream" combined
  for (const c of allClasses) {
    if (c.stream) {
      classByName.set(`${c.name} ${c.stream}`.toLowerCase().trim(), c);
    }
  }

  const enqueuedJobs = [];
  const unmatchedSheets = [];

  for (const sheet of parsed.sheets) {
    const nameLower = sheet.sheetName.toLowerCase().trim();
    const cls = classByName.get(nameLower);

    if (!cls) {
      unmatchedSheets.push(sheet.sheetName);
      continue;
    }

    if (sheet.rows.length === 0) continue;

    const job = await importQueue.add(JOB_NAMES.IMPORT_STUDENTS_CSV, {
      jobId: null,
      schoolId: req.user.schoolId.toString(),
      requestedByUserId: req.user._id.toString(),
      classId: cls._id.toString(),
      rows: sheet.rows,
    });
    await job.updateData({ ...job.data, jobId: job.id });

    enqueuedJobs.push({
      sheetName: sheet.sheetName,
      classId: cls._id.toString(),
      className: cls.stream ? `${cls.name} ${cls.stream}` : cls.name,
      jobId: job.id,
      total: sheet.rows.length,
      preValidationErrors: sheet.parseErrors,
    });
  }

  if (enqueuedJobs.length === 0) {
    return sendError(res, `No matching classes found. Unmatched sheets: ${unmatchedSheets.join(', ')}. Make sure each sheet name exactly matches a class name.`, 400);
  }

  return sendSuccess(res, {
    message: `${enqueuedJobs.length} class import job(s) queued.`,
    jobs: enqueuedJobs,
    unmatchedSheets,
  }, 202);
});

/**
 * GET /api/v1/students/import/:jobId/status
 * Reads import result from Redis. Returns 202 while still processing, 200 when done.
 */
export const getImportStatus = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const redis = getRedis();

  if (!redis) {
    return sendError(res, 'Import status unavailable (Redis not configured).', 503);
  }

  const raw = await redis.get(`import:result:${jobId}`);

  if (!raw) {
    // Not yet in Redis — either still processing or job ID is wrong
    return res.status(202).json({ status: 'processing', message: 'Import job is still running. Check back shortly.' });
  }

  const result = JSON.parse(raw);
  return sendSuccess(res, { result });
});
