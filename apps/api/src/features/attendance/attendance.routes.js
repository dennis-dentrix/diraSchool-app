import express from 'express';
import { protect, blockIfMustChangePassword, authorize } from '../../middleware/auth.js';
import { ROLE_GROUPS } from '../../constants/index.js';
import {
  validateCreateAttendanceRegister,
  validateListAttendanceRegisters,
  validateUpdateAttendanceRegister,
} from './attendance.validator.js';
import {
  createAttendanceRegister,
  listAttendanceRegisters,
  getAttendanceRegister,
  updateAttendanceRegister,
  submitAttendanceRegister,
} from './attendance.controller.js';

const router = express.Router();

router.use(protect, blockIfMustChangePassword);

const canRead  = authorize(...ROLE_GROUPS.ALL_STAFF);
// Secretaries and accountants cannot take/edit attendance
const canWrite = authorize(...ROLE_GROUPS.ACADEMIC);

router.get('/registers', canRead, validateListAttendanceRegisters, listAttendanceRegisters);
router.post('/registers', canWrite, validateCreateAttendanceRegister, createAttendanceRegister);

router.get('/registers/:id', canRead, getAttendanceRegister);
router.patch('/registers/:id', canWrite, validateUpdateAttendanceRegister, updateAttendanceRegister);

router.post('/registers/:id/submit', canWrite, submitAttendanceRegister);

export default router;
