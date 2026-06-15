import PDFDocument from 'pdfkit';
import LessonPlan from './LessonPlan.model.js';
import User from '../users/User.model.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess, sendError, sendForbidden } from '../../utils/response.js';
import { uploadBuffer, deleteFile } from '../../jobs/helpers/r2Upload.js';
import { ROLES } from '../../constants/index.js';

const VIEWER_ROLES = [
  ROLES.SCHOOL_ADMIN,
  ROLES.DIRECTOR,
  ROLES.HEADTEACHER,
  ROLES.DEPUTY_HEADTEACHER,
];
const SHARER_ROLES = VIEWER_ROLES;

function canView(user, plan) {
  if (VIEWER_ROLES.includes(user.role)) return true;
  const uid = String(user._id);
  if (String(plan.teacherId?._id ?? plan.teacherId) === uid) return true;
  return plan.sharedWith?.some((id) => String(id) === uid);
}

// Build a PDF buffer from an array of image buffers (one page per image, A4)
async function buildPdfFromImages(imageBuffers) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PAGE_W = 595.28; // A4 points
    const PAGE_H = 841.89;

    for (const buf of imageBuffers) {
      doc.addPage({ size: 'A4', margin: 0 });
      try {
        doc.image(buf, 0, 0, { fit: [PAGE_W, PAGE_H], align: 'center', valign: 'center' });
      } catch {
        // If image format unsupported by PDFKit, skip silently
      }
    }

    doc.end();
  });
}

// POST /lesson-plans  (multipart/form-data with field "images")
export const uploadLessonPlan = asyncHandler(async (req, res) => {
  const { title, description, type, academicYear, term, weekNumber, classId, subjectId } = req.body;

  if (!title || !academicYear || !term) {
    return sendError(res, 'title, academicYear, and term are required.', 400);
  }

  const files = req.files ?? [];

  // Upload all images to Cloudinary in parallel
  const uploadedImages = await Promise.all(
    files.map((file, idx) =>
      uploadBuffer(file.buffer, {
        folder: `lesson-plans/${req.user.schoolId}`,
        public_id: `${req.user._id}_${Date.now()}_${idx}`,
        resource_type: 'image',
        quality: 'auto:good',
        fetch_format: 'auto',
        transformation: [{ width: 2000, crop: 'limit' }],
      })
    )
  );

  const images = uploadedImages.filter(Boolean).map((u) => ({ url: u.publicId, publicId: u.publicId }));

  if (files.length > 0 && images.length === 0) {
    return sendError(res, 'File storage is not configured. Please contact your system administrator.', 503);
  }

  // Generate PDF from the same in-memory buffers
  let pdfUrl,
    pdfPublicId,
    pdfStatus = 'none';
  if (files.length > 0) {
    try {
      const pdfBuffer = await buildPdfFromImages(files.map((f) => f.buffer));
      const pdfUpload = await uploadBuffer(pdfBuffer, {
        folder: `lesson-plans-pdf/${req.user.schoolId}`,
        public_id: `${req.user._id}_${Date.now()}_plan`,
        resource_type: 'raw',
        format: 'pdf',
      });
      if (pdfUpload?.publicId) {
        pdfUrl = pdfUpload.publicId;
        pdfPublicId = pdfUpload.publicId;
        pdfStatus = 'ready';
      } else {
        pdfStatus = 'failed';
      }
    } catch {
      pdfStatus = 'failed';
    }
  }

  const plan = await LessonPlan.create({
    schoolId: req.user.schoolId,
    teacherId: req.user._id,
    classId: classId || undefined,
    subjectId: subjectId || undefined,
    title: title.trim(),
    description: description?.trim(),
    type: type || 'lesson_plan',
    academicYear,
    term,
    weekNumber: weekNumber ? Number(weekNumber) : undefined,
    images,
    pdfUrl,
    pdfPublicId,
    pdfStatus,
  });

  return sendSuccess(res, { plan }, 201);
});

// GET /lesson-plans
export const listLessonPlans = asyncHandler(async (req, res) => {
  const { academicYear, term, teacherId, classId, type } = req.query;
  const filter = { schoolId: req.user.schoolId };

  if (academicYear) filter.academicYear = academicYear;
  if (term) filter.term = term;
  if (classId) filter.classId = classId;
  if (type) filter.type = type;

  if (!VIEWER_ROLES.includes(req.user.role)) {
    filter.$or = [{ teacherId: req.user._id }, { sharedWith: req.user._id }];
    if (teacherId && String(teacherId) === String(req.user._id)) {
      delete filter.$or;
      filter.teacherId = req.user._id;
    }
  } else if (teacherId) {
    filter.teacherId = teacherId;
  }

  const plans = await LessonPlan.find(filter)
    .populate('teacherId', 'firstName lastName staffId')
    .populate('classId', 'name stream')
    .populate('subjectId', 'name')
    .populate('sharedWith', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();

  return sendSuccess(res, { plans, total: plans.length });
});

// GET /lesson-plans/:id
export const getLessonPlan = asyncHandler(async (req, res) => {
  const plan = await LessonPlan.findOne({ _id: req.params.id, schoolId: req.user.schoolId })
    .populate('teacherId', 'firstName lastName staffId')
    .populate('classId', 'name stream')
    .populate('subjectId', 'name')
    .populate('sharedWith', 'firstName lastName staffId')
    .lean();

  if (!plan) return sendError(res, 'Lesson plan not found.', 404);
  if (!canView(req.user, plan))
    return sendForbidden(res, 'You do not have access to this lesson plan.');

  return sendSuccess(res, { plan });
});

// DELETE /lesson-plans/:id
export const deleteLessonPlan = asyncHandler(async (req, res) => {
  const plan = await LessonPlan.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!plan) return sendError(res, 'Lesson plan not found.', 404);

  const isOwner = String(plan.teacherId) === String(req.user._id);
  const isAdminRole = VIEWER_ROLES.includes(req.user.role);
  if (!isOwner && !isAdminRole)
    return sendForbidden(res, 'Only the owner or an administrator can delete this plan.');

  // Clean up Cloudinary assets
  await Promise.allSettled([
    ...plan.images.map((img) => deleteFile(img.publicId, { resource_type: 'image' })),
    plan.pdfPublicId ? deleteFile(plan.pdfPublicId, { resource_type: 'raw' }) : Promise.resolve(),
  ]);

  await plan.deleteOne();
  return sendSuccess(res, { message: 'Lesson plan deleted.' });
});

// POST /lesson-plans/:id/share
export const shareLessonPlan = asyncHandler(async (req, res) => {
  if (!SHARER_ROLES.includes(req.user.role)) {
    return sendForbidden(res, 'Only school administrators can share lesson plans.');
  }

  const { teacherId } = req.body;
  if (!teacherId) return sendError(res, 'teacherId is required.', 400);

  const [plan, teacher] = await Promise.all([
    LessonPlan.findOne({ _id: req.params.id, schoolId: req.user.schoolId }),
    User.findOne({ _id: teacherId, schoolId: req.user.schoolId, isActive: true }),
  ]);

  if (!plan) return sendError(res, 'Lesson plan not found.', 404);
  if (!teacher) return sendError(res, 'Teacher not found in this school.', 404);

  if (!plan.sharedWith.some((id) => String(id) === String(teacherId))) {
    plan.sharedWith.push(teacherId);
    await plan.save();
  }

  return sendSuccess(res, {
    message: `Lesson plan shared with ${teacher.firstName} ${teacher.lastName}.`,
  });
});

// DELETE /lesson-plans/:id/share/:teacherId
export const unshareLessonPlan = asyncHandler(async (req, res) => {
  if (!SHARER_ROLES.includes(req.user.role)) {
    return sendForbidden(res, 'Only school administrators can manage lesson plan access.');
  }

  const plan = await LessonPlan.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
  if (!plan) return sendError(res, 'Lesson plan not found.', 404);

  plan.sharedWith = plan.sharedWith.filter((id) => String(id) !== req.params.teacherId);
  await plan.save();

  return sendSuccess(res, { message: 'Access removed.' });
});
