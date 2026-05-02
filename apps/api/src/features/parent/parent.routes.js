import { Router } from 'express';
import { protect, blockIfMustChangePassword, authorize } from '../../middleware/auth.js';
import requireFeature from '../../middleware/requireFeature.js';
import { ROLES, PLAN_FEATURES } from '../../constants/index.js';
import {
  getMyChildren,
  getChildFees,
  getChildAttendance,
  getChildResults,
} from './parent.controller.js';

const router = Router();

// All parent routes: must be authenticated, not pending password change, and role=parent
// ── Feature gate: parent portal ──────────────────────────────────────────────
// Plan-tier feature gate is active via PLAN_FEATURE_MAP.
router.use(protect, blockIfMustChangePassword, requireFeature(PLAN_FEATURES.PARENT_PORTAL), authorize(ROLES.PARENT));

router.get('/children', getMyChildren);
router.get('/children/:studentId/fees', getChildFees);
router.get('/children/:studentId/attendance', getChildAttendance);
router.get('/children/:studentId/results', getChildResults);

export default router;
