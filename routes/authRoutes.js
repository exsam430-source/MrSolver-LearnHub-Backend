import express from 'express';
import {
  register,
  login,
  googleAuth,
  forgotPassword,
  resetPassword,
  validateResetToken,
  getMe,
  updateProfile,
  updateAvatar,
  updatePassword,
  logout,
  checkAuth
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadAvatar, handleMulterError } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// ============ Public Routes ============
// Registration & Login
router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);

// Password Reset
router.post('/forgot-password', forgotPassword);
router.get('/reset-password/:token/validate', validateResetToken);
router.put('/reset-password/:token', resetPassword);

// ============ Protected Routes ============
router.use(protect);

router.get('/me', getMe);
router.get('/check', checkAuth);
router.put('/profile', updateProfile);
router.put('/avatar', uploadAvatar, handleMulterError, updateAvatar);
router.put('/password', updatePassword);
router.post('/logout', logout);

export default router;