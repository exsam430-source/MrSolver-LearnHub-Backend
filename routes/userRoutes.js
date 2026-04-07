import express from 'express';
import {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  getUserStats,
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  getInstructors
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Wishlist routes (must be before /:id routes)
router.get('/wishlist', protect, getWishlist);
router.post('/wishlist/:courseId', protect, addToWishlist);
router.delete('/wishlist/:courseId', protect, removeFromWishlist);

// Admin routes
router.get('/stats', protect, authorize('admin'), getUserStats);
router.get('/', protect, authorize('admin'), getUsers);
router.post('/', protect, authorize('admin'), createUser);
router.get('/instructors', protect, authorize('admin'), getInstructors); 
router.get('/:id', protect, authorize('admin'), getUser);
router.put('/:id', protect, authorize('admin'), updateUser);
router.delete('/:id', protect, authorize('admin'), deleteUser);
router.patch('/:id/toggle-status', protect, authorize('admin'), toggleUserStatus);

export default router;