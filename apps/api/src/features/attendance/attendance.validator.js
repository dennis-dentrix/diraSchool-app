import { z } from 'zod';
import { sendError } from '../../utils/response.js';
import {
  ATTENDANCE_STATUSES,
  ATTENDANCE_REGISTER_STATUSES,
} from '../../constants/index.js';

const objectIdRegex = /^[a-f\d]{24}$/i;

const attendanceEntrySchema = z.object({
  studentId: z.string().regex(objectIdRegex, 'Invalid student ID'),
  status: z.enum(Object.values(ATTENDANCE_STATUSES), {
    message: `Attendance status must be one of: ${Object.values(ATTENDANCE_STATUSES).join(', ')}`,
  }),
  note: z.string().trim().max(300).optional(),
});

const hasUniqueStudentEntries = (entries = []) => {
  const unique = new Set(entries.map((entry) => entry.studentId));
  return unique.size === entries.length;
};

const createAttendanceRegisterSchema = z
  .object({
    classId: z.string().regex(objectIdRegex, 'Invalid class ID'),
    date: z.string().date('Date must be in YYYY-MM-DD format'),
    entries: z.array(attendanceEntrySchema).optional(),
    substituteTeacherId: z.string().regex(objectIdRegex, 'Invalid teacher ID').optional(),
    substituteNote: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine((data) => hasUniqueStudentEntries(data.entries), {
    message: 'Each student can appear only once in attendance entries.',
    path: ['entries'],
  });

const updateAttendanceRegisterSchema = z
  .object({
    entries: z.array(attendanceEntrySchema).optional(),
    substituteTeacherId: z
      .string()
      .regex(objectIdRegex, 'Invalid teacher ID')
      .nullable()
      .optional(),
    substituteNote: z.string().trim().max(300).nullable().optional(),
  })
  .strict()
  .refine((data) => hasUniqueStudentEntries(data.entries), {
    message: 'Each student can appear only once in attendance entries.',
    path: ['entries'],
  });

const listAttendanceSchema = z.object({
  classId: z.string().regex(objectIdRegex, 'Invalid class ID').optional(),
  date: z.string().date('Date must be in YYYY-MM-DD format').optional(),
  status: z.enum(Object.values(ATTENDANCE_REGISTER_STATUSES)).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, result.error.errors[0].message, 400);
  }
  req.body = result.data;
  next();
};

const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    return sendError(res, result.error.errors[0].message, 400);
  }
  req.query = result.data;
  next();
};

export const validateCreateAttendanceRegister = validateBody(createAttendanceRegisterSchema);
export const validateUpdateAttendanceRegister = validateBody(updateAttendanceRegisterSchema);
export const validateListAttendanceRegisters = validateQuery(listAttendanceSchema);
