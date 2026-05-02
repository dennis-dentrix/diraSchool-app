import Student from '../students/Student.model.js';
import Payment from '../fees/Payment.model.js';
import asyncHandler from '../../utils/asyncHandler.js';

// ── CSV helpers ───────────────────────────────────────────────────────────────

const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const buildCSV = (rows) => rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');

const sendCSV = (res, csv, filename) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Prepend BOM so Excel opens it with correct encoding
  res.send('\uFEFF' + csv);
};

const isoDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');
const fullName = (obj) => (obj ? `${obj.firstName ?? ''} ${obj.lastName ?? ''}`.trim() : '');
const className = (cls) => (cls ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '');

// ── GET /api/v1/export/students ───────────────────────────────────────────────
export const exportStudents = asyncHandler(async (req, res) => {
  const students = await Student.find({ schoolId: req.user.schoolId })
    .populate('classId', 'name stream')
    .sort({ admissionNumber: 1 })
    .lean();

  const header = [
    'Admission No', 'First Name', 'Last Name', 'Gender',
    'Date of Birth', 'Class', 'Status', 'Enrollment Date',
    'Guardian Name', 'Guardian Relationship', 'Guardian Phone', 'Guardian Email',
  ];

  const rows = students.map((s) => {
    const g = s.guardians?.[0];
    return [
      s.admissionNumber,
      s.firstName,
      s.lastName,
      s.gender,
      isoDate(s.dateOfBirth),
      className(s.classId),
      s.status,
      isoDate(s.enrollmentDate),
      g ? fullName(g) : '',
      g?.relationship ?? '',
      g?.phone ?? '',
      g?.email ?? '',
    ];
  });

  const stamp = new Date().toISOString().slice(0, 10);
  sendCSV(res, buildCSV([header, ...rows]), `students-${stamp}.csv`);
});

// ── GET /api/v1/export/payments ───────────────────────────────────────────────
export const exportPayments = asyncHandler(async (req, res) => {
  const filter = { schoolId: req.user.schoolId };
  if (req.query.year) filter.academicYear = req.query.year;
  if (req.query.term) filter.term = req.query.term;

  const payments = await Payment.find(filter)
    .populate('studentId', 'firstName lastName admissionNumber')
    .populate('classId', 'name stream')
    .populate('recordedByUserId', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();

  const header = [
    'Date', 'Student Name', 'Admission No', 'Class',
    'Academic Year', 'Term', 'Amount (KES)', 'Method',
    'Reference', 'Status', 'Recorded By', 'Notes',
  ];

  const rows = payments.map((p) => [
    isoDate(p.createdAt),
    fullName(p.studentId),
    p.studentId?.admissionNumber ?? '',
    className(p.classId),
    p.academicYear,
    p.term,
    p.amount,
    p.method,
    p.reference ?? '',
    p.status,
    fullName(p.recordedByUserId),
    p.notes ?? '',
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = filter.academicYear ? `-${filter.academicYear}${filter.term ? `-${filter.term}` : ''}` : '';
  sendCSV(res, buildCSV([header, ...rows]), `payments${suffix}-${stamp}.csv`);
});

// ── GET /api/v1/export/staff ──────────────────────────────────────────────────
export const exportStaff = asyncHandler(async (req, res) => {
  // Dynamic import to avoid circular dependency with User model
  const { default: User } = await import('../users/User.model.js');

  const staff = await User.find({ schoolId: req.user.schoolId, role: { $ne: 'parent' } })
    .sort({ lastName: 1 })
    .lean();

  const header = [
    'First Name', 'Last Name', 'Email', 'Role',
    'Phone', 'TSC Number', 'Status', 'Joined',
  ];

  const rows = staff.map((u) => [
    u.firstName,
    u.lastName,
    u.email,
    u.role,
    u.phone ?? '',
    u.tscNumber ?? '',
    u.isActive ? 'Active' : 'Inactive',
    isoDate(u.createdAt),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  sendCSV(res, buildCSV([header, ...rows]), `staff-${stamp}.csv`);
});
