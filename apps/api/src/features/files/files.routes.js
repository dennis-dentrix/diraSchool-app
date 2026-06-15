import { Router } from 'express';
import { protect, blockIfMustChangePassword } from '../../middleware/auth.js';
import { getFileUrl } from './files.controller.js';

const router = Router();

router.use(protect, blockIfMustChangePassword);

router.get('/signed-url', getFileUrl);

export default router;
