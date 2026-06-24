/**
 * renderFeesSummaryPdf — generates a weekly fees collection summary PDF.
 *
 * @param {Object} options
 * @param {string} options.schoolName
 * @param {Buffer|null} options.logoBuffer
 * @param {string} options.weekLabel
 * @param {string} options.term
 * @param {string} options.academicYear
 * @param {Array}  options.rows  — [{ className, expected, collected, outstanding, studentCount, paidCount }]
 * @param {number} options.weeklyTotal  — total collected this week specifically
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
  amber: '#d97706',
};

const MARGIN = 40;
const PAGE_WIDTH = 595;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const fillRect = (doc, x, y, w, h, color) =>
  doc.save().rect(x, y, w, h).fill(color).restore();

const ksh = (n) => `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const renderFeesSummaryPdf = async ({ schoolName, logoBuffer, weekLabel, term, academicYear, rows, weeklyTotal = 0 }) => {
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
      .text('WEEKLY FEES COLLECTION SUMMARY', MARGIN + 60, 38, { width: CONTENT_WIDTH - 60 });
    doc.fontSize(9)
      .text(`${term} ${academicYear}  |  Week: ${weekLabel}`, MARGIN + 60, 52, { width: CONTENT_WIDTH - 60 });
    doc.fontSize(8)
      .text(`Generated: ${new Date().toLocaleDateString('en-KE', { dateStyle: 'full' })}`, MARGIN + 60, 64, { width: CONTENT_WIDTH - 60 });

    // ── Weekly collection highlight ──────────────────────────────────────────
    let y = 106;
    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 28, '#e8f5e9');
    doc.rect(MARGIN, y, CONTENT_WIDTH, 28).strokeColor('#a5d6a7').lineWidth(0.5).stroke();
    doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(9)
      .text(`Collected this week: ${ksh(weeklyTotal)}`, MARGIN + 8, y + 9);
    y += 36;

    // ── Table header ─────────────────────────────────────────────────────────
    const COL = {
      class:       MARGIN,
      students:    MARGIN + CONTENT_WIDTH * 0.30,
      expected:    MARGIN + CONTENT_WIDTH * 0.42,
      collected:   MARGIN + CONTENT_WIDTH * 0.60,
      outstanding: MARGIN + CONTENT_WIDTH * 0.78,
    };

    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 20, COLORS.primary);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    doc.text('Class / Stream', COL.class + 4, y + 6, { width: 120 });
    doc.text('Students', COL.students, y + 6, { width: 60, align: 'right' });
    doc.text('Expected (KES)', COL.expected, y + 6, { width: 80, align: 'right' });
    doc.text('Collected (KES)', COL.collected, y + 6, { width: 80, align: 'right' });
    doc.text('Outstanding (KES)', COL.outstanding, y + 6, { width: 80, align: 'right' });
    y += 20;

    // ── Rows ─────────────────────────────────────────────────────────────────
    let grandExpected = 0, grandCollected = 0, grandOutstanding = 0, grandStudents = 0;

    rows.forEach((row, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : COLORS.light;
      fillRect(doc, MARGIN, y, CONTENT_WIDTH, 18, bg);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 18).strokeColor(COLORS.border).lineWidth(0.3).stroke();

      const outstanding = row.outstanding ?? (row.expected - row.collected);
      const outstandingColor = outstanding > 50000 ? COLORS.red : outstanding > 0 ? COLORS.amber : COLORS.green;

      doc.fillColor(COLORS.text).font('Helvetica').fontSize(8);
      doc.text(row.className, COL.class + 4, y + 5, { width: 120 });
      doc.text(String(row.studentCount || 0), COL.students, y + 5, { width: 60, align: 'right' });
      doc.text(ksh(row.expected || 0), COL.expected, y + 5, { width: 80, align: 'right' });
      doc.fillColor(COLORS.green).text(ksh(row.collected || 0), COL.collected, y + 5, { width: 80, align: 'right' });
      doc.fillColor(outstandingColor).text(ksh(outstanding), COL.outstanding, y + 5, { width: 80, align: 'right' });

      grandExpected += row.expected || 0;
      grandCollected += row.collected || 0;
      grandOutstanding += outstanding;
      grandStudents += row.studentCount || 0;

      y += 18;
      if (y > 750) { doc.addPage(); y = MARGIN; }
    });

    // ── Totals ───────────────────────────────────────────────────────────────
    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 22, COLORS.primary);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    doc.text('TOTALS', COL.class + 4, y + 7, { width: 120 });
    doc.text(String(grandStudents), COL.students, y + 7, { width: 60, align: 'right' });
    doc.text(ksh(grandExpected), COL.expected, y + 7, { width: 80, align: 'right' });
    doc.text(ksh(grandCollected), COL.collected, y + 7, { width: 80, align: 'right' });
    doc.text(ksh(grandOutstanding), COL.outstanding, y + 7, { width: 80, align: 'right' });

    // ── Collection rate ──────────────────────────────────────────────────────
    y += 32;
    const rate = grandExpected > 0 ? ((grandCollected / grandExpected) * 100).toFixed(1) : '0.0';
    fillRect(doc, MARGIN, y, CONTENT_WIDTH, 22, COLORS.light);
    doc.rect(MARGIN, y, CONTENT_WIDTH, 22).strokeColor(COLORS.border).lineWidth(0.5).stroke();
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(9)
      .text(`Overall collection rate: ${rate}%`, MARGIN + 8, y + 7);

    doc.end();
  });
};
