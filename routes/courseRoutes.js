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

const router = express.Router();

// Public routes
router.get('/', getCourses);
router.get('/featured', getFeaturedCourses);

// Admin routes (BEFORE dynamic routes)
router.get('/admin/all', protect, authorize('admin'), getAllCoursesAdmin);

// Instructor routes
router.get('/instructor/my-courses', protect, authorize('instructor', 'admin'), getInstructorCourses);
router.get('/id/:id', protect, authorize('instructor', 'admin'), getCourseById);

// Course CRUD
router.post('/', protect, authorize('instructor', 'admin'), createCourse);
router.put('/:id', protect, authorize('instructor', 'admin'), updateCourse);
router.put('/:id/thumbnail', protect, authorize('instructor', 'admin'), uploadThumbnail, handleMulterError, updateCourseThumbnail);
router.delete('/:id', protect, authorize('instructor', 'admin'), deleteCourse);
router.patch('/:id/publish', protect, authorize('instructor', 'admin'), togglePublish);
router.patch('/:id/featured', protect, authorize('admin'), toggleFeatured);

// Section routes
router.post('/:id/sections', protect, authorize('instructor', 'admin'), addSection);
router.put('/:id/sections/:sectionIndex', protect, authorize('instructor', 'admin'), updateSection);
router.delete('/:id/sections/:sectionIndex', protect, authorize('instructor', 'admin'), deleteSection);

// Public course detail (LAST - dynamic route)
router.get('/:slug', optionalAuth, getCourseBySlug);

export default router;