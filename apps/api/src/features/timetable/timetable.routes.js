import { Router } from 'express';
import { protect, blockIfMustChangePassword, authorize } from '../../middleware/auth.js';
import requireFeature from '../../middleware/requireFeature.js';
import {
  createTimetable,
  listTimetables,
  getTimetable,
  updateSlots,
  deleteTimetable,
} from './timetable.controller.js';
import {
  validateCreateTimetable,
  validateListTimetables,
  validateUpdateSlots,
} from './timetable.validator.js';
import { ROLES, ROLE_GROUPS, PLAN_FEATURES } from '../../constants/index.js';

const router = Router();

// ── Feature gate: timetable module ───────────────────────────────────────────
// Feature gate: requires active subscription (see requireFeature middleware).
router.use(protect, blockIfMustChangePassword, requireFeature(PLAN_FEATURES.TIMETABLE));

const canRead = authorize(...ROLE_GROUPS.ALL_STAFF);

router.get('/',   canRead, validateListTimetables, listTimetables);
router.get('/:id', canRead, getTimetable);

// Write access: school admin, headteacher and deputy headteacher
// (directors are excluded — they approve, not schedule)
const canWrite = authorize(ROLES.SCHOOL_ADMIN, ROLES.HEADTEACHER, ROLES.DEPUTY_HEADTEACHER);

router.post('/',            canWrite, validateCreateTimetable, createTimetable);
router.put('/:id/slots',    canWrite, validateUpdateSlots, updateSlots);
router.delete('/:id',       canWrite, deleteTimetable);

export default router;
