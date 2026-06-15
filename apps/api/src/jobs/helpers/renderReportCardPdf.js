/**
 * renderReportCardPdf — generates a PDF buffer for a populated ReportCard document.
 *
 * @param {Object} reportCard  — fully populated ReportCard mongoose doc
 * @param {Object} options
 * @param {string} options.schoolName  — display name of the school
 * @param {Buffer} [options.logoBuffer] — school logo as a pre-fetched buffer
 * @param {string} [options.motto]     — school motto
 * @param {string} [options.principalName] — principal name
 * @param {string} [options.phone]     — school phone
 * @param {string} [options.email]     — school email
 * @param {string} [options.address]   — school address
 * @param {string} [options.county]    — school county
 * @returns {Promise<Buffer>}  — PDF bytes ready for Cloudinary / disk / stream
 */
import PDFDocument from 'pdfkit';

// ── Colour palette ────────────────────────────────────────────────────────────
const COLORS = {
  primary: '#1a3c6e',
  accent: '#f4a11d',
  light: '#f5f7fa',
  border: '#d0d7e2',
  text: '#222222',
  muted: '#6b7280',
};

// ── Layout constants ──────────────────────────────────────────────────────────
const MARGIN = 40;
const PAGE_WIDTH = 595; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const fillRect = (doc, x, y, w, h, color) => {
  doc.save().rect(x, y, w, h).fill(color).restore();
};

const fallbackSerial = (reportCard) =>
  `RPT-${reportCard.academicYear || new Date().getFullYear()}-${reportCard._id.toString().slice(-6).toUpperCase()}`;

export const renderReportCardPdf = async (reportCard, options = {}) => {
  const schoolName = options.schoolName ?? 'School';
  const motto = options.motto ?? '';
  const principalName = options.principalName ?? '';
  const phone = options.phone ?? '';
  const email = options.email ?? '';
  const address = options.address ?? '';
  const county = options.county ?? '';
  const documentSerial = reportCard.documentSerial ?? fallbackSerial(reportCard);

  const logoBuffer = options.logoBuffer ?? null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const student = reportCard.studentId ?? {};
    const cls = reportCard.classId ?? {};
    const classYear = cls.academicYear ?? reportCard.academicYear ?? '—';
    const classTerm = cls.term ?? reportCard.term ?? '—';
    const className = cls.name ?? '—';
    const classStream = cls.stream ? ` (${cls.stream})` : '';
    const classLevel = cls.levelCategory ?? '—';
    const studentName = `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || '—';
    const admissionNumber = student.admissionNumber ?? '—';

    // Header band
    fillRect(doc, 0, 0, PAGE_WIDTH, 108, COLORS.primary);

    doc
      .fillColor('white')
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(schoolName, MARGIN, 14, { width: CONTENT_WIDTH, align: 'center' });

    const contactBits = [phone, email].filter(Boolean).join('  •  ');
    const addressLine = [address, county].filter(Boolean).join(', ');
    if (contactBits) {
      doc
        .fillColor('white')
        .font('Helvetica')
        .fontSize(9)
        .text(contactBits, MARGIN, 36, { width: CONTENT_WIDTH, align: 'center' });
    }
    if (addressLine) {
      doc
        .fillColor('white')
        .font('Helvetica')
        .fontSize(9)
        .text(addressLine, MARGIN, 48, { width: CONTENT_WIDTH, align: 'center' });
    }
    if (motto) {
      doc
        .fillColor('white')
        .font('Helvetica-Oblique')
        .fontSize(8)
        .text(`"${motto}"`, MARGIN, 60, { width: CONTENT_WIDTH, align: 'center' });
    }

    doc
      .fontSize(11)
      .font('Helvetica')
      .text('STUDENT ACADEMIC REPORT CARD', MARGIN, 74, { width: CONTENT_WIDTH, align: 'center' });

    doc
      .fontSize(9)
      .text(`${classYear}  •  ${classTerm}  •  Serial: ${documentSerial}`, MARGIN, 90, {
        width: CONTENT_WIDTH,
        align: 'center',
      });

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, MARGIN + 4, 14, { fit: [54, 54], align: 'left', valign: 'top' });
      } catch {
        // ignore invalid image payload
      }
    }

    let y = 124;
    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 50, COLORS.light);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 50).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    const infoItems = [
      ['Student', studentName],
      ['Adm. No', admissionNumber],
      ['Class', `${className}${classStream}`],
      ['Level', classLevel],
    ];

    const colW = CONTENT_WIDTH / infoItems.length;
    infoItems.forEach(([label, value], i) => {
      const x = MARGIN + i * colW + 8;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(label, x, y + 8);
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10).text(value, x, y + 22, {
        width: colW - 12,
      });
    });

    y += 62;

    const COL = {
      subject: MARGIN,
      grade: MARGIN + CONTENT_WIDTH * 0.55,
      points: MARGIN + CONTENT_WIDTH * 0.72,
      avg: MARGIN + CONTENT_WIDTH * 0.84,
    };

    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 20, COLORS.primary);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
    doc.text('Subject', COL.subject + 4, y + 5);
    doc.text('Grade', COL.grade, y + 5);
    doc.text('Points', COL.points, y + 5);
    doc.text('Avg %', COL.avg, y + 5);
    y += 20;

    const subjects = reportCard.subjects || [];
    subjects.forEach((subj, idx) => {
      const rowBg = idx % 2 === 0 ? 'white' : COLORS.light;
      fillRect(doc, MARGIN, y, CONTENT_WIDTH, 18, rowBg);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 18).strokeColor(COLORS.border).lineWidth(0.3).stroke();

      doc.fillColor(COLORS.text).font('Helvetica').fontSize(9);
      const subjLabel = subj.subjectCode ? `${subj.subjectName} (${subj.subjectCode})` : subj.subjectName;
      doc.text(subjLabel, COL.subject + 4, y + 4, { width: CONTENT_WIDTH * 0.5 });
      doc.text(subj.grade ?? '–', COL.grade, y + 4);
      doc.text(subj.points != null ? String(subj.points) : '–', COL.points, y + 4);
      doc.text(`${subj.averagePercentage.toFixed(1)}%`, COL.avg, y + 4);
      y += 18;
    });

    y += 4;
    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 22, COLORS.accent);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
    doc.text('OVERALL SUMMARY', COL.subject + 4, y + 6);
    doc.text(reportCard.overallGrade ?? '–', COL.grade, y + 6);
    doc.text(reportCard.totalPoints != null ? String(reportCard.totalPoints) : '–', COL.points, y + 6);
    doc.text(`${(reportCard.averagePoints ?? 0).toFixed(2)} pts`, COL.avg, y + 6);
    y += 30;

    const att = reportCard.attendanceSummary || {};
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(10).text('Attendance Summary', MARGIN, y);
    y += 14;

    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 22, COLORS.light);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 22).strokeColor(COLORS.border).lineWidth(0.5).stroke();

    const attItems = [
      ['Total Days', att.totalDays ?? 0],
      ['Present', att.present ?? 0],
      ['Absent', att.absent ?? 0],
      ['Late', att.late ?? 0],
      ['Excused', att.excused ?? 0],
    ];

    const attColW = CONTENT_WIDTH / attItems.length;
    attItems.forEach(([label, val], i) => {
      const ax = MARGIN + i * attColW + 8;
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(label, ax, y + 4);
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10).text(String(val), ax + 2, y + 12);
    });
    y += 32;

    if (reportCard.teacherRemarks || reportCard.principalRemarks) {
      doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(10).text('Remarks', MARGIN, y);
      y += 14;

      if (reportCard.teacherRemarks) {
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text('Class Teacher:', MARGIN, y);
        y += 11;
        doc.fillColor(COLORS.text).font('Helvetica').fontSize(9).text(reportCard.teacherRemarks, MARGIN, y, {
          width: CONTENT_WIDTH,
        });
        y += doc.heightOfString(reportCard.teacherRemarks, { width: CONTENT_WIDTH }) + 8;
      }

      if (reportCard.principalRemarks) {
        doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text('Principal / Head Teacher:', MARGIN, y);
        y += 11;
        doc.fillColor(COLORS.text).font('Helvetica').fontSize(9).text(reportCard.principalRemarks, MARGIN, y, {
          width: CONTENT_WIDTH,
        });
      }
    }

    if (principalName) {
      doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8).text(`Principal: ${principalName}`, MARGIN, 796, {
        width: CONTENT_WIDTH,
        align: 'left',
      });
    }
    if (motto) {
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8).text(`"${motto}"`, MARGIN, 796, {
        width: CONTENT_WIDTH,
        align: 'right',
      });
    }

    fillRect(doc, 0, 810, PAGE_WIDTH, 32, COLORS.light);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7).text(
      `Serial: ${documentSerial}  •  Generated by Diraschool  •  ${new Date().toLocaleDateString('en-KE', { dateStyle: 'long' })}`,
      MARGIN,
      818,
      { width: CONTENT_WIDTH, align: 'center' }
    );

    doc.end();
  });
};
