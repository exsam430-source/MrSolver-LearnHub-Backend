// routes/siteRoutes.js
import express from 'express';
import { 
  getHomeData, 
  getFeaturedCourses, 
  getHomeCategories 
} from '../controllers/siteController.js';

const router = express.Router();

// Public routes - no authentication needed
router.get('/home', getHomeData);
router.get('/featured-courses', getFeaturedCourses);
router.get('/categories', getHomeCategories);

export default router;