/**
 * renderCheckinSummaryPdf — generates a weekly teacher check-in summary PDF.
 *
 * @param {Object} options
 * @param {string} options.schoolName
 * @param {Buffer|null} options.logoBuffer
 * @param {string} options.weekLabel
 * @param {Array}  options.rows  — [{ name, role, daysIn, daysOut, onTime, late, missing }]
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
  amber: '#d97706',
  red: '#dc2626',
};

const MARGIN = 40;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const fillRect = (doc, x, y, w, h, color) =>
  doc.save().rect(x, y, w, h).fill(color).restore();

export const renderCheckinSummaryPdf = async ({ schoolName, logoBuffer, weekLabel, rows, schoolDays = 5 }) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, autoFirstPage: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header ───────────────────────────────────────────────────────────────
    fillRect(doc, 0, 0, PAGE_WIDTH, 90, COLORS.primary);

    if (logoBuffer) {
      try { doc.image(logoBuffer, MARGIN, 10, { height: 50, fit: [50, 50] }); } catch { /* non-fatal */ }
    }

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15)
      .text(schoolName.toUpperCase(), MARGIN + 60, 18, { width: CONTENT_WIDTH - 60 });
    doc.font('Helvetica').fontSize(10)
      .text('WEEKLY TEACHER CHECK-IN REPORT', MARGIN + 60, 38, { width: CONTENT_WIDTH - 60 });
    doc.fontSize(9)
      .text(`Week: ${weekLabel}  |  School days: ${schoolDays}`, MARGIN + 60, 52, { width: CONTENT_WIDTH - 60 });
    doc.fontSize(8)
      .text(`Generated: ${new Date().toLocaleDateString('en-KE', { dateStyle: 'full' })}`, MARGIN + 60, 64, { width: CONTENT_WIDTH - 60 });

    // ── Table header ─────────────────────────────────────────────────────────
    const COL = {
      name:    MARGIN,
      role:    MARGIN + CONTENT_WIDTH * 0.32,
      daysIn:  MARGIN + CONTENT_WIDTH * 0.50,
      onTime:  MARGIN + CONTENT_WIDTH * 0.62,
      late:    MARGIN + CONTENT_WIDTH * 0.74,
      missing: MARGIN + CONTENT_WIDTH * 0.87,
    };

    let y = 108;
    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 20, COLORS.primary);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    doc.text('Staff Member', COL.name + 4, y + 6, { width: 120 });
    doc.text('Role', COL.role, y + 6, { width: 80 });
    doc.text('Days In', COL.daysIn, y + 6, { width: 50, align: 'right' });
    doc.text('On Time', COL.onTime, y + 6, { width: 50, align: 'right' });
    doc.text('Late', COL.late, y + 6, { width: 50, align: 'right' });
    doc.text('Missing', COL.missing, y + 6, { width: 45, align: 'right' });
    y += 20;

    // ── Rows ─────────────────────────────────────────────────────────────────
    rows.forEach((row, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : COLORS.light;
      fillRect(doc, MARGIN, y, CONTENT_WIDTH, 18, bg);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 18).strokeColor(COLORS.border).lineWidth(0.3).stroke();

      const missingColor = row.missing > 2 ? COLORS.red : row.missing > 0 ? COLORS.amber : COLORS.text;

      doc.fillColor(COLORS.text).font('Helvetica').fontSize(8);
      doc.text(row.name, COL.name + 4, y + 5, { width: 120 });
      doc.text(row.role || '—', COL.role, y + 5, { width: 80 });
      doc.text(String(row.daysIn), COL.daysIn, y + 5, { width: 50, align: 'right' });
      doc.text(String(row.onTime), COL.onTime, y + 5, { width: 50, align: 'right' });
      doc.fillColor(row.late > 0 ? COLORS.amber : COLORS.text).text(String(row.late), COL.late, y + 5, { width: 50, align: 'right' });
      doc.fillColor(missingColor).text(String(row.missing), COL.missing, y + 5, { width: 45, align: 'right' });

      y += 18;
      if (y > 750) { doc.addPage(); y = MARGIN; }
    });

    // ── Summary note ─────────────────────────────────────────────────────────
    y += 12;
    const flagged = rows.filter((r) => r.missing >= 3);
    if (flagged.length) {
      fillRect(doc, MARGIN, y, CONTENT_WIDTH, 14 + flagged.length * 12, '#fef2f2');
      doc.rect(MARGIN, y, CONTENT_WIDTH, 14 + flagged.length * 12).strokeColor('#fca5a5').lineWidth(0.5).stroke();
      doc.fillColor(COLORS.red).font('Helvetica-Bold').fontSize(8)
        .text('Staff with 3+ missing days this week:', MARGIN + 6, y + 4);
      y += 14;
      flagged.forEach((r) => {
        doc.font('Helvetica').fillColor(COLORS.red).fontSize(8)
          .text(`• ${r.name} (${r.missing} day${r.missing > 1 ? 's' : ''} missing)`, MARGIN + 10, y);
        y += 12;
      });
    }

    doc.end();
  });
};
