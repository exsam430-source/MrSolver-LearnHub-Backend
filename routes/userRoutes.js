// routes/userRoutes.js
import express from 'express';
import {
  getUsers, getUser, createUser, updateUser,
  deleteUser, toggleUserStatus, getUserStats,
  addToWishlist, removeFromWishlist, getWishlist, getInstructors
} from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createUserSchema,
  updateUserSchema,
} from '../middleware/validate.js';
import { apiLimiter, searchLimiter } from '../middleware/rateLimiter.js';
import { auditLog } from '../middleware/auditLog.js';

const router = express.Router();

// ── Wishlist ──────────────────────────────────
router.get('/wishlist',           protect, getWishlist);
router.post('/wishlist/:courseId', protect, addToWishlist);
router.delete('/wishlist/:courseId', protect, removeFromWishlist);

// ── Admin Stats ───────────────────────────────
router.get('/stats',
  protect,
  authorize('admin'),
  auditLog('ADMIN_VIEW_STATS'),
  getUserStats
);

// ── Admin List Users ──────────────────────────
router.get('/',
  protect,
  authorize('admin'),
  searchLimiter,
  auditLog('ADMIN_LIST_USERS'),
  getUsers
);

// ── Admin Create User ─────────────────────────
router.post('/',
  protect,
  authorize('admin'),
  // ✅ Debug middleware — remove after fix confirmed
  (req, res, next) => {
    console.log('📥 CREATE USER - body:', JSON.stringify(req.body));
    console.log('📥 role value:', req.body.role);
    console.log('📥 role type:', typeof req.body.role);
    next();
  },
  validate(createUserSchema),
  auditLog('ADMIN_CREATE_USER'),
  createUser
);

// ── Admin Instructors List ────────────────────
router.get('/instructors',
  protect,
  authorize('admin'),
  getInstructors
);

// ── Admin Single User ─────────────────────────
router.get('/:id',
  protect,
  authorize('admin'),
  auditLog('ADMIN_VIEW_USER'),
  getUser
);

router.put('/:id',
  protect,
  authorize('admin'),
  validate(updateUserSchema),
  auditLog('ADMIN_UPDATE_USER'),
  updateUser
);

router.delete('/:id',
  protect,
  authorize('admin'),
  auditLog('ADMIN_DELETE_USER'),
  deleteUser
);

router.patch('/:id/toggle-status',
  protect,
  authorize('admin'),
  auditLog('ADMIN_TOGGLE_USER_STATUS'),
  toggleUserStatus
);

export default router;