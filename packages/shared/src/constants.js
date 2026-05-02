export const ROLES = {
  SUPERADMIN: 'superadmin',
  SCHOOL_ADMIN: 'school_admin',
  DIRECTOR: 'director',
  HEADTEACHER: 'headteacher',
  DEPUTY_HEADTEACHER: 'deputy_headteacher',
  SECRETARY: 'secretary',
  ACCOUNTANT: 'accountant',
  TEACHER: 'teacher',
  DEPARTMENT_HEAD: 'department_head',
  PARENT: 'parent',
};

export const ADMIN_ROLES = [
  ROLES.SCHOOL_ADMIN,
  ROLES.DIRECTOR,
  ROLES.HEADTEACHER,
  ROLES.DEPUTY_HEADTEACHER,
];

export const TERMS = ['Term 1', 'Term 2', 'Term 3'];

export const LEVEL_CATEGORIES = {
  PRE_PRIMARY: 'Pre-Primary',
  LOWER_PRIMARY: 'Lower Primary',
  UPPER_PRIMARY: 'Upper Primary',
  JUNIOR_SECONDARY: 'Junior Secondary',
  SENIOR_SCHOOL: 'Senior School',
};

export const PLAN_TIERS = {
  TRIAL: 'trial',
  BASIC: 'basic',
  STANDARD: 'standard',
  PREMIUM: 'premium',
};

export const FEATURE_ADDONS = {
  TRANSPORT: 'transport',
  SMS: 'sms',
};

export const FEATURE_ADDON_PRICING = {
  [FEATURE_ADDONS.TRANSPORT]: 1500,
  [FEATURE_ADDONS.SMS]: 2000,
};

export const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
