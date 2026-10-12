// routes/categoryRoutes.js
import express from 'express';
import {
  getCategories,
  getAllCategories,
  getCategory,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  toggleCategoryStatus,
  reorderCategories,
  getCategoryStats
} from '../controllers/categoryController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { auditLog } from '../middleware/auditLog.js';

const router = express.Router();

// =============================================
// PUBLIC ROUTES
// =============================================

// ✅ Get all active categories
router.get('/', apiLimiter, getCategories);

// ✅ Get category stats (public)
router.get('/stats', apiLimiter, getCategoryStats);

// ✅ Get by slug (MUST be before /:id)
router.get('/slug/:slug', apiLimiter, getCategoryBySlug);

// ✅ Get single by ID
router.get('/:id', apiLimiter, getCategory);

// =============================================
// ADMIN ROUTES
// =============================================

// ✅ Get ALL categories including inactive
router.get(
  '/admin/all',
  protect,
  authorize('admin'),
  getAllCategories
);

// ✅ Create category
router.post(
  '/',
  protect,
  authorize('admin'),
  auditLog('CATEGORY_CREATE'),
  createCategory
);

// ✅ Reorder categories
router.post(
  '/reorder',
  protect,
  authorize('admin'),
  auditLog('CATEGORY_REORDER'),
  reorderCategories
);

// ✅ Update category
router.put(
  '/:id',
  protect,
  authorize('admin'),
  auditLog('CATEGORY_UPDATE'),
  updateCategory
);

// ✅ Toggle status
router.patch(
  '/:id/toggle-status',
  protect,
  authorize('admin'),
  auditLog('CATEGORY_TOGGLE'),
  toggleCategoryStatus
);

// ✅ Delete category
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  auditLog('CATEGORY_DELETE'),
  deleteCategory
);

export default router;