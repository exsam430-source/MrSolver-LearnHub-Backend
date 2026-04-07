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

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { uploadVideo, uploadResources, handleMulterError } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Apply protect middleware to all routes
router.use(protect);

// Reorder (fixed path first - before :id routes)
router.put('/reorder', authorize('instructor', 'admin'), reorderLectures);

// CRUD
router.post('/', authorize('instructor', 'admin'), createLecture);
router.get('/:id', getLecture);
router.put('/:id', authorize('instructor', 'admin'), updateLecture);
router.delete('/:id', authorize('instructor', 'admin'), deleteLecture);

// Content types
router.put('/:id/video', authorize('instructor', 'admin'), uploadVideo, handleMulterError, uploadLectureVideo);
router.put('/:id/youtube', authorize('instructor', 'admin'), addYouTubeVideo);
router.put('/:id/article', authorize('instructor', 'admin'), addArticleContent);
router.put('/:id/quiz', authorize('instructor', 'admin'), addQuiz);
router.put('/:id/zoom', authorize('instructor', 'admin'), addZoomMeeting);
router.put('/:id/interactive', authorize('instructor', 'admin'), addInteractiveContent);
router.put('/:id/lesson', authorize('instructor', 'admin'), addLessonContent);

// Watch settings (Instructor only)
router.put('/:id/watch-settings', authorize('instructor', 'admin'), updateWatchSettings);

// Resources
router.post('/:id/resources', authorize('instructor', 'admin'), uploadResources, handleMulterError, addResources);

// Publish
router.patch('/:id/publish', authorize('instructor', 'admin'), toggleLecturePublish);

export default router;