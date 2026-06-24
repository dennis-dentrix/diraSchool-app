/**
 * renderAttendanceSummaryPdf — generates a weekly student attendance summary PDF.
 *
 * @param {Object} options
 * @param {string} options.schoolName
 * @param {Buffer|null} options.logoBuffer
 * @param {string} options.weekLabel  — e.g. "16 Jun – 20 Jun 2025"
 * @param {Array}  options.rows       — [{ className, total, present, absent, late, rate }]
 * @returns {Promise<Buffer>}
 */
import PDFDocument from 'pdfkit';

const COLORS = {
  primary: '#1a3c6e',
  accent: '#f4a11d',
  light: '#f5f7fa',
  border: '#d0d7e2',
  text: '#222222',
  muted: '#6b7280',
  green: '#16a34a',
  red: '#dc2626',
};

const MARGIN = 40;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const fillRect = (doc, x, y, w, h, color) =>
  doc.save().rect(x, y, w, h).fill(color).restore();

export const renderAttendanceSummaryPdf = async ({ schoolName, logoBuffer, weekLabel, rows }) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header bar ──────────────────────────────────────────────────────────
    fillRect(doc, 0, 0, PAGE_WIDTH, 90, COLORS.primary);

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, MARGIN, 10, { height: 50, fit: [50, 50] });
      } catch { /* non-fatal */ }
    }

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(schoolName.toUpperCase(), MARGIN + 60, 18, { width: CONTENT_WIDTH - 60, align: 'left' });

    doc
      .font('Helvetica')
      .fontSize(10)
      .text('WEEKLY STUDENT ATTENDANCE SUMMARY', MARGIN + 60, 38, { width: CONTENT_WIDTH - 60 });

    doc
      .fontSize(9)
      .text(`Week: ${weekLabel}`, MARGIN + 60, 52, { width: CONTENT_WIDTH - 60 });

    doc
      .fontSize(8)
      .text(`Generated: ${new Date().toLocaleDateString('en-KE', { dateStyle: 'full' })}`, MARGIN + 60, 64, { width: CONTENT_WIDTH - 60 });

    // ── Table header ────────────────────────────────────────────────────────
    const COL = {
      class:   MARGIN,
      total:   MARGIN + CONTENT_WIDTH * 0.38,
      present: MARGIN + CONTENT_WIDTH * 0.51,
      absent:  MARGIN + CONTENT_WIDTH * 0.64,
      late:    MARGIN + CONTENT_WIDTH * 0.76,
      rate:    MARGIN + CONTENT_WIDTH * 0.88,
    };

    let y = 108;
    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 20, COLORS.primary);

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    doc.text('Class / Stream', COL.class + 4, y + 6, { width: 140 });
    doc.text('Total', COL.total, y + 6, { width: 50, align: 'right' });
    doc.text('Present', COL.present, y + 6, { width: 50, align: 'right' });
    doc.text('Absent', COL.absent, y + 6, { width: 50, align: 'right' });
    doc.text('Late', COL.late, y + 6, { width: 50, align: 'right' });
    doc.text('Rate %', COL.rate, y + 6, { width: 45, align: 'right' });

    y += 20;

    // ── Rows ────────────────────────────────────────────────────────────────
    let totalStudents = 0, totalPresent = 0, totalAbsent = 0, totalLate = 0;

    rows.forEach((row, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : COLORS.light;
      fillRect(doc, MARGIN, y, CONTENT_WIDTH, 18, bg);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 18).strokeColor(COLORS.border).lineWidth(0.3).stroke();

      const rate = row.total > 0 ? ((row.present / row.total) * 100).toFixed(1) : '0.0';
      const rateColor = parseFloat(rate) >= 80 ? COLORS.green : COLORS.red;

      doc.fillColor(COLORS.text).font('Helvetica').fontSize(8);
      doc.text(row.className, COL.class + 4, y + 5, { width: 140 });
      doc.text(String(row.total), COL.total, y + 5, { width: 50, align: 'right' });
      doc.text(String(row.present), COL.present, y + 5, { width: 50, align: 'right' });
      doc.text(String(row.absent), COL.absent, y + 5, { width: 50, align: 'right' });
      doc.text(String(row.late), COL.late, y + 5, { width: 50, align: 'right' });
      doc.fillColor(rateColor).text(`${rate}%`, COL.rate, y + 5, { width: 45, align: 'right' });

      totalStudents += row.total;
      totalPresent += row.present;
      totalAbsent += row.absent;
      totalLate += row.late;
      y += 18;

      if (y > 750) {
        doc.addPage();
        y = MARGIN;
      }
    });

    // ── Totals row ──────────────────────────────────────────────────────────
    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 20, COLORS.primary);
    const overallRate = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : '0.0';

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    doc.text('SCHOOL TOTAL', COL.class + 4, y + 6, { width: 140 });
    doc.text(String(totalStudents), COL.total, y + 6, { width: 50, align: 'right' });
    doc.text(String(totalPresent), COL.present, y + 6, { width: 50, align: 'right' });
    doc.text(String(totalAbsent), COL.absent, y + 6, { width: 50, align: 'right' });
    doc.text(String(totalLate), COL.late, y + 6, { width: 50, align: 'right' });
    doc.text(`${overallRate}%`, COL.rate, y + 6, { width: 45, align: 'right' });

    doc.end();
  });
};
