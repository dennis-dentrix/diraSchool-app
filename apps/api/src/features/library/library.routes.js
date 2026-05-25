import { Router } from 'express';
import { protect, blockIfMustChangePassword, adminOnly, authorize } from '../../middleware/auth.js';
import requireFeature from '../../middleware/requireFeature.js';
import {
  createBook, listBooks, getBook, updateBook,
  issueLoan, listLoans, getLoan, returnBook, markOverdue,
} from './library.controller.js';
import {
  validateCreateBook, validateUpdateBook, validateListBooks,
  validateIssueLoan, validateReturnBook, validateListLoans,
} from './library.validator.js';
import { ROLES, ROLE_GROUPS, PLAN_FEATURES } from '../../constants/index.js';

const router = Router();

// ── Feature gate: library module ─────────────────────────────────────────────
// Feature gate: requires active subscription (see requireFeature middleware).
router.use(protect, blockIfMustChangePassword, requireFeature(PLAN_FEATURES.LIBRARY));

const canRead = authorize(...ROLE_GROUPS.ALL_STAFF);

router.get('/books',      canRead, validateListBooks, listBooks);
router.get('/books/:id',  canRead, getBook);

// Book management — admin only
router.post('/books',        adminOnly, validateCreateBook, createBook);
router.patch('/books/:id',   adminOnly, validateUpdateBook, updateBook);

// Loans — admins + teachers + secretary (accountant excluded)
const canLoan = authorize(...ROLE_GROUPS.ACADEMIC, ROLES.SECRETARY);

router.post('/loans',                    canLoan, validateIssueLoan, issueLoan);
router.get('/loans',                     canRead, validateListLoans, listLoans);
router.get('/loans/:id',                 canRead, getLoan);
router.post('/loans/:id/return',         canLoan, validateReturnBook, returnBook);
router.patch('/loans/:id/overdue',       adminOnly, markOverdue);

export default router;
