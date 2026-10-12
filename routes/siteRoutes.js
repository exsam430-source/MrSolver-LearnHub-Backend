// routes/siteRoutes.js
import express from 'express';
import {
  getHomeData,
  getFeaturedCourses,
  getHomeCategories,
} from '../controllers/siteController.js';
import { searchLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// ✅ Public routes with rate limiting
router.get('/home',
  searchLimiter,
  getHomeData
);

router.get('/featured-courses',
  searchLimiter,
  getFeaturedCourses
);

router.get('/categories',
  searchLimiter,
  getHomeCategories
);

export default router;