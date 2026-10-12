// routes/courseRoutes.js
import express from 'express';
import {
  getCourses,
  getFeaturedCourses,
  getCourseBySlug,
  getCourseById,
  createCourse,
  updateCourse,
  updateCourseThumbnail,
  deleteCourse,
  togglePublish,
  addSection,
  updateSection,
  deleteSection,
  getInstructorCourses,
  getAllCoursesAdmin,
  toggleFeatured
} from '../controllers/courseController.js';

import { protect, optionalAuth } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { uploadThumbnail, handleMulterError } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createCourseSchema,
  updateCourseSchema,
  addSectionSchema,
  courseQuerySchema,
  validateCreateCourse,
  validateUpdateCourse,
  validateAddSection,
  validateCourseQuery
} from '../middleware/courseValidate.js';
import {
  apiLimiter,
  searchLimiter,
  uploadLimiter
} from '../middleware/rateLimiter.js';
import { auditLog } from '../middleware/auditLog.js';

const router = express.Router();

// =============================================
// PUBLIC ROUTES
// =============================================

// ✅ Get all published courses (with search rate limiting)
router.get(
  '/',
  searchLimiter,
  getCourses
);

// ✅ Get featured courses
router.get('/featured', getFeaturedCourses);

// =============================================
// ADMIN ROUTES (before dynamic :slug)
// =============================================
router.get(
  '/admin/all',
  protect,
  authorize('admin'),
  validate(courseQuerySchema, 'query'),
  auditLog('ADMIN_LIST_COURSES'),
  getAllCoursesAdmin
);

// =============================================
// INSTRUCTOR ROUTES
// =============================================
router.get(
  '/instructor/my-courses',
  protect,
  authorize('instructor', 'admin'),
  getInstructorCourses
);

// ✅ Get course by ID (instructor/admin)
router.get(
  '/id/:id',
  protect,
  authorize('instructor', 'admin'),
  getCourseById
);

// =============================================
// COURSE CRUD
// =============================================

// ✅ Create course
router.post(
  '/',
  protect,
  authorize('instructor', 'admin'),
  validateCreateCourse,
  auditLog('COURSE_CREATE'),
  createCourse
);

// ✅ Update course
router.put(
  '/:id',
  protect,
  authorize('instructor', 'admin'),
  validateUpdateCourse,
  auditLog('COURSE_UPDATE'),
  updateCourse
);

// ✅ Update thumbnail
router.put(
  '/:id/thumbnail',
  protect,
  authorize('instructor', 'admin'),
  uploadLimiter,
  uploadThumbnail,
  handleMulterError,
  auditLog('COURSE_THUMBNAIL_UPDATE'),
  updateCourseThumbnail
);

// ✅ Delete course
router.delete(
  '/:id',
  protect,
  authorize('instructor', 'admin'),
  auditLog('COURSE_DELETE'),
  deleteCourse
);

// ✅ Publish/Unpublish
router.patch(
  '/:id/publish',
  protect,
  authorize('instructor', 'admin'),
  auditLog('COURSE_PUBLISH_TOGGLE'),
  togglePublish
);

// ✅ Feature/Unfeature (Admin only)
router.patch(
  '/:id/featured',
  protect,
  authorize('admin'),
  auditLog('COURSE_FEATURED_TOGGLE'),
  toggleFeatured
);

// =============================================
// SECTION ROUTES
// =============================================
router.post(
  '/:id/sections',
  protect,
  authorize('instructor', 'admin'),
  validateAddSection,
  auditLog('SECTION_ADD'),
  addSection
);

router.put(
  '/:id/sections/:sectionIndex',
  protect,
  authorize('instructor', 'admin'),
  auditLog('SECTION_UPDATE'),
  updateSection
);

router.delete(
  '/:id/sections/:sectionIndex',
  protect,
  authorize('instructor', 'admin'),
  auditLog('SECTION_DELETE'),
  deleteSection
);

// =============================================
// PUBLIC: COURSE DETAIL (LAST - dynamic route)
// =============================================
router.get('/:slug', optionalAuth, getCourseBySlug);

export default router;