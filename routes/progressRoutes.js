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
  getStudentProgress
} from '../controllers/progressController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { uploadResources, handleMulterError } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.use(protect);

/**
 * IMPORTANT:
 * Put the more specific route BEFORE the less specific one
 * so /course/:courseId/students is not confused with /course/:courseId
 */

// Instructor routes
router.get('/course/:courseId/students', authorize('instructor', 'admin'), getStudentProgress);
router.put('/:progressId/grade', authorize('instructor', 'admin'), gradeAssignment);

// Student routes
router.get('/course/:courseId', getCourseProgress);
router.get('/lecture/:lectureId', getLectureProgress);
router.put('/lecture/:lectureId', updateLectureProgress);

router.post('/lecture/:lectureId/complete', markLectureComplete);
router.post('/lecture/:lectureId/incomplete', markLectureIncomplete);

router.post('/lecture/:lectureId/quiz', submitQuiz);
router.post('/lecture/:lectureId/assignment', uploadResources, handleMulterError, submitAssignment);

// Notes
router.get('/lecture/:lectureId/notes', getNotes);
router.post('/lecture/:lectureId/notes', addNote);
router.delete('/lecture/:lectureId/notes/:noteIndex', deleteNote);

export default router;