import express from 'express';
import {
  getAdminDashboard,
  getInstructorDashboard,
  getStudentDashboard,
  getQuickStats
} from '../controllers/dashboardController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Role-based dashboards
router.get('/admin', authorize('admin'), getAdminDashboard);
router.get('/instructor', authorize('instructor', 'admin'), getInstructorDashboard);
router.get('/student', getStudentDashboard);

// Quick stats for admin
router.get('/quick-stats', authorize('admin'), getQuickStats);

export default router;