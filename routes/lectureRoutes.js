// routes/lectureRoutes.js
import express from 'express';
import {
  getLecture,
  createLecture,
  updateLecture,
  uploadLectureVideo,
  addYouTubeVideo,
  addArticleContent,
  addQuiz,
  deleteLecture,
  reorderLectures,
  toggleLecturePublish,
  addResources,
  addZoomMeeting,
  addInteractiveContent,
  updateWatchSettings,
  addLessonContent
} from '../controllers/lectureController.js';

import { protect }              from '../middleware/authMiddleware.js';
import { authorize }            from '../middleware/roleMiddleware.js';
import {
  uploadVideo,
  uploadResources,
  handleMulterError,
  wrapMulter,
} from '../middleware/uploadMiddleware.js';

const router = express.Router();

// ✅ All routes require auth
router.use(protect);

// ✅ MUST be before /:id routes
router.put(
  '/reorder',
  authorize('instructor', 'admin'),
  reorderLectures
);

// =============================================
// CRUD
// =============================================
router.post(
  '/',
  authorize('instructor', 'admin'),
  createLecture
);

router.get('/:id', getLecture);

router.put(
  '/:id',
  authorize('instructor', 'admin'),
  updateLecture
);

router.delete(
  '/:id',
  authorize('instructor', 'admin'),
  deleteLecture
);

// =============================================
// CONTENT TYPES
// =============================================

// ✅ Video - uses wrapMulter to properly catch errors
router.put(
  '/:id/video',
  authorize('instructor', 'admin'),
  wrapMulter(uploadVideo),
  uploadLectureVideo
);

router.put(
  '/:id/youtube',
  authorize('instructor', 'admin'),
  addYouTubeVideo
);

router.put(
  '/:id/article',
  authorize('instructor', 'admin'),
  addArticleContent
);

router.put(
  '/:id/quiz',
  authorize('instructor', 'admin'),
  addQuiz
);

router.put(
  '/:id/zoom',
  authorize('instructor', 'admin'),
  addZoomMeeting
);

router.put(
  '/:id/interactive',
  authorize('instructor', 'admin'),
  addInteractiveContent
);

router.put(
  '/:id/lesson',
  authorize('instructor', 'admin'),
  addLessonContent
);

// =============================================
// SETTINGS
// =============================================
router.put(
  '/:id/watch-settings',
  authorize('instructor', 'admin'),
  updateWatchSettings
);

// =============================================
// RESOURCES
// =============================================
router.post(
  '/:id/resources',
  authorize('instructor', 'admin'),
  wrapMulter(uploadResources),
  addResources
);

// =============================================
// PUBLISH
// =============================================
router.patch(
  '/:id/publish',
  authorize('instructor', 'admin'),
  toggleLecturePublish
);

export default router;