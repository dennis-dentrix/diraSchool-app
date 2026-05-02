import { z } from 'zod';
import { FEATURE_ADDONS, PLAN_TIERS } from '../../constants/index.js';
import { sendError } from '../../utils/response.js';

const createCheckoutSchema = z
  .object({
    billingCycle: z.enum(['per-term', 'annual', 'multi-year']).default('per-term'),
    studentCount: z.coerce.number().int().min(1).max(10000),
    planTier: z.enum([PLAN_TIERS.BASIC, PLAN_TIERS.STANDARD, PLAN_TIERS.PREMIUM]).optional(),
    addOns: z.object({
      [FEATURE_ADDONS.TRANSPORT]: z.coerce.boolean().optional(),
      [FEATURE_ADDONS.SMS]: z.coerce.boolean().optional(),
    }).optional(),
    description: z.string().trim().max(240).optional(),
  })
  .strict();

const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, parsed.error.errors[0].message, 400);
  req.body = parsed.data;
  next();
};

export const validateCreateCheckout = validate(createCheckoutSchema);
