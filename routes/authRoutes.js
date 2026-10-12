// routes/authRoutes.js
import express from 'express';
import {
  register,
  login,
  googleAuth,
  logout,
  getMe,
  updateProfile,
  updateAvatar,
  updatePassword,
  forgotPassword,
  resetPassword,
  validateResetToken,
  checkAuth,
  verifyEmail,
  resendVerification,
  refreshToken
} from '../controllers/authController.js';

import { protect, refreshTokenMiddleware } from '../middleware/authMiddleware.js';
import { uploadAvatar, handleMulterError } from '../middleware/uploadMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  updatePasswordSchema
} from '../middleware/validate.js';
import {
  authLimiter,
  forgotPasswordLimiter,
  verificationLimiter,
  uploadLimiter
} from '../middleware/rateLimiter.js';
import { auditLog } from '../middleware/auditLog.js';

const router = express.Router();

// =============================================
// PUBLIC ROUTES
// =============================================

// ✅ Register - rate limited + validated + audited
router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  auditLog('USER_REGISTER'),
  register
);

// ✅ Login - rate limited + validated + audited
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  auditLog('USER_LOGIN'),
  login
);

// ✅ Google OAuth
router.post(
  '/google',
  authLimiter,
  auditLog('GOOGLE_AUTH'),
  googleAuth
);

// ✅ Refresh Token (uses HttpOnly cookie)
router.post(
  '/refresh',
  refreshTokenMiddleware,
  refreshToken
);

// ✅ Email Verification
router.get(
  '/verify-email/:token',
  verificationLimiter,
  auditLog('EMAIL_VERIFY'),
  verifyEmail
);

// ✅ Resend Verification
router.post(
  '/resend-verification',
  verificationLimiter,
  resendVerification
);

// ✅ Forgot Password - strictly rate limited
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  auditLog('FORGOT_PASSWORD'),
  forgotPassword
);

// ✅ Validate Reset Token
router.get(
  '/reset-password/:token/validate',
  verificationLimiter,
  validateResetToken
);

// ✅ Reset Password
router.put(
  '/reset-password/:token',
  authLimiter,
  validate(resetPasswordSchema),
  auditLog('RESET_PASSWORD'),
  resetPassword
);

// =============================================
// PROTECTED ROUTES
// =============================================

// ✅ Get current user
router.get('/me', protect, getMe);

// ✅ Check auth status
router.get('/check', protect, checkAuth);

// ✅ Update profile
router.put(
  '/profile',
  protect,
  validate(updateProfileSchema),
  auditLog('UPDATE_PROFILE'),
  updateProfile
);

// ✅ Update avatar
router.put(
  '/avatar',
  protect,
  uploadLimiter,
  uploadAvatar,
  handleMulterError,
  auditLog('UPDATE_AVATAR'),
  updateAvatar
);

// ✅ Update password
router.put(
  '/password',
  protect,
  authLimiter,
  validate(updatePasswordSchema),
  auditLog('UPDATE_PASSWORD'),
  updatePassword
);

// ✅ Logout
router.post(
  '/logout',
  protect,
  auditLog('USER_LOGOUT'),
  logout
);

export default router;