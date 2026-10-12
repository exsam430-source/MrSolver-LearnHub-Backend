// routes/dashboardRoutes.js
import express from 'express';
import {
  getAdminDashboard,
  getInstructorDashboard,
  getStudentDashboard,
  getQuickStats,
  getRevenueAnalytics,
} from '../controllers/dashboardController.js';
import { protect }   from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// ✅ All dashboard routes require auth
router.use(protect);

// ✅ Rate limit dashboard calls
router.use(apiLimiter);

// Role-based dashboards
router.get('/admin',
  authorize('admin'),
  getAdminDashboard
);

router.get('/instructor',
  authorize('instructor', 'admin'),
  getInstructorDashboard
);

router.get('/student',
  getStudentDashboard
);

// Admin utilities
router.get('/quick-stats',
  authorize('admin'),
  getQuickStats
);

router.get('/revenue-analytics',
  authorize('admin'),
  getRevenueAnalytics
);

export default router;