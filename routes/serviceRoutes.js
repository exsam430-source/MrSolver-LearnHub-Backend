// routes/serviceRoutes.js
import express from 'express';
import {
  getAllServices,
  getFeaturedServices,
  getServiceBySlug,
  getServiceStats,
  getAllServicesAdmin,
  getServiceById,
  createService,
  updateService,
  updateServiceThumbnail,
  deleteService,
  togglePublish,
  toggleFeatured,
} from '../controllers/serviceController.js';

import { protect } from '../middleware/authMiddleware.js';
import { isDeveloperOrAdmin } from '../middleware/roleMiddleware.js';
import { uploadServiceImage } from '../middleware/uploadMiddleware.js';
import { apiLimiter, searchLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { auditLog } from '../middleware/auditLog.js';

const router = express.Router();

// =============================================
// PUBLIC ROUTES
// =============================================
router.get('/featured', searchLimiter, getFeaturedServices);
router.get('/stats', searchLimiter, getServiceStats);

// =============================================
// ADMIN/DEVELOPER ROUTES (must come before /:slug)
// =============================================
router.get(
  '/admin/all',
  protect,
  isDeveloperOrAdmin,
  auditLog('ADMIN_LIST_SERVICES'),
  getAllServicesAdmin
);

router.get(
  '/admin/:id',
  protect,
  isDeveloperOrAdmin,
  auditLog('ADMIN_VIEW_SERVICE'),
  getServiceById
);

router.post(
  '/',
  protect,
  isDeveloperOrAdmin,
  auditLog('CREATE_SERVICE'),
  createService
);

router.put(
  '/:id',
  protect,
  isDeveloperOrAdmin,
  auditLog('UPDATE_SERVICE'),
  updateService
);

router.put(
  '/:id/thumbnail',
  protect,
  isDeveloperOrAdmin,
  uploadLimiter,
  uploadServiceImage,
  auditLog('UPDATE_SERVICE_THUMBNAIL'),
  updateServiceThumbnail
);

router.delete(
  '/:id',
  protect,
  isDeveloperOrAdmin,
  auditLog('DELETE_SERVICE'),
  deleteService
);

router.patch(
  '/:id/publish',
  protect,
  isDeveloperOrAdmin,
  auditLog('TOGGLE_SERVICE_PUBLISH'),
  togglePublish
);

router.patch(
  '/:id/featured',
  protect,
  isDeveloperOrAdmin,
  auditLog('TOGGLE_SERVICE_FEATURED'),
  toggleFeatured
);

// =============================================
// PUBLIC ROUTES (slug-based - must be last)
// =============================================
router.get('/', searchLimiter, getAllServices);
router.get('/:slug', searchLimiter, getServiceBySlug);

export default router;