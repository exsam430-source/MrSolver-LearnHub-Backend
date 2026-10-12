// routes/paymentRoutes.js
import express from 'express';
import {
  submitPayment,
  getMyPayments,
  getPayment,
  getAllPayments,
  reviewPayment,
  getPaymentStats,
  markUnderReview,
  checkPaymentStatus,
  getPaymentReceipt
} from '../controllers/paymentController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import {
  apiLimiter,
  uploadLimiter,
  searchLimiter
} from '../middleware/rateLimiter.js';
import { auditLog } from '../middleware/auditLog.js';
import {
  uploadPaymentScreenshot,
  handleMulterError
} from '../middleware/uploadMiddleware.js';

const router = express.Router();

// ✅ Apply auth to all routes
router.use(protect);

// =============================================
// ✅ RULE: Most specific routes FIRST, generic /:id LAST
// =============================================

// ── Student Routes ──────────────────────────

// GET /payments/my-payments
router.get('/my-payments', getMyPayments);

// GET /payments/check-status/:courseId
router.get('/check-status/:courseId', checkPaymentStatus);

// GET /payments/receipt/:paymentId
router.get('/receipt/:paymentId', getPaymentReceipt);

// ── Admin Routes ─────────────────────────────

// GET /payments/stats  ← MUST be before /:id
router.get(
  '/stats',
  authorize('admin'),
  getPaymentStats
);

// GET /payments/admin/all
router.get(
  '/admin/all',
  authorize('admin'),
  searchLimiter,
  getAllPayments
);

// ── Submit Payment ───────────────────────────

// POST /payments
router.post(
  '/',
  uploadLimiter,
  uploadPaymentScreenshot,
  handleMulterError,
  auditLog('PAYMENT_SUBMIT'),
  submitPayment
);

// ── Admin Actions on specific payment ────────

// ✅ FIXED: Changed to PUT to match adminService.js
router.put(
  '/:id/review',
  authorize('admin'),
  auditLog('PAYMENT_REVIEW'),
  reviewPayment
);

// PATCH /payments/:id/under-review
router.patch(
  '/:id/under-review',
  authorize('admin'),
  markUnderReview
);

// ── Generic /:id LAST ─────────────────────────

// GET /payments/:id
router.get('/:id', getPayment);

export default router;