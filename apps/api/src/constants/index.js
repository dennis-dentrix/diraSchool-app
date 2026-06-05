// ============================================================
// SINGLE SOURCE OF TRUTH — never hardcode these strings elsewhere
// ============================================================
import {
  ROLES,
  ADMIN_ROLES,
  TERMS,
  LEVEL_CATEGORIES,
  DAYS_OF_WEEK,
  PLAN_TIERS,
  FEATURE_ADDONS,
  FEATURE_ADDON_PRICING,
} from '@diraschool/shared/constants';

export {
  ROLES,
  ADMIN_ROLES,
  TERMS,
  LEVEL_CATEGORIES,
  DAYS_OF_WEEK,
  PLAN_TIERS,
  FEATURE_ADDONS,
  FEATURE_ADDON_PRICING,
};

// All roles scoped to a specific school (not superadmin)
export const SCHOOL_ROLES = Object.values(ROLES).filter((r) => r !== ROLES.SUPERADMIN);

// Pre-built role groups — use with authorize(...ROLE_GROUPS.ALL_STAFF) etc.
export const ROLE_GROUPS = {
  // school_admin, director, headteacher, deputy_headteacher
  ADMIN: ADMIN_ROLES,
  // admin + teacher + department_head (no secretary/accountant)
  ACADEMIC: [...ADMIN_ROLES, ROLES.TEACHER, ROLES.DEPARTMENT_HEAD],
  // admin + secretary + accountant (no teaching roles)
  FINANCE: [...ADMIN_ROLES, ROLES.SECRETARY, ROLES.ACCOUNTANT],
  // all 8 school staff roles
  ALL_STAFF: [...ADMIN_ROLES, ROLES.TEACHER, ROLES.DEPARTMENT_HEAD, ROLES.SECRETARY, ROLES.ACCOUNTANT],
};

export const YEARS = () => {
  const current = new Date().getFullYear();
  return [current - 1, current, current + 1].map(String);
};

export const SUBSCRIPTION_STATUSES = {
  TRIAL: 'trial',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  EXPIRED: 'expired',
};

export const STUDENT_STATUSES = {
  ACTIVE: 'active',
  TRANSFERRED: 'transferred',
  GRADUATED: 'graduated',
  WITHDRAWN: 'withdrawn',
};

export const PAYMENT_METHODS = {
  CASH: 'cash',
  MPESA: 'mpesa',
  BANK: 'bank',
};

export const PAYMENT_STATUSES = {
  COMPLETED: 'completed',
  REVERSED: 'reversed',
};

export const EXAM_TYPES = {
  OPENER: 'opener',
  MIDTERM: 'midterm',
  ENDTERM: 'endterm',
  SBA: 'sba',
};

export const ATTENDANCE_STATUSES = {
  PRESENT:  'present',
  ABSENT:   'absent',
  LATE:     'late',
  EXCUSED:  'excused',
  HALF_DAY: 'half_day',
};

export const ATTENDANCE_REGISTER_STATUSES = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
};

// 4-level rubric (Grade 1–6)
export const RUBRIC_LEVELS_4 = {
  EE: 'EE', // Exceeds Expectations
  ME: 'ME', // Meets Expectations
  AE: 'AE', // Approaching Expectations
  BE: 'BE', // Below Expectations
};

// 8-point scale (Grade 7–12, KNEC)
export const RUBRIC_LEVELS_8 = {
  EE1: 'EE1', // 90–100%  8pts
  EE2: 'EE2', // 75–89%   7pts
  ME1: 'ME1', // 58–74%   6pts
  ME2: 'ME2', // 41–57%   5pts
  AE1: 'AE1', // 31–40%   4pts
  AE2: 'AE2', // 21–30%   3pts
  BE1: 'BE1', // 11–20%   2pts
  BE2: 'BE2', // 1–10%    1pt
};

export const SMS_TRIGGER_TYPES = {
  FEE_REMINDER: 'fee_reminder',
  ABSENCE_ALERT: 'absence_alert',
  RESULT_NOTIFICATION: 'result_notification',
  CUSTOM_BROADCAST: 'custom_broadcast',
  ACCOUNT_CREATED: 'account_created',
  REPORT_PUBLISHED: 'report_published',
  PAYMENT_RECEIPT: 'payment_receipt',
  OTP: 'otp',
};

export const SMS_DELIVERY_STATUS = {
  QUEUED:    'queued',
  SENT:      'sent',
  DELIVERED: 'delivered',
  FAILED:    'failed',
  REJECTED:  'rejected',
  CAPPED:    'capped',   // blocked by per-parent term cap
};

export const SMS_CREDIT_TYPE = {
  INCLUDED:  'included',
  PURCHASED: 'purchased',
};

// Self-serve SMS top-up packs.
export const SMS_CREDIT_PACKS = [
  { id: 'sms_200',  credits: 200,  amountKes: 300,  label: '200 SMS'   },
  { id: 'sms_500',  credits: 500,  amountKes: 700,  label: '500 SMS'   },
  { id: 'sms_1000', credits: 1000, amountKes: 1200, label: '1,000 SMS' },
  { id: 'sms_2500', credits: 2500, amountKes: 2750, label: '2,500 SMS' },
];

export const SMS_CAP_PER_PARENT_PER_TERM = 5;

export const PAYMENT_SOURCE = {
  MANUAL: 'manual',
  SMS_WEBHOOK: 'sms_webhook',
  MPESA_C2B: 'mpesa_c2b',
};

export const PAYMENT_SMS_PROVIDERS = {
  MPESA: 'mpesa',
  BANK: 'bank',
  AUTO: 'auto',
};

export const QUEUE_NAMES = {
  SMS: 'sms',
  REPORT: 'report',
  IMPORT: 'import',
  RECEIPT: 'receipt',
  NOTIFICATION: 'notification',
  EMAIL: 'email',
  CHECKOUT_REMINDER: 'checkout-reminder',
  TRIAL_REMINDER: 'trial-reminder',
};

export const JOB_NAMES = {
  SEND_SMS: 'send-sms',
  GENERATE_REPORT_CARD: 'generate-report-card',
  GENERATE_PDF: 'generate-pdf',
  IMPORT_STUDENTS_CSV: 'import-students-csv',
  IN_APP_NOTIFICATION: 'in-app-notification',
  SEND_INVITE_EMAIL:             'send-invite-email',
  SEND_PARENT_ENROLLMENT_EMAIL:  'send-parent-enrollment-email',
  SEND_RESET_EMAIL:              'send-reset-email',
  SEND_VERIFICATION_EMAIL:       'send-verification-email',
  SEND_CHECKOUT_REMINDER_EMAIL:  'send-checkout-reminder-email',
  RUN_CHECKOUT_REMINDER_SCAN:    'run-checkout-reminder-scan',
  SEND_WELCOME_EMAIL:            'send-welcome-email',
  SEND_TRIAL_DAY3_EMAIL:         'send-trial-day3-email',
  SEND_TRIAL_MIDPOINT_EMAIL:     'send-trial-midpoint-email',
  SEND_TRIAL_EXPIRY_EMAIL:       'send-trial-expiry-email',
  RUN_TRIAL_REMINDER_SCAN:       'run-trial-reminder-scan',
  SEND_SYSTEM_EVENT_EMAIL:       'send-system-event-email',
};

export const AUDIT_ACTIONS = {
  CREATE:    'create',
  UPDATE:    'update',
  DELETE:    'delete',
  PUBLISH:   'publish',
  REVERSE:   'reverse',
  SUSPEND:   'suspend',
  ACTIVATE:  'activate',
  TRANSFER:  'transfer',
  WITHDRAW:  'withdraw',
  PROMOTE:   'promote',
  ISSUE:     'issue',
  RETURN:    'return',
};

export const AUDIT_RESOURCES = {
  PAYMENT:    'Payment',
  STUDENT:    'Student',
  REPORT_CARD:'ReportCard',
  SCHOOL:     'School',
  USER:       'User',
  BOOK:       'Book',
  BOOK_LOAN:  'BookLoan',
};

export const LOAN_STATUSES = {
  ACTIVE:   'active',
  RETURNED: 'returned',
  OVERDUE:  'overdue',
};

export const BORROWER_TYPES = {
  STUDENT: 'student',
  STAFF:   'staff',
};

// ── Feature keys — one constant per gated feature ────────────────────────────
// Core features (students, classes, attendance, exams, fees, users, dashboard,
// settings) are NOT listed here — they are always available on every plan.
export const PLAN_FEATURES = {
  REPORT_CARDS:  'report_cards',
  PARENT_PORTAL: 'parent_portal',
  TIMETABLE:     'timetable',
  TRANSPORT:     'transport',
  BULK_IMPORT:   'bulk_import',
  AUDIT_LOG:     'audit_log',
  SMS:           'sms',
  LIBRARY:       'library',
};

// Features available during a free trial (subscriptionStatus = 'trial').
// Everything else requires an active paid subscription.
export const TRIAL_FEATURES = new Set([
  PLAN_FEATURES.REPORT_CARDS,
  PLAN_FEATURES.TIMETABLE,
  PLAN_FEATURES.PARENT_PORTAL,
]);

// Redis cache TTLs (seconds)
export const CACHE_TTL = {
  SCHOOL_SUBSCRIPTION: 5 * 60,    // 5 minutes
  CLASS_LIST: 10 * 60,            // 10 minutes
  SCHOOL_SETTINGS: 30 * 60,       // 30 minutes
  SUBJECT_LIST: 15 * 60,          // 15 minutes
  SCHOOL_INFO: 5 * 60,            // 5 minutes (name, phone, county — rarely changes)
  DASHBOARD: 2 * 60,              // 2 minutes — expensive aggregations, invalidate on writes
  ATTENDANCE_REGISTER: 3 * 60,    // 3 minutes — moderately expensive aggregations
};
