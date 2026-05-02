import {
  ROLES,
  ADMIN_ROLES,
  TERMS,
  LEVEL_CATEGORIES as LEVEL_CATEGORIES_MAP,
  PLAN_TIERS as PLAN_TIERS_MAP,
  FEATURE_ADDONS as FEATURE_ADDONS_MAP,
  FEATURE_ADDON_PRICING as FEATURE_ADDON_PRICING_MAP,
} from '@diraschool/shared/constants';

export { ROLES, ADMIN_ROLES, TERMS };

export const LEVEL_CATEGORIES = Object.values(LEVEL_CATEGORIES_MAP);

export const PAYMENT_METHODS = ['cash', 'mpesa', 'bank'];
export const EXAM_TYPES = ['opener', 'midterm', 'endterm', 'sba'];
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'half_day', 'excused'];
export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'suspended', 'expired'];
export const PLAN_TIERS = Object.values(PLAN_TIERS_MAP);
export const FEATURE_ADDONS = FEATURE_ADDONS_MAP;
export const FEATURE_ADDON_PRICING = FEATURE_ADDON_PRICING_MAP;
export const STUDENT_STATUSES = ['active', 'transferred', 'graduated', 'withdrawn'];
export const WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export const CURRENT_YEAR = new Date().getFullYear();
export const ACADEMIC_YEARS = [
  String(CURRENT_YEAR - 1),
  String(CURRENT_YEAR),
  String(CURRENT_YEAR + 1),
];

export const PLAN_LABELS = {
  trial: 'Trial',
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
};

export const ROLE_LABELS = {
  superadmin: 'Super Admin',
  school_admin: 'School Admin',
  director: 'Director',
  headteacher: 'Head Teacher',
  deputy_headteacher: 'Deputy Head Teacher',
  secretary: 'Secretary',
  accountant: 'Accountant',
  teacher: 'Teacher',
  department_head: 'Department Head',
  parent: 'Parent',
};

export const DEFAULT_PAGE_SIZE = 20;
