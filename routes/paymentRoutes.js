// routes/paymentRoutes.js
import express from 'express';
import {
  submitPayment,
  getMyPayments,
  getPayment,
  getAllPayments,
  reviewPayment,
  getPaymentStats,
  markUnderReview
} from '../controllers/paymentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { uploadPaymentScreenshot, handleMulterError } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.use(protect);

// Student routes
router.post('/', uploadPaymentScreenshot, handleMulterError, submitPayment);
router.get('/my-payments', getMyPayments);

// Admin routes (BEFORE /:id)
router.get('/admin/all', authorize('admin'), getAllPayments);
router.get('/stats', authorize('admin'), getPaymentStats);
router.put('/:id/review', authorize('admin'), reviewPayment);
router.patch('/:id/under-review', authorize('admin'), markUnderReview);

// Generic (LAST)
router.get('/:id', getPayment);

export default router;