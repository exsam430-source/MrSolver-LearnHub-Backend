import express from 'express';
import {
  getCourseReviews,
  getMyReviews,
  getReview,
  addReview,
  updateReview,
  deleteReview,
  markHelpful,
  respondToReview,
  deleteResponse,
  getAllReviewsAdmin,
  toggleApproval,
  getReviewStats
} from '../controllers/reviewController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Public routes (fixed paths first)
router.get('/course/:courseId', getCourseReviews);
router.get('/stats/:courseId', getReviewStats);

// Admin routes (BEFORE /:id)
router.get('/admin/all', protect, authorize('admin'), getAllReviewsAdmin);

// Protected routes
router.get('/user/my-reviews', protect, getMyReviews);
router.post('/', protect, addReview);

// Instructor routes
router.post('/:id/respond', protect, authorize('instructor', 'admin'), respondToReview);
router.delete('/:id/respond', protect, authorize('instructor', 'admin'), deleteResponse);

// Admin
router.patch('/:id/approve', protect, authorize('admin'), toggleApproval);

// Protected update/delete
router.put('/:id', protect, updateReview);
router.delete('/:id', protect, deleteReview);
router.post('/:id/helpful', protect, markHelpful);

// Generic (LAST)
router.get('/:id', getReview);

export default router;