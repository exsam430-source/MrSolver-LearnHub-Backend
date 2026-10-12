// routes/projectRoutes.js
import express from 'express';
import {
  getAllProjects,
  getFeaturedProjects,
  getProjectBySlug,
  getProjectStats,
  getAllProjectsAdmin,
  getProjectById,
  createProject,
  updateProject,
  updateProjectThumbnail,
  addScreenshots,
  removeScreenshot,
  deleteProject,
  togglePublish,
  toggleFeatured,
} from '../controllers/projectController.js';

import { protect } from '../middleware/authMiddleware.js';
import { isDeveloperOrAdmin } from '../middleware/roleMiddleware.js';
import {
  uploadProjectImage,
  uploadProjectImages,
} from '../middleware/uploadMiddleware.js';
import { apiLimiter, searchLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { auditLog } from '../middleware/auditLog.js';

const router = express.Router();

// =============================================
// PUBLIC ROUTES
// =============================================
router.get('/featured', searchLimiter, getFeaturedProjects);
router.get('/stats', searchLimiter, getProjectStats);

// =============================================
// ADMIN/DEVELOPER ROUTES (must come before /:slug)
// =============================================
router.get(
  '/admin/all',
  protect,
  isDeveloperOrAdmin,
  auditLog('ADMIN_LIST_PROJECTS'),
  getAllProjectsAdmin
);

router.get(
  '/admin/:id',
  protect,
  isDeveloperOrAdmin,
  auditLog('ADMIN_VIEW_PROJECT'),
  getProjectById
);

router.post(
  '/',
  protect,
  isDeveloperOrAdmin,
  uploadLimiter,
  uploadProjectImage,
  auditLog('CREATE_PROJECT'),
  createProject
);

router.put(
  '/:id',
  protect,
  isDeveloperOrAdmin,
  auditLog('UPDATE_PROJECT'),
  updateProject
);

router.put(
  '/:id/thumbnail',
  protect,
  isDeveloperOrAdmin,
  uploadLimiter,
  uploadProjectImage,
  auditLog('UPDATE_PROJECT_THUMBNAIL'),
  updateProjectThumbnail
);

router.post(
  '/:id/screenshots',
  protect,
  isDeveloperOrAdmin,
  uploadLimiter,
  uploadProjectImages,
  auditLog('ADD_PROJECT_SCREENSHOTS'),
  addScreenshots
);

router.delete(
  '/:id/screenshots/:index',
  protect,
  isDeveloperOrAdmin,
  auditLog('REMOVE_PROJECT_SCREENSHOT'),
  removeScreenshot
);

router.delete(
  '/:id',
  protect,
  isDeveloperOrAdmin,
  auditLog('DELETE_PROJECT'),
  deleteProject
);

router.patch(
  '/:id/publish',
  protect,
  isDeveloperOrAdmin,
  auditLog('TOGGLE_PROJECT_PUBLISH'),
  togglePublish
);

router.patch(
  '/:id/featured',
  protect,
  isDeveloperOrAdmin,
  auditLog('TOGGLE_PROJECT_FEATURED'),
  toggleFeatured
);

// =============================================
// PUBLIC ROUTES (slug-based - must be last)
// =============================================
router.get('/', searchLimiter, getAllProjects);
router.get('/:slug', searchLimiter, getProjectBySlug);

export default router;