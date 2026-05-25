import { Router } from 'express';
import { protect, blockIfMustChangePassword, authorize } from '../../middleware/auth.js';
import requireFeature from '../../middleware/requireFeature.js';
import { listAuditLogs } from './audit.controller.js';
import { PLAN_FEATURES, ROLES, ROLE_GROUPS } from '../../constants/index.js';

const router = Router();

// ── Feature gate: audit log ───────────────────────────────────────────────────
// Audit logs are sensitive — only school admin, director, and headteacher may view.
router.use(
  protect,
  blockIfMustChangePassword,
  requireFeature(PLAN_FEATURES.AUDIT_LOG),
  authorize(ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.HEADTEACHER) // deputy excluded: audit is sensitive
);

router.get('/', listAuditLogs);

export default router;
