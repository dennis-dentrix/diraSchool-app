/**
 * Receipt Worker — generates a PDF fee receipt for a completed payment.
 *
 * Job payload:
 *   { paymentId: string, schoolId: string }
 *
 * Flow:
 *   1. Fetch + populate Payment
 *   2. Render PDF receipt buffer via PDFKit
 *   3. Upload to Cloudinary
 *   4. Persist receiptUrl on Payment document
 */
import PDFDocument from 'pdfkit';
import Payment from '../../features/fees/Payment.model.js';
import School from '../../features/schools/School.model.js';
import SchoolSettings from '../../features/settings/SchoolSettings.model.js';
import { uploadBuffer, getFileBuffer } from '../helpers/r2Upload.js';
import logger from '../../config/logger.js';

// ── PDF renderer ──────────────────────────────────────────────────────────────
const slugifyPart = (value) =>
  String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'na';

const renderReceiptPdf = async (payment, branding) => {
  const schoolName = branding?.schoolName ?? 'School';
  const logoBuffer = branding?.logoBuffer ?? null;
  const motto = branding?.motto ?? '';
  const address = branding?.address ?? '';
  const county = branding?.county ?? '';
  const phone = branding?.phone ?? '';
  const email = branding?.email ?? '';
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40 });
    const chunks = [];

    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const student = payment.studentId;
    const W = 420; // A5 content width

    // Header
    doc.rect(0, 0, W + 80, 96).fill('#1a3c6e');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(16)
      .text(schoolName, 40, 10, { width: W, align: 'center' });
    const contactBits = [phone, email].filter(Boolean).join('  •  ');
    const addressLine = [address, county].filter(Boolean).join(', ');
    if (contactBits) {
      doc.font('Helvetica').fontSize(8)
        .text(contactBits, 40, 30, { width: W, align: 'center' });
    }
    if (addressLine) {
      doc.font('Helvetica').fontSize(8)
        .text(addressLine, 40, 40, { width: W, align: 'center' });
    }
    if (motto) {
      doc.font('Helvetica-Oblique').fontSize(7.5)
        .text(`"${motto}"`, 40, 50, { width: W, align: 'center' });
    }
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 44, 12, { fit: [44, 44] });
      } catch {
        // ignore bad image data
      }
    }
    doc.font('Helvetica').fontSize(10)
      .text('FEE PAYMENT RECEIPT', 40, 64, { width: W, align: 'center' });
    const receiptDate = new Date(payment.paymentDate ?? payment.createdAt);
    doc.fontSize(8).text(
      `Payment Date: ${receiptDate.toLocaleDateString('en-KE', { dateStyle: 'long' })}`,
      40, 80, { width: W, align: 'center' }
    );

    let y = 110;

    // Receipt details
    const className = payment.classId
      ? `${payment.classId.name}${payment.classId.stream ? ` ${payment.classId.stream}` : ''}`
      : '—';
    const rows = [
      ['Receipt No.',    payment.receiptNumber || '—'],
      ['Payment Date',   receiptDate.toLocaleDateString('en-KE', { dateStyle: 'medium' })],
      ['Student Name',   `${student.firstName} ${student.lastName}`],
      ['Admission No',   student.admissionNumber],
      ['Class',          className],
      ['Academic Year',  payment.academicYear],
      ['Term',           payment.term],
      ['Payment Method', payment.method.toUpperCase()],
      ['Reference',      payment.reference || '—'],
      ['Recorded By',    payment.recordedByUserId
        ? `${payment.recordedByUserId.firstName} ${payment.recordedByUserId.lastName}`
        : '—'],
      payment.notes ? ['Notes', payment.notes] : null,
    ].filter(Boolean);

    rows.forEach(([label, value], i) => {
      const bg = i % 2 === 0 ? '#f5f7fa' : 'white';
      doc.rect(40, y, W, 22).fill(bg);
      doc.rect(40, y, W, 22).strokeColor('#d0d7e2').lineWidth(0.4).stroke();
      doc.fillColor('#6b7280').font('Helvetica').fontSize(8).text(label, 48, y + 7, { width: W * 0.38 });
      doc.fillColor('#222222').font('Helvetica-Bold').fontSize(9).text(value, 48 + W * 0.38, y + 6, { width: W * 0.58 });
      y += 22;
    });

    y += 10;
    // Amount highlight
    doc.rect(40, y, W, 30).fill('#f4a11d');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(13)
      .text(`TOTAL PAID: KES ${payment.amount.toLocaleString()}`, 40, y + 8, { width: W, align: 'center' });

    y += 44;
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7)
      .text('This is an official receipt. Please retain for your records.', 40, y, { width: W, align: 'center' });
    doc.text('Powered by Diraschool', 40, y + 10, { width: W, align: 'center' });

    doc.end();
  });
};

// ── Worker handler ────────────────────────────────────────────────────────────

export const processReceiptJob = async (job) => {
  const { paymentId, schoolId } = job.data;

  logger.info('[Receipt] Generating fee receipt', { jobId: job.id, paymentId });

  const payment = await Payment.findOne({ _id: paymentId, schoolId })
    .populate('studentId', 'firstName lastName admissionNumber')
    .populate('classId', 'name stream')
    .populate('recordedByUserId', 'firstName lastName');

  if (!payment) {
    throw new Error(`Payment ${paymentId} not found for school ${schoolId}`);
  }

  const school = await School.findById(schoolId).select('name phone email address county');
  const settings = await SchoolSettings.findOne({ schoolId }).select('logo motto physicalAddress');

  const logoBuffer = settings?.logo ? await getFileBuffer(settings.logo).catch(() => null) : null;
  const pdfBuffer = await renderReceiptPdf(payment, {
    schoolName: school?.name ?? 'School',
    logoBuffer,
    motto: settings?.motto,
    phone: school?.phone,
    email: school?.email,
    address: settings?.physicalAddress || school?.address,
    county: school?.county,
  });

  const student = payment.studentId;
  const admission = slugifyPart(student.admissionNumber);
  const year = slugifyPart(payment.academicYear);
  const term = slugifyPart(payment.term);
  const publicId = `${admission}_${year}_${term}_${String(payment._id)}`;

  const upload = await uploadBuffer(pdfBuffer, {
    folder: `receipts/${schoolId}`,
    public_id: publicId,
    resource_type: 'raw',
    format: 'pdf',
  });

  if (upload?.publicId) {
    await Payment.updateOne({ _id: paymentId }, { receiptUrl: upload.publicId });
    logger.info('[Receipt] Receipt uploaded to R2', { jobId: job.id, key: upload.publicId });
  }

  return { paymentId, status: 'complete', receiptUrl: upload?.publicId ?? null };
};
