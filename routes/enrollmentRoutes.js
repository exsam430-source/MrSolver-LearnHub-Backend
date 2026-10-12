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
import {
  apiLimiter,
  searchLimiter
} from '../middleware/rateLimiter.js';
import { auditLog } from '../middleware/auditLog.js';

const router = express.Router();

// ✅ All enrollment routes require authentication
router.use(protect);

// =============================================
// STUDENT - ENROLLMENT
// =============================================
router.post(
  '/',
  apiLimiter,
  auditLog('COURSE_ENROLL'),
  enrollInCourse
);

router.get('/my-enrollments', getMyEnrollments);
router.get('/check/:courseId', checkEnrollment);
router.get('/:id', getEnrollment);

// =============================================
// STUDENT - PROGRESS & WATCH TRACKING
// =============================================
router.get('/progress/:courseId', getCourseProgress);
router.get('/lecture-progress/:lectureId', getLectureWatchProgress);

router.post(
  '/start-watch/:lectureId',
  apiLimiter, // ✅ Rate limited
  startWatch
);

router.post(
  '/watch-progress/:lectureId',
  updateWatchProgress
);

router.post(
  '/complete/:lectureId',
  auditLog('LECTURE_COMPLETE'),
  markLectureComplete
);

// =============================================
// STUDENT - CODE SUBMISSIONS
// =============================================
router.post(
  '/submit-code/:lectureId',
  apiLimiter,
  auditLog('CODE_SUBMIT'),
  submitCode
);

router.get('/submissions/:lectureId', getCodeSubmissions);

// =============================================
// STUDENT - ZOOM ATTENDANCE
// =============================================
router.post('/zoom-attendance/:lectureId', recordZoomAttendance);

// =============================================
// STUDENT - BOOKMARKS
// =============================================
router.post('/bookmark/:lectureId', addBookmark);
router.delete('/bookmark/:bookmarkId', removeBookmark);

// =============================================
// STUDENT - NOTES
// =============================================
router.put('/notes/:lectureId', saveLectureNotes);

// =============================================
// INSTRUCTOR
// =============================================
router.get(
  '/course/:courseId',
  authorize('instructor', 'admin'),
  getCourseEnrollments
);

// =============================================
// ADMIN
// =============================================
router.get(
  '/admin/all',
  authorize('admin'),
  searchLimiter,
  getAllEnrollments
);

router.put(
  '/:id/status',
  authorize('admin'),
  auditLog('ENROLLMENT_STATUS_UPDATE'),
  updateEnrollmentStatus
);

router.delete(
  '/:id',
  authorize('admin'),
  auditLog('ENROLLMENT_CANCEL'),
  cancelEnrollment
);

export default router;