import express from 'express';
import { protect, blockIfMustChangePassword, adminOnly, authorize } from '../../middleware/auth.js';
import { ADMIN_ROLES, ROLES } from '../../constants/index.js';
import {
  validateCreateFeeStructure,
  validateUpdateFeeStructure,
  validateListFeeStructures,
  validateCreatePayment,
  validateUpdatePayment,
  validateReversePayment,
  validateListPayments,
  validateBalanceQuery,
  validateFinanceDashboardSummaryQuery,
  validateAdaptFeeStructures,
  validateListPaymentNotifications,
} from './fees.validator.js';
import {
  createFeeStructure,
  listFeeStructures,
  getFeeStructure,
  updateFeeStructure,
  deleteFeeStructure,
  createPayment,
  adaptFeeStructures,
  listPayments,
  getPayment,
  updatePayment,
  deletePayment,
  reversePayment,
  issueReceipt,
  getStudentBalance,
  getFinanceDashboardSummary,
  listPaymentNotifications,
  getBulkFeeStats,
} from './fees.controller.js';

const router = express.Router();

// All fee routes require authentication
router.use(protect, blockIfMustChangePassword);

const canManageFees = authorize(...ADMIN_ROLES, ROLES.SECRETARY, ROLES.ACCOUNTANT);
const canIssueReceipts = authorize(...ADMIN_ROLES, ROLES.SECRETARY, ROLES.ACCOUNTANT);

// ── Fee Structures ────────────────────────────────────────────────────────────
router
  .route('/structures')
  .get(canManageFees, validateListFeeStructures, listFeeStructures)
  .post(adminOnly, validateCreateFeeStructure, createFeeStructure);

router.post('/structures/adapt', adminOnly, validateAdaptFeeStructures, adaptFeeStructures);

router
  .route('/structures/:id')
  .get(canManageFees, getFeeStructure)
  .patch(adminOnly, validateUpdateFeeStructure, updateFeeStructure)
  .delete(adminOnly, deleteFeeStructure);

// ── Payments ──────────────────────────────────────────────────────────────────
router
  .route('/payments')
  .all(canManageFees)
  .get(validateListPayments, listPayments)
  .post(validateCreatePayment, createPayment);

const schoolAdminOnly = authorize(ROLES.SCHOOL_ADMIN);

router
  .route('/payments/:id')
  .get(canManageFees, getPayment)
  .patch(schoolAdminOnly, validateUpdatePayment, updatePayment)
  .delete(schoolAdminOnly, deletePayment);

router.post('/payments/:id/reverse', canManageFees, validateReversePayment, reversePayment);
router.post('/payments/:id/issue-receipt', canIssueReceipts, issueReceipt);
router.get('/dashboard-summary', canManageFees, validateFinanceDashboardSummaryQuery, getFinanceDashboardSummary);
router.get('/payment-notifications', canManageFees, validateListPaymentNotifications, listPaymentNotifications);

// ── Balance ───────────────────────────────────────────────────────────────────
router.get('/balance', canManageFees, validateBalanceQuery, getStudentBalance);
router.get('/bulk-stats', canManageFees, getBulkFeeStats);

export default router;
