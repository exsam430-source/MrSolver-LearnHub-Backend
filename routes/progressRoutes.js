// routes/progressRoutes.js
import express from 'express';
import {
  getCourseProgress,
  getLectureProgress,
  updateLectureProgress,
  markLectureComplete,
  markLectureIncomplete,
  submitQuiz,
  submitAssignment,
  gradeAssignment,
  addNote,
  getNotes,
  deleteNote,
  getStudentProgress,
} from '../controllers/progressController.js';

import { protect }   from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import {
  uploadResources,
  wrapMulter,
} from '../middleware/uploadMiddleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { auditLog }   from '../middleware/auditLog.js';

const router = express.Router();

// ✅ All routes require auth
router.use(protect);

// ============================================
// INSTRUCTOR ROUTES (specific first)
// ============================================
router.get(
  '/course/:courseId/students',
  authorize('instructor', 'admin'),
  getStudentProgress
);

router.put(
  '/:progressId/grade',
  authorize('instructor', 'admin'),
  auditLog('ASSIGNMENT_GRADED'),
  gradeAssignment
);

// ============================================
// STUDENT - COURSE PROGRESS
// ============================================
router.get('/course/:courseId', getCourseProgress);

// ============================================
// STUDENT - LECTURE PROGRESS
// ============================================
router.get('/lecture/:lectureId',  getLectureProgress);
router.put('/lecture/:lectureId',  updateLectureProgress);

// ============================================
// STUDENT - COMPLETE / INCOMPLETE
// ============================================
router.post(
  '/lecture/:lectureId/complete',
  apiLimiter,
  auditLog('LECTURE_COMPLETE'),
  markLectureComplete
);

router.post(
  '/lecture/:lectureId/incomplete',
  apiLimiter,
  markLectureIncomplete
);

// ============================================
// STUDENT - QUIZ
// ============================================
router.post(
  '/lecture/:lectureId/quiz',
  apiLimiter,
  auditLog('QUIZ_SUBMIT'),
  submitQuiz
);

// ============================================
// STUDENT - ASSIGNMENT
// ============================================
router.post(
  '/lecture/:lectureId/assignment',
  apiLimiter,
  auditLog('ASSIGNMENT_SUBMIT'),
  wrapMulter(uploadResources),
  submitAssignment
);

// ============================================
// STUDENT - NOTES
// ============================================
router.get(
  '/lecture/:lectureId/notes',
  getNotes
);

router.post(
  '/lecture/:lectureId/notes',
  apiLimiter,
  addNote
);

router.delete(
  '/lecture/:lectureId/notes/:noteIndex',
  deleteNote
);

export default router;