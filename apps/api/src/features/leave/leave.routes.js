import { Router } from 'express';
import { protect, blockIfMustChangePassword, authorize } from '../../middleware/auth.js';
import { ROLES } from '../../constants/index.js';
import {
  applyLeave,
  listLeaves,
  getLeave,
  getBalances,
  getPendingCount,
  getOnLeaveToday,
  approveLeave,
  rejectLeave,
  cancelLeave,
} from './leave.controller.js';
import { validateApply, validateApprove, validateReject } from './leave.validator.js';

const router = Router();

router.use(protect, blockIfMustChangePassword);

// Any staff member can apply for and view leave
const anyStaff = authorize(
  ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.HEADTEACHER, ROLES.DEPUTY_HEADTEACHER,
  ROLES.SECRETARY, ROLES.ACCOUNTANT, ROLES.TEACHER, ROLES.DEPARTMENT_HEAD
);

// Only leadership can approve / reject
const canApprove = authorize(
  ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.HEADTEACHER, ROLES.DEPUTY_HEADTEACHER
);

router.post('/',                   anyStaff,   validateApply,   applyLeave);
router.get('/',                    anyStaff,                    listLeaves);
router.get('/balances',            anyStaff,                    getBalances);
router.get('/pending-count',       canApprove,                  getPendingCount);
router.get('/on-leave-today',      canApprove,                  getOnLeaveToday);
router.get('/:id',                 anyStaff,                    getLeave);
router.patch('/:id/approve',       canApprove, validateApprove, approveLeave);
router.patch('/:id/reject',        canApprove, validateReject,  rejectLeave);
router.delete('/:id',              anyStaff,                    cancelLeave);

export default router;
