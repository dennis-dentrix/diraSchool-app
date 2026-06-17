import axios from "axios";
import { toast } from "sonner";

// const API_URL =
//   process.env.NEXT_PUBLIC_API_URL ||
//   "https://api.diraschool.com" ||
//   "https://diraschool-api.onrender.com";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://diraschool-api.onrender.com";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Add Authorization header from localStorage before each request
api.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("authToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

const normalizeSuccessPayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return payload;
  if (
    payload.status !== "success" ||
    Object.prototype.hasOwnProperty.call(payload, "data")
  ) {
    return payload;
  }
  const { status, ...rest } = payload;

  const metaLikeKeys = new Set(["meta", "pagination"]);
  const nonMetaKeys = Object.keys(rest).filter((k) => !metaLikeKeys.has(k));
  const arrayKeys = nonMetaKeys.filter((k) => Array.isArray(rest[k]));

  let normalizedData = rest;

  // List endpoints: { users: [...], meta: {...} } -> data: [...]
  if (arrayKeys.length === 1 && nonMetaKeys.length === 1) {
    normalizedData = rest[arrayKeys[0]];
  }
  // Detail endpoints: { student: {...} } -> data: {...}
  else if (nonMetaKeys.length === 1) {
    normalizedData = rest[nonMetaKeys[0]];
  }

  const pagination = rest.pagination ?? rest.meta;

  return {
    status,
    data: normalizedData,
    ...(pagination ? { pagination } : {}),
    ...rest,
  };
};

// Auth endpoints that are allowed to return 401 without triggering a redirect.
// (login/register return 401 for wrong credentials — that's expected, not a session expiry)
const AUTH_NO_REDIRECT = [
  "/auth/login",
  "/auth/register",
  "/auth/verify-email",
  "/auth/reset-password",
  "/auth/me", // 401 here means "not logged in" — let useAuth/layout handle the redirect
];

// Redirect to login on 401 (session expired / not authenticated)
api.interceptors.response.use(
  (res) => {
    res.data = normalizeSuccessPayload(res.data);
    return res;
  },
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const url = error.config?.url ?? "";
      const isAuthEndpoint = AUTH_NO_REDIRECT.some((path) =>
        url.includes(path),
      );
      if (!isAuthEndpoint) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error) {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.message ?? error.message ?? "Something went wrong"
    );
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

export function parseApiError(error) {
  if (!axios.isAxiosError(error)) {
    return {
      title: error?.message || "Something went wrong",
      description: "Try again. Contact admin@diraschool.com if the problem persists.",
    };
  }

  const status = error.response?.status;
  const serverMessage = error.response?.data?.message;

  // Network / connectivity
  if (!error.response) {
    return {
      title: "Connection failed",
      description: "Check your internet connection and try again.",
    };
  }

  switch (status) {
    case 400:
      return {
        title: serverMessage || "Invalid request",
        description: "Check the information you entered and try again.",
      };
    case 401:
      return {
        title: "Session expired",
        description: "Sign in again to continue where you left off.",
      };
    case 403:
      return {
        title: "Access denied",
        description: "You don't have permission to do this. Contact your school administrator if you think this is a mistake.",
      };
    case 404:
      return {
        title: "Not found",
        description: "The item may have been moved or deleted. Refresh the page and try again.",
      };
    case 409:
      return {
        title: serverMessage || "Already exists",
        description: "This record already exists. Check your entries or contact support.",
      };
    case 429:
      return {
        title: "Too many attempts",
        description: "You've made too many requests. Wait a few minutes and try again.",
      };
    case 502:
    case 503:
    case 504:
      return {
        title: "Service unavailable",
        description: "DiraSchool is temporarily unavailable. Try again in a moment.",
      };
    default:
      if (status >= 500) {
        return {
          title: "Something went wrong on our end",
          description: "Our team has been notified. Contact admin@diraschool.com if this continues.",
        };
      }
      return {
        title: serverMessage || "Something went wrong",
        description: "Try again. Contact admin@diraschool.com if the problem persists.",
      };
  }
}

export function showApiError(error) {
  const { title, description } = parseApiError(error);
  toast.error(title, { description });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  googleLogin: (accessToken) => api.post("/auth/google", { accessToken }),
  me: () => api.get("/auth/me"),
  forgotPassword: (email) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token, password) =>
    api.post(`/auth/reset-password/${token}`, { password }),
  verifyEmail: (email, code) => api.post("/auth/verify-email", { email, code }),
  verifyEmailByToken: (token) => api.get(`/auth/verify-email/${token}`),
  resendVerification: (email) =>
    api.post("/auth/resend-verification", { email }),
  acceptInvite: (token, data) => api.post(`/auth/accept-invite/${token}`, data),
  changePassword: (data) => api.post("/auth/change-password", data),
  updateMe: (data) => api.patch("/auth/me", data),
};

// ─── Users / Staff ────────────────────────────────────────────────────────────
export const usersApi = {
  list: (params) => api.get("/users", { params }),
  create: (data) => api.post("/users", data),
  get: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.patch(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  resendInvite: (id) => api.post(`/users/${id}/resend-invite`),
  resetPassword: (id) => api.post(`/users/${id}/reset-password`),
  toggleActive: (id, isActive, reason) =>
    api.patch(`/users/${id}`, { isActive, ...(reason ? { reason } : {}) }),
};

// ─── SMS ──────────────────────────────────────────────────────────────────────
export const smsApi = {
  send: (data) => api.post("/sms/send", data),
  broadcast: (data) => api.post("/sms/broadcast", data),
  feeReminders: (data) => api.post("/sms/fee-reminders", data),
  history: (params) => api.get("/sms/history", { params }),
  requestSenderId: (senderIdRequested) =>
    api.post("/schools/me/sms-sender-id-request", { senderIdRequested }),
};

// ─── Schools (school-scoped) ──────────────────────────────────────────────────
export const schoolsApi = {
  me: () => api.get("/schools/me"),
  updateMe: (data) => api.patch("/schools/me", data),
  requestDeactivation: (data) =>
    api.post("/schools/me/deactivation-request", data),
  list: (params) => api.get("/schools", { params }),
  create: (data) => api.post("/schools", data),
  get: (id) => api.get(`/schools/${id}`),
  update: (id, data) => api.patch(`/schools/${id}`, data),
  updateSubscription: (id, data) =>
    api.patch(`/schools/${id}/subscription`, data),
};

// ─── Dashboard (school admin summary) ────────────────────────────────────────
export const dashboardApi = {
  get: () => api.get("/dashboard"),
  getTeacher: () => api.get("/dashboard/teacher"),
};

// ─── Admin (superadmin only) ──────────────────────────────────────────────────
export const adminApi = {
  stats: () => api.get("/admin/stats"),
  listSchools: (params) => api.get("/admin/schools", { params }),
  getSchool: (id) => api.get(`/admin/schools/${id}`),
  updateSchoolStatus: (id, data) =>
    api.patch(`/admin/schools/${id}/status`, data),
  updateSchoolPricingAgreement: (id, data) =>
    api.patch(`/admin/schools/${id}/pricing-agreement`, data),
  reviewDeactivationRequest: (id, data) =>
    api.patch(`/admin/schools/${id}/deactivation-request`, data),
  createSchool: (data) => api.post("/schools", data),
  auditLogs: (params) => api.get("/admin/audit-logs", { params }),
  listUsers: (params) => api.get("/admin/users", { params }),
  toggleUser: (id) => api.patch(`/admin/users/${id}/toggle`),
  approveSenderId: (id, data) =>
    api.patch(`/admin/schools/${id}/sms-sender-id`, data),
  // Billing groups
  listGroups: (params) => api.get("/admin/groups", { params }),
  getGroup: (id) => api.get(`/admin/groups/${id}`),
  createGroup: (data) => api.post("/admin/groups", data),
  updateGroup: (id, data) => api.patch(`/admin/groups/${id}`, data),
  deleteGroup: (id) => api.delete(`/admin/groups/${id}`),
  updateGroupPricingAgreement: (id, data) =>
    api.patch(`/admin/groups/${id}/pricing-agreement`, data),
  addSchoolToGroup: (groupId, schoolId) =>
    api.post(`/admin/groups/${groupId}/schools`, { schoolId }),
  removeSchoolFromGroup: (groupId, schoolId) =>
    api.delete(`/admin/groups/${groupId}/schools/${schoolId}`),
  financeSummary: (params) => api.get("/admin/finance/summary", { params }),
  financePayments: (params) => api.get("/admin/finance/payments", { params }),
  financeExpenses: (params) => api.get("/admin/finance/expenses", { params }),
  createFinanceExpense: (data) => api.post("/admin/finance/expenses", data),
  updateFinanceExpense: (id, data) =>
    api.patch(`/admin/finance/expenses/${id}`, data),
  deleteFinanceExpense: (id) => api.delete(`/admin/finance/expenses/${id}`),
  financeTaxes: (params) => api.get("/admin/finance/taxes", { params }),
  createFinanceTax: (data) => api.post("/admin/finance/taxes", data),
  updateFinanceTax: (id, data) => api.patch(`/admin/finance/taxes/${id}`, data),
  deleteFinanceTax: (id) => api.delete(`/admin/finance/taxes/${id}`),
  smsAnalytics: (params) => api.get("/admin/sms-analytics", { params }),
  trialActivity: () => api.get("/schools/trial-activity"),
  // Purge helpers (test-data cleanup)
  purgeSchool: (id) => api.delete(`/admin/purge/school/${id}`),
  previewOrphans: () => api.get("/admin/purge/orphans/preview"),
  purgeOrphans: () => api.delete("/admin/purge/orphans"),
  // Platform / system settings
  getSystemSettings: () => api.get("/admin/system-settings"),
  updateSystemSettings: (data) => api.patch("/admin/system-settings", data),
  // System events
  listSystemEvents: (params) => api.get("/admin/system-events", { params }),
  createSystemEvent: (data) => api.post("/admin/system-events", data),
  updateSystemEvent: (id, data) =>
    api.patch(`/admin/system-events/${id}`, data),
  deleteSystemEvent: (id) => api.delete(`/admin/system-events/${id}`),
  broadcastSystemEvent: (id, data) =>
    api.post(`/admin/system-events/${id}/broadcast`, data),
  // School inquiries
  listInquiries: (params) => api.get('/admin/inquiries', { params }),
  inquiryStats:  ()       => api.get('/admin/inquiries/stats'),
  updateInquiry: (id, data) => api.patch(`/admin/inquiries/${id}`, data),
};

// ─── Classes ──────────────────────────────────────────────────────────────────
export const classesApi = {
  list: (params) => api.get("/classes", { params }),
  create: (data) => api.post("/classes", data),
  get: (id) => api.get(`/classes/${id}`),
  update: (id, data) => api.patch(`/classes/${id}`, data),
  delete: (id) => api.delete(`/classes/${id}`),
  promote: (id, data) => api.post(`/classes/${id}/promote`, data),
  /** Teacher shortcut — returns the class where the teacher is classTeacher */
  myClass: () => api.get("/classes/my-class"),
};

// ─── Students ─────────────────────────────────────────────────────────────────
export const studentsApi = {
  list: (params) => api.get("/students", { params }),
  create: (data) => api.post("/students", data),
  get: (id) => api.get(`/students/${id}`),
  update: (id, data) => api.patch(`/students/${id}`, data),
  transfer: (id, data) => api.post(`/students/${id}/transfer`, data),
  withdraw: (id, data) => api.post(`/students/${id}/withdraw`, data),
  importCsv: (formData) =>
    api.post("/students/import", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  importStatus: (jobId) => api.get(`/students/import/${jobId}/status`),
  uploadPhoto: (id, formData) =>
    api.post(`/students/${id}/photo`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};

// ─── Attendance ───────────────────────────────────────────────────────────────
export const attendanceApi = {
  listRegisters: (params) => api.get("/attendance/registers", { params }),
  createRegister: (data) => api.post("/attendance/registers", data),
  getRegister: (id) => api.get(`/attendance/registers/${id}`),
  updateRegister: (id, data) => api.patch(`/attendance/registers/${id}`, data),
  submitRegister: (id) => api.post(`/attendance/registers/${id}/submit`),
};

// ─── Subjects ─────────────────────────────────────────────────────────────────
export const subjectsApi = {
  list: (params) => api.get("/subjects", { params }),
  create: (data) => api.post("/subjects", data),
  get: (id) => api.get(`/subjects/${id}`),
  update: (id, data) => api.patch(`/subjects/${id}`, data),
  delete: (id) => api.delete(`/subjects/${id}`),
  /** Replace the teacher list + HOD for a subject */
  assignTeachers: (id, data) => api.patch(`/subjects/${id}/teachers`, data),
  /** Teacher shortcut — my subjects */
  mySubjects: () => api.get("/subjects/my-subjects"),
  /** Teacher self-assigns or removes themselves */
  selfAssign: (id, action) =>
    api.patch(`/subjects/${id}/self-assign`, { action }),
};

// ─── Departments ──────────────────────────────────────────────────────────────
export const departmentsApi = {
  list: () => api.get("/subjects/departments"),
  create: (data) => api.post("/subjects/departments", data),
  update: (id, data) => api.patch(`/subjects/departments/${id}`, data),
  delete: (id) => api.delete(`/subjects/departments/${id}`),
  addMember: (id, userId) =>
    api.post(`/subjects/departments/${id}/members`, { userId }),
  removeMember: (id, userId) =>
    api.delete(`/subjects/departments/${id}/members/${userId}`),
};

// ─── Exams ────────────────────────────────────────────────────────────────────
export const examsApi = {
  list: (params) => api.get("/exams", { params }),
  create: (data) => api.post("/exams", data),
  get: (id) => api.get(`/exams/${id}`),
  update: (id, data) => api.patch(`/exams/${id}`, data),
  delete: (id) => api.delete(`/exams/${id}`),
};

// ─── Results ──────────────────────────────────────────────────────────────────
export const resultsApi = {
  bulkUpsert: (data) => api.post("/results/bulk", data),
  list: (params) => api.get("/results", { params }),
  get: (id) => api.get(`/results/${id}`),
  update: (id, data) => api.patch(`/results/${id}`, data),
  sessionGet: (params) => api.get("/results/session", { params }),
  sessionSave: (data) => api.post("/results/session", data),
};

// ─── Fees ─────────────────────────────────────────────────────────────────────
export const feesApi = {
  listStructures: (params) => api.get("/fees/structures", { params }),
  createStructure: (data) => api.post("/fees/structures", data),
  adaptStructures: (data) => api.post("/fees/structures/adapt", data),
  getStructure: (id) => api.get(`/fees/structures/${id}`),
  updateStructure: (id, data) => api.patch(`/fees/structures/${id}`, data),
  deleteStructure: (id) => api.delete(`/fees/structures/${id}`),
  listPayments: (params) => api.get("/fees/payments", { params }),
  createPayment: (data) => api.post("/fees/payments", data),
  getPayment: (id) => api.get(`/fees/payments/${id}`),
  issueReceipt: (id) => api.post(`/fees/payments/${id}/issue-receipt`),
  reversePayment: (id, data) => api.post(`/fees/payments/${id}/reverse`, data),
  listPaymentNotifications: (params) =>
    api.get("/fees/payment-notifications", { params }),
  getBalance: (params) => api.get("/fees/balance", { params }),
  dashboardSummary: (params) => api.get("/fees/dashboard-summary", { params }),
  bulkFeeStats: (params) => api.get("/fees/bulk-stats", { params }),
};

// ─── M-Pesa Daraja C2B ───────────────────────────────────────────────────────
export const mpesaApi = {
  settings: () => api.get("/mpesa/settings"),
  updateSettings: (data) => api.put("/mpesa/settings", data),
  registerC2B: (schoolId) => api.post(`/mpesa/register-c2b/${schoolId}`),
  listPayments: (params) => api.get("/mpesa/payments", { params }),
  listStudentPayments: (studentId) =>
    api.get(`/mpesa/payments/student/${studentId}`),
  listUnallocated: (params) =>
    api.get("/mpesa/payments/unallocated", { params }),
  summary: () => api.get("/mpesa/payments/summary"),
  manualPayment: (data) => api.post("/mpesa/payments/manual", data),
  allocatePayment: (data) => api.post("/mpesa/payments/allocate", data),
};

// ─── Report Cards ─────────────────────────────────────────────────────────────
export const reportCardsApi = {
  generate: (data) => api.post("/report-cards/generate", data),
  generateClass: (data) => api.post("/report-cards/generate-class", data),
  annualSummary: (params) =>
    api.get("/report-cards/annual-summary", { params }),
  list: (params) => api.get("/report-cards", { params }),
  get: (id) => api.get(`/report-cards/${id}`),
  updateRemarks: (id, data) => api.patch(`/report-cards/${id}/remarks`, data),
  updateSubjectRemark: (id, subjectId, data) =>
    api.patch(`/report-cards/${id}/subjects/${subjectId}/remark`, data),
  publish: (id) => api.post(`/report-cards/${id}/publish`),
  generatePdf: (id) => api.post(`/report-cards/${id}/generate-pdf`),
};

// ─── In-app Notifications ────────────────────────────────────────────────────
export const notificationsApi = {
  list: (params) => api.get("/notifications", { params }),
  unreadCount: () => api.get("/notifications/unread-count"),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post("/notifications/mark-all-read"),
};

// ─── Parent Portal ────────────────────────────────────────────────────────────
export const parentApi = {
  children: () => api.get("/parent/children"),
  fees: (studentId, params) =>
    api.get(`/parent/children/${studentId}/fees`, { params }),
  attendance: (studentId, params) =>
    api.get(`/parent/children/${studentId}/attendance`, { params }),
  results: (studentId, params) =>
    api.get(`/parent/children/${studentId}/results`, { params }),
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get("/settings"),
  update: (data) => api.put("/settings", data),
  uploadLogo: (formData) =>
    api.post("/settings/logo", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  addHoliday: (data) => api.post("/settings/holidays", data),
  deleteHoliday: (id) => api.delete(`/settings/holidays/${id}`),
  addCalendarEvent: (data) => api.post("/settings/events", data),
  deleteCalendarEvent: (id) => api.delete(`/settings/events/${id}`),
};

// ─── Lesson Plans ─────────────────────────────────────────────────────────────
export const lessonPlansApi = {
  list: (params) => api.get("/lesson-plans", { params }),
  get: (id) => api.get(`/lesson-plans/${id}`),
  upload: (formData) =>
    api.post("/lesson-plans", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  delete: (id) => api.delete(`/lesson-plans/${id}`),
  share: (id, teacherId) =>
    api.post(`/lesson-plans/${id}/share`, { teacherId }),
  unshare: (id, teacherId) =>
    api.delete(`/lesson-plans/${id}/share/${teacherId}`),
};

// ─── Pricing (public) ─────────────────────────────────────────────────────────
export const pricingApi = {
  calculate: (params) => api.get("/pricing/calculate", { params }),
};

// ─── Subscription checkout ───────────────────────────────────────────────────
export const subscriptionsApi = {
  createCheckout: (data) => api.post("/subscriptions/paystack/checkout", data),
  getPricing: (params) => api.get("/subscriptions/pricing", { params }),
  getStatus: (merchantReference) =>
    api.get(`/subscriptions/paystack/status/${merchantReference}`),
  listPayments: (params) => api.get("/subscriptions/payments", { params }),
};

// ─── Onboarding tour ──────────────────────────────────────────────────────────
export const onboardingApi = {
  status: () => api.get("/onboarding/status"),
  complete: (data) => api.post("/onboarding/complete", data),
};

// ─── Audit ────────────────────────────────────────────────────────────────────
export const auditApi = {
  list: (params) => api.get("/audit-logs", { params }),
};

// ─── Export (CSV downloads) ───────────────────────────────────────────────────
export const exportApi = {
  students: () => api.get("/export/students", { responseType: "blob" }),
  payments: (params) =>
    api.get("/export/payments", { params, responseType: "blob" }),
  staff: () => api.get("/export/staff", { responseType: "blob" }),
};

/**
 * Trigger a CSV file download from a blob response.
 * Usage: downloadBlob(await exportApi.students(), 'students.csv')
 */
export const downloadBlob = (response, fallbackFilename) => {
  const disposition = response.headers?.["content-disposition"] ?? "";
  const match = disposition.match(/filename="?([^";\r\n]+)"?/i);
  const filename = match?.[1] ?? fallbackFilename;
  const url = URL.createObjectURL(
    new Blob([response.data], { type: "text/csv" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── Timetable ────────────────────────────────────────────────────────────────
export const timetableApi = {
  list: (params) => api.get("/timetables", { params }),
  get: (id) => api.get(`/timetables/${id}`),
  create: (data) => api.post("/timetables", data),
  updateSlots: (id, data) => api.put(`/timetables/${id}/slots`, data),
  delete: (id) => api.delete(`/timetables/${id}`),
};

// ─── Transport ────────────────────────────────────────────────────────────────
export const transportApi = {
  listRoutes: (params) => api.get("/transport/routes", { params }),
  getRoute: (id) => api.get(`/transport/routes/${id}`),
  createRoute: (data) => api.post("/transport/routes", data),
  updateRoute: (id, data) => api.patch(`/transport/routes/${id}`, data),
  deleteRoute: (id) => api.delete(`/transport/routes/${id}`),
  assignStudents: (id, data) =>
    api.post(`/transport/routes/${id}/assign`, data),
  unassignStudents: (id, data) =>
    api.post(`/transport/routes/${id}/unassign`, data),
};

// ─── Visitors ─────────────────────────────────────────────────────────────────
export const visitorsApi = {
  list: (params) => api.get("/visitors", { params }),
  create: (data) => api.post("/visitors", data),
  update: (id, data) => api.patch(`/visitors/${id}`, data),
  remove: (id) => api.delete(`/visitors/${id}`),
};

// ─── Check-ins (geofence-based staff attendance) ──────────────────────────────
export const checkInsApi = {
  checkIn: (data) => api.post("/checkins", data),
  today: () => api.get("/checkins/today"),
  roster: (date) =>
    api.get("/checkins/roster", { params: date ? { date } : {} }),
  staffHistory: (staffId, params) =>
    api.get(`/checkins/staff/${staffId}`, { params }),
};

// ─── Geofence settings ────────────────────────────────────────────────────────
export const geofenceApi = {
  save: (data) => api.put("/settings/geofence", data),
  saveTimings: (data) => api.put("/settings/checkin-times", data),
};

// ─── Payroll ──────────────────────────────────────────────────────────────────
export const payrollApi = {
  listGrades: () => api.get("/payroll/grades"),
  createGrade: (data) => api.post("/payroll/grades", data),
  updateGrade: (id, data) => api.patch(`/payroll/grades/${id}`, data),
  deleteGrade: (id) => api.delete(`/payroll/grades/${id}`),
  listRuns: () => api.get("/payroll/runs"),
  getRun: (id) => api.get(`/payroll/runs/${id}`),
  generateRun: (data) => api.post("/payroll/runs", data),
  deleteRun: (id) => api.delete(`/payroll/runs/${id}`),
  approveRun: (id) => api.post(`/payroll/runs/${id}/approve`),
  markPaid: (id) => api.post(`/payroll/runs/${id}/paid`),
};

// ─── Leave management ─────────────────────────────────────────────────────────
export const leaveApi = {
  apply: (data) => api.post("/leave", data),
  list: (params) => api.get("/leave", { params }),
  get: (id) => api.get(`/leave/${id}`),
  balances: (params) => api.get("/leave/balances", { params }),
  pendingCount: () => api.get("/leave/pending-count"),
  onLeaveToday: () => api.get("/leave/on-leave-today"),
  approve: (id, data) => api.patch(`/leave/${id}/approve`, data),
  reject: (id, data) => api.patch(`/leave/${id}/reject`, data),
  cancel: (id) => api.delete(`/leave/${id}`),
  summary: () => api.get("/leave/summary"),
};
