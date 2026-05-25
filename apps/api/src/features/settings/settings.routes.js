import { Router } from 'express';
import { protect, blockIfMustChangePassword, authorize } from '../../middleware/auth.js';
import { ROLES } from '../../constants/index.js';

// Deputy headteacher excluded from settings — they operate, they don't configure
const seniorAdmin = authorize(ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.HEADTEACHER);
import { uploadImage } from '../../middleware/upload.js';
import {
  getSettings,
  updateSettings,
  addHoliday,
  deleteHoliday,
  uploadSchoolLogo,
} from './settings.controller.js';
import {
  validateUpdateSettings,
  validateAddHoliday,
} from './settings.validator.js';
import { updateGeofence, updateCheckInTimes } from '../checkins/checkins.controller.js';
import { validateGeofence, validateCheckInTimes } from '../checkins/checkins.validator.js';

const router = Router();

router.use(protect, blockIfMustChangePassword);

router.get('/',  getSettings);
router.put('/', seniorAdmin, validateUpdateSettings, updateSettings);
router.post('/logo', seniorAdmin, uploadImage('logo'), uploadSchoolLogo);
router.post('/holidays', seniorAdmin, validateAddHoliday, addHoliday);
router.delete('/holidays/:holidayId', seniorAdmin, deleteHoliday);
router.put('/geofence', seniorAdmin, validateGeofence, updateGeofence);
router.put('/checkin-times', seniorAdmin, validateCheckInTimes, updateCheckInTimes);

export default router;
