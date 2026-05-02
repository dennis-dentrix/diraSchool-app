import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response.js';
import { FEATURE_ADDONS, FEATURE_ADDON_PRICING } from '../../constants/index.js';

const BASE_FEE = 8500;
const PER_STUDENT_RATE = 40;
const VAT_RATE = 0.16;
const SCHOOL_FEE_ASSUMPTION = 10000; // KES per student per term (for % calc)

const MULTIPLIERS = {
  'per-term': 1,
  'annual': 2.7,        // 3 terms − 10% discount
  'multi-year': 2.55,   // 3 terms − 15% discount per year
};

const schema = z.object({
  students: z.coerce.number().int().min(1).max(10000),
  option: z.enum(['per-term', 'annual', 'multi-year']).default('per-term'),
  includeVAT: z.coerce.boolean().default(true),
  addOns: z.string().optional(), // csv: transport,sms
});

const parseAddOns = (rawAddOns) => {
  if (!rawAddOns) return [];
  return String(rawAddOns)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .filter((value) => Object.values(FEATURE_ADDONS).includes(value));
};

/**
 * GET /api/v1/pricing/calculate
 * Public endpoint — no auth required.
 *
 * Query params:
 *   students    int 1–10000   required
 *   option      per-term|annual|multi-year   default: per-term
 *   includeVAT  boolean   default: true
 */
export const calculatePrice = (req, res) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, parsed.error.errors[0].message, 400);
  }

  const { students, option } = parsed.data;
  const selectedAddOns = parseAddOns(parsed.data.addOns);
  const multiplier = MULTIPLIERS[option];

  const addOnsPerTerm = selectedAddOns.reduce(
    (sum, addOn) => sum + (FEATURE_ADDON_PRICING[addOn] ?? 0),
    0
  );
  const subtotalExVAT = BASE_FEE + students * PER_STUDENT_RATE + addOnsPerTerm;
  const periodSubtotal = subtotalExVAT * multiplier;
  const vatAmount = Math.round(periodSubtotal * VAT_RATE);
  const totalIncVAT = periodSubtotal + vatAmount;

  const costPerStudentPerTerm = subtotalExVAT / students;
  const pctOfFeeIncome = (subtotalExVAT / (students * SCHOOL_FEE_ASSUMPTION)) * 100;

  // For annual/multi-year, also return the effective per-term equivalent
  const effectivePerTerm = option !== 'per-term' ? totalIncVAT / 3 : null;

  return sendSuccess(res, {
    inputs: { students, option, baseFee: BASE_FEE, perStudentRate: PER_STUDENT_RATE, vatRate: VAT_RATE },
    breakdown: {
      baseFee: BASE_FEE,
      perStudentCost: students * PER_STUDENT_RATE,
      addOnsPerTerm,
      addOns: selectedAddOns.map((name) => ({
        name,
        pricePerTerm: FEATURE_ADDON_PRICING[name] ?? 0,
      })),
      subtotalExVAT: Math.round(subtotalExVAT),
      multiplier,
      periodSubtotalExVAT: Math.round(periodSubtotal),
      vatAmount,
      totalIncVAT: Math.round(totalIncVAT),
    },
    insights: {
      costPerStudentPerTerm: Math.round(costPerStudentPerTerm * 100) / 100,
      pctOfFeeIncome: Math.round(pctOfFeeIncome * 100) / 100,
      ...(effectivePerTerm ? { effectivePerTermIncVAT: Math.round(effectivePerTerm) } : {}),
    },
  });
};
