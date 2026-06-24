/**
 * Weekly Summary Worker
 *
 * Runs every Saturday at 05:00 EAT (02:00 UTC).
 * For each active school that was in session during the past Mon–Fri:
 *   1. Generates 3 PDFs: attendance summary, teacher check-ins, fees summary
 *   2. Emails them to the school admin email as separate attachments
 *
 * "In session" = at least one attendance record exists for that week.
 */
import mongoose from 'mongoose';
import School from '../../features/schools/School.model.js';
import SchoolSettings from '../../features/settings/SchoolSettings.model.js';
import Attendance from '../../features/attendance/Attendance.model.js';
import CheckIn from '../../features/checkins/CheckIn.model.js';
import Payment from '../../features/fees/Payment.model.js';
import FeeStructure from '../../features/fees/FeeStructure.model.js';
import Student from '../../features/students/Student.model.js';
import { renderAttendanceSummaryPdf } from '../helpers/renderAttendanceSummaryPdf.js';
import { renderCheckinSummaryPdf } from '../helpers/renderCheckinSummaryPdf.js';
import { renderFeesSummaryPdf } from '../helpers/renderFeesSummaryPdf.js';
import { getFileBuffer } from '../helpers/r2Upload.js';
import { sendWeeklySummaryEmail } from '../../services/email.service.js';
import { getCurrentTermAndYear } from '../../utils/term.js';
import logger from '../../config/logger.js';

// ── Date helpers ──────────────────────────────────────────────────────────────

const getWeekBounds = () => {
  // Called Saturday morning EAT — we want Mon 00:00 to Fri 23:59:59 EAT.
  // EAT = UTC+3, so Mon 00:00 EAT = Sun 21:00 UTC.
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 6 = Saturday
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const mondayEAT = new Date(now);
  mondayEAT.setUTCDate(now.getUTCDate() - daysToMonday);
  mondayEAT.setUTCHours(0 - 3, 0, 0, 0); // EAT midnight = UTC-3h

  const fridayEAT = new Date(mondayEAT);
  fridayEAT.setUTCDate(mondayEAT.getUTCDate() + 4);
  fridayEAT.setUTCHours(fridayEAT.getUTCHours() + 23);
  fridayEAT.setUTCMinutes(59, 59, 999);

  const weekLabel = `${mondayEAT.toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi',
  })} – ${fridayEAT.toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi',
  })}`;

  return { monday: mondayEAT, friday: fridayEAT, weekLabel };
};

// ── Attendance data ───────────────────────────────────────────────────────────

const buildAttendanceRows = async (schoolId, monday, friday) => {
  const registers = await Attendance.find({
    schoolId,
    date: { $gte: monday, $lte: friday },
    status: 'submitted',
  })
    .populate('classId', 'name stream')
    .lean();

  const classMap = new Map();
  for (const reg of registers) {
    const key = String(reg.classId?._id ?? reg.classId);
    const className = reg.classId
      ? [reg.classId.name, reg.classId.stream].filter(Boolean).join(' ')
      : 'Unknown Class';

    if (!classMap.has(key)) classMap.set(key, { className, total: 0, present: 0, absent: 0, late: 0 });
    const c = classMap.get(key);
    for (const entry of reg.entries) {
      c.total++;
      if (entry.status === 'present') c.present++;
      else if (entry.status === 'absent') c.absent++;
      else if (entry.status === 'late') c.late++;
    }
  }

  return [...classMap.values()].sort((a, b) => a.className.localeCompare(b.className));
};

// ── Check-in data ─────────────────────────────────────────────────────────────

const buildCheckinRows = async (schoolId, monday, friday) => {
  const checkins = await CheckIn.find({
    schoolId,
    createdAt: { $gte: monday, $lte: friday },
    check_in_type: 'morning_in',
  })
    .populate('staffId', 'firstName lastName role')
    .lean();

  const staffMap = new Map();
  for (const ci of checkins) {
    if (!ci.staffId) continue;
    const key = String(ci.staffId._id);
    const name = `${ci.staffId.firstName} ${ci.staffId.lastName}`;
    const role = ci.staffId.role ?? '—';
    if (!staffMap.has(key)) staffMap.set(key, { name, role, days: new Set(), onTime: 0, late: 0 });
    const s = staffMap.get(key);
    s.days.add(new Date(ci.createdAt).toDateString());
    if (ci.status === 'on_time') s.onTime++;
    else s.late++;
  }

  const allDays = new Set(checkins.map((ci) => new Date(ci.createdAt).toDateString()));
  const schoolDays = allDays.size || 5;

  const rows = [...staffMap.values()].map((s) => ({
    name: s.name,
    role: s.role,
    daysIn: s.days.size,
    onTime: s.onTime,
    late: s.late,
    missing: Math.max(0, schoolDays - s.days.size),
  }));

  return { rows: rows.sort((a, b) => a.name.localeCompare(b.name)), schoolDays };
};

// ── Fees data ─────────────────────────────────────────────────────────────────

const buildFeesRows = async (schoolId, monday, friday) => {
  const { term, academicYear } = getCurrentTermAndYear();

  const weekPayments = await Payment.find({
    schoolId,
    paymentDate: { $gte: monday, $lte: friday },
    status: 'completed',
  }).lean();

  const weeklyTotal = weekPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  const termPayments = await Payment.find({
    schoolId,
    academicYear,
    term,
    status: 'completed',
  }).lean();

  const collectedByClass = new Map();
  for (const p of termPayments) {
    const key = String(p.classId);
    collectedByClass.set(key, (collectedByClass.get(key) ?? 0) + (p.amount || 0));
  }

  const structures = await FeeStructure.find({ schoolId, academicYear, term })
    .populate('classId', 'name stream')
    .lean();

  const studentCounts = await Student.aggregate([
    { $match: { schoolId: new mongoose.Types.ObjectId(String(schoolId)), status: 'active' } },
    { $group: { _id: '$classId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(studentCounts.map((c) => [String(c._id), c.count]));

  const rows = structures.map((fs) => {
    const classKey = String(fs.classId?._id ?? fs.classId);
    const className = fs.classId
      ? [fs.classId.name, fs.classId.stream].filter(Boolean).join(' ')
      : 'Unknown Class';
    const studentCount = countMap.get(classKey) ?? 0;
    const expected = (fs.items ?? []).reduce((s, item) => s + (item.amount || 0), 0) * studentCount;
    const collected = collectedByClass.get(classKey) ?? 0;
    return { className, studentCount, expected, collected, outstanding: Math.max(0, expected - collected) };
  });

  return { rows: rows.sort((a, b) => a.className.localeCompare(b.className)), term, academicYear, weeklyTotal };
};

// ── Main processor ────────────────────────────────────────────────────────────

export const processWeeklySummaryScan = async () => {
  const { monday, friday, weekLabel } = getWeekBounds();
  logger.info('[WeeklySummary] Starting scan', { weekLabel });

  const schools = await School.find({
    isActive: true,
    subscriptionStatus: { $in: ['trial', 'active'] },
  }).select('name email').lean();

  let sent = 0;
  let skipped = 0;

  for (const school of schools) {
    try {
      const sessionCheck = await Attendance.countDocuments({
        schoolId: school._id,
        date: { $gte: monday, $lte: friday },
      });

      if (sessionCheck === 0) {
        logger.info('[WeeklySummary] Skipping — school not in session', { schoolId: school._id, name: school.name });
        skipped++;
        continue;
      }

      const settings = await SchoolSettings.findOne({ schoolId: school._id })
        .select('logo').lean();

      const logoBuffer = settings?.logo
        ? await getFileBuffer(settings.logo).catch(() => null)
        : null;

      const pdfBase = { schoolName: school.name, logoBuffer, weekLabel };

      const [attendanceRows, checkinData, feesData] = await Promise.all([
        buildAttendanceRows(school._id, monday, friday),
        buildCheckinRows(school._id, monday, friday),
        buildFeesRows(school._id, monday, friday),
      ]);

      const [attendancePdf, checkinPdf, feesPdf] = await Promise.all([
        renderAttendanceSummaryPdf({ ...pdfBase, rows: attendanceRows }),
        renderCheckinSummaryPdf({ ...pdfBase, rows: checkinData.rows, schoolDays: checkinData.schoolDays }),
        renderFeesSummaryPdf({
          ...pdfBase,
          rows: feesData.rows,
          term: feesData.term,
          academicYear: feesData.academicYear,
          weeklyTotal: feesData.weeklyTotal,
        }),
      ]);

      const safeWeek = weekLabel.replace(/[^a-zA-Z0-9]/g, '_');

      await sendWeeklySummaryEmail({
        to: school.email,
        schoolName: school.name,
        weekLabel,
        attachments: [
          { filename: `Attendance_${safeWeek}.pdf`, content: attendancePdf },
          { filename: `TeacherCheckins_${safeWeek}.pdf`, content: checkinPdf },
          { filename: `Fees_${safeWeek}.pdf`, content: feesPdf },
        ],
      });

      sent++;
      logger.info('[WeeklySummary] Sent summary', { schoolId: school._id, name: school.name });
    } catch (err) {
      logger.error('[WeeklySummary] Failed for school', {
        schoolId: school._id,
        name: school.name,
        err: err.message,
      });
    }
  }

  logger.info('[WeeklySummary] Scan complete', { sent, skipped, total: schools.length });
  return { sent, skipped };
};
