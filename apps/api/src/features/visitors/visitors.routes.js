import { Router } from 'express';
import { protect, blockIfMustChangePassword, authorize } from '../../middleware/auth.js';
import { ROLES, ROLE_GROUPS } from '../../constants/index.js';
import { listVisitors, createVisitor, updateVisitor, deleteVisitor } from './visitors.controller.js';

const router = Router();

router.use(protect, blockIfMustChangePassword);

const canAccess = authorize(...ROLE_GROUPS.ADMIN, ROLES.SECRETARY);
const canWrite  = canAccess;

router.get('/', canAccess, listVisitors);
router.post('/', canWrite, createVisitor);
router.patch('/:id', canWrite, updateVisitor);
router.delete('/:id', canWrite, deleteVisitor);

export default router;
