// routes/enrollmentRoutes.js
import express from 'express';
import {
  enrollInCourse,
  getMyEnrollments,
  getEnrollment,
  getAllEnrollments,
  updateEnrollmentStatus,
  getCourseEnrollments,
  checkEnrollment,
  cancelEnrollment,
  // NEW watch tracking routes
  getCourseProgress,
  getLectureWatchProgress,
  startWatch,
  updateWatchProgress,
  markLectureComplete,
  submitCode,
  recordZoomAttendance,
  addBookmark,
  removeBookmark,
  saveLectureNotes,
  getCodeSubmissions
} from '../controllers/enrollmentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

router.use(protect);

// ============================================
// Student routes
// ============================================
router.post('/', enrollInCourse);
router.get('/my-enrollments', getMyEnrollments);
router.get('/check/:courseId', checkEnrollment);
router.get('/:id', getEnrollment);

// ============================================
// Progress & Watch Tracking (NEW)
// ============================================
router.get('/progress/:courseId', getCourseProgress);
router.get('/lecture-progress/:lectureId', getLectureWatchProgress);
router.post('/start-watch/:lectureId', startWatch);
router.post('/watch-progress/:lectureId', updateWatchProgress);
router.post('/complete/:lectureId', markLectureComplete);

// ============================================
// Code Submissions (NEW)
// ============================================
router.post('/submit-code/:lectureId', submitCode);
router.get('/submissions/:lectureId', getCodeSubmissions);

// ============================================
// Zoom Attendance (NEW)
// ============================================
router.post('/zoom-attendance/:lectureId', recordZoomAttendance);

// ============================================
// Bookmarks (NEW)
// ============================================
router.post('/bookmark/:lectureId', addBookmark);
router.delete('/bookmark/:bookmarkId', removeBookmark);

// ============================================
// Notes (NEW)
// ============================================
router.put('/notes/:lectureId', saveLectureNotes);

// ============================================
// Instructor routes
// ============================================
router.get('/course/:courseId', authorize('instructor', 'admin'), getCourseEnrollments);

// ============================================
// Admin routes
// ============================================
router.get('/admin/all', authorize('admin'), getAllEnrollments);
router.put('/:id/status', authorize('admin'), updateEnrollmentStatus);
router.delete('/:id', authorize('admin'), cancelEnrollment);

export default router;