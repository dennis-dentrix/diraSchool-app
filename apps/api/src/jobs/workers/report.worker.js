/**
 * Report Worker — processes PDF generation jobs from the "report" queue.
 *
 * Job payload:
 *   { reportCardId: string, schoolId: string }
 *
 * Flow:
 *   1. Fetch + populate the ReportCard
 *   2. Render to PDF buffer via PDFKit
 *   3. Upload to Cloudinary (skipped if CLOUDINARY_* env vars are absent)
 *   4. Persist the pdfUrl on the ReportCard document
 */
import ReportCard from '../../features/report-cards/ReportCard.model.js';
import School from '../../features/schools/School.model.js';
import SchoolSettings from '../../features/settings/SchoolSettings.model.js';
import { renderReportCardPdf } from '../helpers/renderReportCardPdf.js';
import { uploadBuffer, getFileBuffer } from '../helpers/r2Upload.js';
import logger from '../../config/logger.js';
import { notifyUser } from '../../utils/notify.js';

const slugifyPart = (value) =>
  String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'na';

export const processReportJob = async (job) => {
  const { reportCardId, schoolId, requestedByUserId } = job.data;
  try {
    logger.info('[Report] Starting PDF generation', { jobId: job.id, reportCardId });

    // Atomic check-and-set: only proceed if not already being processed
    const updated = await ReportCard.findOneAndUpdate(
      { _id: reportCardId, pdfStatus: { $nin: ['processing', 'ready'] } },
      { $set: { pdfStatus: 'processing', pdfError: undefined } },
      { new: false }
    );
    if (!updated) {
      logger.info('[Report] Skipping duplicate job — already processing or ready', { jobId: job.id, reportCardId });
      return { reportCardId, status: 'skipped' };
    }

    // 1. Fetch report card with all populated refs
    const reportCard = await ReportCard.findOne({ _id: reportCardId, schoolId })
      .populate('studentId', 'firstName lastName admissionNumber gender dateOfBirth')
      .populate('classId', 'name stream levelCategory academicYear term');

    if (!reportCard) {
      throw new Error(`ReportCard ${reportCardId} not found for school ${schoolId}`);
    }

    // Fetch school profile + branding for the PDF header
    const school = await School.findById(schoolId).select('name phone email address county');
    const schoolName = school?.name ?? 'School';
    const settings = await SchoolSettings.findOne({ schoolId }).select('logo motto principalName physicalAddress');

    // 2. Render PDF
    const logoBuffer = settings?.logo ? await getFileBuffer(settings.logo).catch(() => null) : null;
    const pdfBuffer = await renderReportCardPdf(reportCard, {
      schoolName,
      logoBuffer,
      motto: settings?.motto,
      principalName: settings?.principalName,
      phone: school?.phone,
      email: school?.email,
      address: settings?.physicalAddress || school?.address,
      county: school?.county,
    });

    logger.info('[Report] PDF rendered', { jobId: job.id, bytes: pdfBuffer.length });

    // 3. Upload to Cloudinary
    const student = reportCard.studentId;
    const admission = slugifyPart(student.admissionNumber);
    const year = slugifyPart(reportCard.academicYear);
    const term = slugifyPart(reportCard.term);
    const publicId = `${admission}_${year}_${term}`;

    const upload = await uploadBuffer(pdfBuffer, {
      folder: `report-cards/${schoolId}`,
      public_id: publicId,
      resource_type: 'raw',
      format: 'pdf',
    });

    // 4. Persist URL (null if Cloudinary is not configured — URL stored when configured later)
    if (upload?.publicId) {
      await ReportCard.updateOne(
        { _id: reportCardId },
        {
          pdfUrl: upload.publicId,
          pdfPublicId: upload.publicId,
          pdfStatus: 'ready',
          pdfGeneratedAt: new Date(),
          pdfError: undefined,
        }
      );
      logger.info('[Report] PDF uploaded to R2', { jobId: job.id, key: upload.publicId });
      await notifyUser({
        schoolId,
        userId: requestedByUserId,
        type: 'success',
        title: 'Report Card PDF Ready',
        message: `${student.firstName} ${student.lastName} (${reportCard.term} ${reportCard.academicYear}) is ready to download.`,
        link: `/report-cards/${reportCardId}`,
        meta: { reportCardId },
      });
    } else {
      await ReportCard.updateOne(
        { _id: reportCardId },
        {
          pdfStatus: 'failed',
          pdfError: 'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
        }
      );
      logger.info('[Report] Cloudinary not configured — PDF not stored remotely', { jobId: job.id });
      await notifyUser({
        schoolId,
        userId: requestedByUserId,
        type: 'warning',
        title: 'Report Card PDF Failed',
        message: 'Cloudinary is not configured. Ask admin to set CLOUDINARY env keys.',
        link: `/report-cards/${reportCardId}`,
        meta: { reportCardId },
      });
    }

    return {
      reportCardId,
      status: 'complete',
      pdfUrl: upload?.url ?? null,
      student: `${student.firstName} ${student.lastName}`,
    };
  } catch (err) {
    await ReportCard.updateOne(
      { _id: reportCardId },
      { pdfStatus: 'failed', pdfError: err.message }
    );
    await notifyUser({
      schoolId,
      userId: requestedByUserId,
      type: 'error',
      title: 'Report Card PDF Failed',
      message: err.message,
      link: `/report-cards/${reportCardId}`,
      meta: { reportCardId },
    });
    throw err;
  }
};
