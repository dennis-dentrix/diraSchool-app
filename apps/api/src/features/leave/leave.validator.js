import { z } from 'zod';
import { sendError } from '../../utils/response.js';
import { LEAVE_TYPES } from './Leave.model.js';

const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, result.error.errors.map((e) => e.message).join(', '), 400);
  }
  req.body = result.data;
  return next();
};

const applySchema = z.object({
  leaveType: z.enum(LEAVE_TYPES, { required_error: 'Leave type is required' }),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be YYYY-MM-DD'),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD'),
  reason:    z.string().trim().min(10, 'Please provide at least 10 characters for the reason').max(1000),
  supportingDocUrl: z.string().url().optional(),
}).refine((d) => d.endDate >= d.startDate, { message: 'End date cannot be before start date', path: ['endDate'] });

const approveSchema = z.object({
  comment: z.string().trim().max(500).optional(),
});

const rejectSchema = z.object({
  comment: z.string().trim().min(5, 'Please provide a reason for rejection').max(500),
});

export const validateApply   = validateBody(applySchema);
export const validateApprove = validateBody(approveSchema);
export const validateReject  = validateBody(rejectSchema);
