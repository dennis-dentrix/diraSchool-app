import express from 'express';
import { protect, blockIfMustChangePassword, adminOnly, authorize } from '../../middleware/auth.js';
import { ROLES, ROLE_GROUPS } from '../../constants/index.js';
import {
  validateCreateSubject,
  validateUpdateSubject,
  validateAssignTeachers,
  validateListSubjects,
} from './subjects.validator.js';
import {
  createSubject,
  listSubjects,
  getSubject,
  updateSubject,
  deleteSubject,
  assignTeachers,
  mySubjects,
  selfAssignSubject,
} from './subjects.controller.js';
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  addMember,
  removeMember,
} from './departments.controller.js';

const router = express.Router();

router.use(protect, blockIfMustChangePassword);

const canRead = authorize(...ROLE_GROUPS.ACADEMIC, ROLES.SECRETARY);

// ── Departments — must be before /:id to avoid param shadowing ───────────────
router.get('/departments',                          canRead,   listDepartments);
router.post('/departments',                         adminOnly, createDepartment);
router.patch('/departments/:id',                    adminOnly, updateDepartment);
router.delete('/departments/:id',                   adminOnly, deleteDepartment);
router.post('/departments/:id/members',             adminOnly, addMember);
router.delete('/departments/:id/members/:userId',   adminOnly, removeMember);

// My subjects — teacher-facing shortcut
router.get('/my-subjects', authorize(ROLES.TEACHER, ROLES.DEPARTMENT_HEAD), mySubjects);

// List & detail — teachers included (controller filters by teacherIds for teachers)
router.get('/',    canRead, validateListSubjects, listSubjects);
router.get('/:id', canRead, getSubject);

// Write operations — admin roles only
router.post('/',   adminOnly, validateCreateSubject, createSubject);

router.route('/:id')
  .patch(adminOnly, validateUpdateSubject, updateSubject)
  .delete(adminOnly, deleteSubject);

// Assign teachers + HOD for a subject (admin only)
router.patch('/:id/teachers', adminOnly, validateAssignTeachers, assignTeachers);

// Teacher self-assigns or removes themselves from a subject
router.patch('/:id/self-assign', authorize(ROLES.TEACHER, ROLES.DEPARTMENT_HEAD), selfAssignSubject);

export default router;
