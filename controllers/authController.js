// controllers/authController.js
import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import User from '../models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
  clearTokenCookies
} from '../utils/generateToken.js';
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendEmailVerificationEmail
} from '../utils/emailService.js';
import { getFullImageUrl } from '../utils/imageHelper.js';
import { securityLog } from '../middleware/auditLog.js';

// =============================================
// HELPERS
// =============================================

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

const generateRandomToken = () =>
  crypto.randomBytes(32).toString('hex');

// ✅ Minimal user response — only what UI needs
const createUserResponse = (user) => {
  const userData = user.toObject ? user.toObject() : user;
  return {
    id: userData._id,
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email,
    role: userData.role,
    avatar: getFullImageUrl(userData.avatar),
    isEmailVerified: userData.isEmailVerified,
  };
};

// ✅ Don't send accessToken in response body anymore — it's in HttpOnly cookie
const sendAuthResponse = async (res, user, statusCode = 200, isNewUser = false) => {
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  user.lastLoginIp = res.req?.ip;
  await user.save({ validateBeforeSave: false });

  setTokenCookies(res, accessToken, refreshToken);

  res.status(statusCode).json({
    success: true,
    data: {
      user: createUserResponse(user),
      isNewUser,
    },
  });
};

// ✅ Fire and forget email helper
const sendEmailAsync = (emailFn, ...args) => {
  setImmediate(async () => {
    try {
      await emailFn(...args);
    } catch (err) {
      console.error(`📧 Background email failed: ${err.message}`);
    }
  });
};

// =============================================
// REGISTER
// =============================================
export const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, phone, termsAccepted } = req.body;

  if (!termsAccepted) {
    res.status(400);
    throw new Error('You must accept the Terms of Service and Privacy Policy');
  }

  const userExists = await User.findOne({ email: email.toLowerCase() });

  if (userExists) {
    if (userExists.authProvider === 'google' && !userExists.password) {
      res.status(400);
      throw new Error('This email is registered with Google. Please use Google Sign In.');
    }

    if (!userExists.isEmailVerified) {
      const verificationToken = generateRandomToken();
      userExists.emailVerificationToken = hashToken(verificationToken);
      userExists.emailVerificationExpire = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await userExists.save({ validateBeforeSave: false });

      res.status(200).json({
        success: true,
        message: 'Account already exists but email is not verified. We have resent the verification link.',
        data: {
          email: userExists.email,
          requiresVerification: true,
          alreadyExists: true
        }
      });

      sendEmailAsync(sendEmailVerificationEmail, userExists, verificationToken);
      return;
    }

    res.status(400);
    throw new Error('An account with this email already exists. Please sign in.');
  }

  const verificationToken = generateRandomToken();
  const hashedVerificationToken = hashToken(verificationToken);

  const user = await User.create({
    firstName,
    lastName,
    email: email.toLowerCase(),
    password,
    phone: phone || undefined,
    authProvider: 'local',
    isActive: true,
    isEmailVerified: false,
    emailVerificationToken: hashedVerificationToken,
    emailVerificationExpire: new Date(Date.now() + 24 * 60 * 60 * 1000),
    termsAcceptedAt: new Date(),
    termsVersion: '1.0'
  });

  if (!user) {
    res.status(400);
    throw new Error('Failed to create account. Please try again.');
  }

  securityLog('USER_REGISTERED', {
    userId: user._id,
    email: user.email,
    ip: req.ip,
    authProvider: 'local'
  });

  res.status(201).json({
    success: true,
    message: 'Account created successfully! Please check your email to verify your account.',
    data: {
      email: user.email,
      requiresVerification: true
    }
  });

  sendEmailAsync(sendEmailVerificationEmail, user, verificationToken);
  sendEmailAsync(sendWelcomeEmail, user);
});

// =============================================
// LOGIN
// =============================================
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+password +loginAttempts +lockUntil +passwordChangedAt +refreshToken');

  if (user?.lockUntil && user.lockUntil > Date.now()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    securityLog('LOGIN_ACCOUNT_LOCKED', { email: email.toLowerCase(), ip: req.ip });
    res.status(423);
    throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
  }

  if (!user) {
    securityLog('LOGIN_INVALID_EMAIL', { email: email.toLowerCase(), ip: req.ip });
    res.status(401);
    throw new Error('Invalid email or password');
  }

  if (user.authProvider === 'google' && !user.password) {
    res.status(400);
    throw new Error('This account uses Google Sign In. Please use the Google button.');
  }

  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    await user.incrementLoginAttempts();
    const attemptsLeft = Math.max(0, 5 - (user.loginAttempts + 1));

    securityLog('LOGIN_FAILED_PASSWORD', {
      userId: user._id,
      ip: req.ip,
      attemptsLeft
    });

    if (attemptsLeft === 0) {
      res.status(423);
      throw new Error('Too many failed attempts. Account locked for 30 minutes.');
    }

    res.status(401);
    throw new Error(
      `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`
    );
  }

  if (!user.isActive) {
    res.status(401);
    throw new Error('Your account has been deactivated. Please contact support.');
  }

  await user.resetLoginAttempts();

  securityLog('LOGIN_SUCCESS', { userId: user._id, ip: req.ip });

  await sendAuthResponse(res, user, 200, false);
});

// =============================================
// GOOGLE AUTH
// =============================================
export const googleAuth = asyncHandler(async (req, res) => {
  const { googleUser } = req.body;

  if (!googleUser) {
    res.status(400);
    throw new Error('Google user data is required');
  }

  const {
    email,
    sub: googleId,
    picture,
    given_name,
    family_name,
    name,
    email_verified
  } = googleUser;

  if (!email || !googleId) {
    res.status(400);
    throw new Error('Invalid Google account data');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400);
    throw new Error('Invalid email from Google account');
  }

  if (email_verified === false) {
    res.status(400);
    throw new Error('Google account email is not verified');
  }

  const firstName = (given_name || name?.split(' ')[0] || 'User')
    .trim().substring(0, 50).replace(/[^a-zA-Z\s'-]/g, '');

  const lastName = (family_name || name?.split(' ').slice(1).join(' ') || '')
    .trim().substring(0, 50).replace(/[^a-zA-Z\s'-]/g, '');

  const avatarUrl = picture?.startsWith('http') ? picture : null;

  let user = await User.findOne({
    $or: [{ googleId }, { email: email.toLowerCase() }]
  }).select('+refreshToken +loginAttempts +lockUntil');

  let isNewUser = false;

  if (user) {
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      res.status(423);
      throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
    }

    if (!user.isActive) {
      res.status(401);
      throw new Error('Your account has been deactivated. Please contact support.');
    }

    if (!user.googleId) user.googleId = googleId;
    if (avatarUrl && user.avatar === 'avatars/default-avatar.png') {
      user.avatar = avatarUrl;
    }
    if (!user.isEmailVerified) user.isEmailVerified = true;

    await user.save({ validateBeforeSave: false });

    securityLog('GOOGLE_LOGIN_SUCCESS', { userId: user._id, ip: req.ip });

  } else {
    isNewUser = true;

    user = await User.create({
      firstName: firstName || 'User',
      lastName: lastName || '',
      email: email.toLowerCase(),
      googleId,
      authProvider: 'google',
      avatar: avatarUrl || 'avatars/default-avatar.png',
      isActive: true,
      isEmailVerified: true,
      termsAcceptedAt: new Date(),
      termsVersion: '1.0'
    });

    securityLog('GOOGLE_REGISTER_SUCCESS', { userId: user._id, ip: req.ip });

    sendEmailAsync(sendWelcomeEmail, user);
  }

  await sendAuthResponse(res, user, isNewUser ? 201 : 200, isNewUser);
});

// =============================================
// REFRESH TOKEN
// =============================================
export const refreshToken = asyncHandler(async (req, res) => {
  const user = req.user;

  const newAccessToken = generateAccessToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);

  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  setTokenCookies(res, newAccessToken, newRefreshToken);

  res.json({
    success: true,
    data: { accessToken: newAccessToken }
  });
});

// =============================================
// VERIFY EMAIL
// =============================================
export const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    res.status(400);
    throw new Error('Verification token is required');
  }

  const hashedToken = hashToken(token);

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpire: { $gt: Date.now() }
  }).select('+emailVerificationToken +emailVerificationExpire +refreshToken');

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired verification link. Please request a new one.');
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save({ validateBeforeSave: false });

  securityLog('EMAIL_VERIFIED', { userId: user._id, ip: req.ip });

  await sendAuthResponse(res, user, 200, false);
});

// =============================================
// RESEND VERIFICATION
// =============================================
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error('Email is required');
  }

  const genericMessage = 'If an account exists, a verification link has been sent.';

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+emailVerificationToken +emailVerificationExpire');

  if (!user) {
    return res.json({ success: true, message: genericMessage });
  }

  if (user.isEmailVerified) {
    return res.json({
      success: true,
      message: 'Email is already verified. Please sign in.'
    });
  }

  const verificationToken = generateRandomToken();
  user.emailVerificationToken = hashToken(verificationToken);
  user.emailVerificationExpire = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  res.json({ success: true, message: genericMessage });

  sendEmailAsync(sendEmailVerificationEmail, user, verificationToken);
});

// =============================================
// FORGOT PASSWORD
// =============================================
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const genericMessage = 'If an account exists with this email, you will receive a password reset link.';

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+resetPasswordToken +resetPasswordExpire');

  if (!user) {
    return res.json({ success: true, message: genericMessage });
  }

  if (user.authProvider === 'google' && !user.password) {
    return res.json({ success: true, message: genericMessage });
  }

  const resetToken = generateRandomToken();
  user.resetPasswordToken = hashToken(resetToken);
  user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  securityLog('PASSWORD_RESET_REQUESTED', { userId: user._id, ip: req.ip });

  res.json({ success: true, message: genericMessage });

  sendEmailAsync(sendPasswordResetEmail, user, resetToken);
});

// =============================================
// VALIDATE RESET TOKEN
// =============================================
export const validateResetToken = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    res.status(400);
    throw new Error('Reset token is required');
  }

  const hashedToken = hashToken(token);

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  }).select('email');

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired reset link. Please request a new one.');
  }

  res.json({
    success: true,
    valid: true,
    email: user.email.replace(/(.{2}).+(@.+)/, '$1***$2')
  });
});

// =============================================
// RESET PASSWORD
// =============================================
export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const hashedToken = hashToken(token);

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  }).select('+password +refreshToken +resetPasswordToken +resetPasswordExpire');

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired reset link. Please request a new one.');
  }

  if (user.password) {
    const isSame = await user.comparePassword(password);
    if (isSame) {
      res.status(400);
      throw new Error('New password must be different from your current password');
    }
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  user.refreshToken = undefined;

  await user.save();

  securityLog('PASSWORD_RESET_SUCCESS', { userId: user._id, ip: req.ip });

  res.json({
    success: true,
    message: 'Password reset successful! Please sign in with your new password.'
  });
});

// =============================================
// GET ME
// =============================================
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('enrolledCourses', 'title slug thumbnail')
    .populate('wishlist', 'title slug thumbnail price');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const userData = user.toObject();

  res.json({
    success: true,
    data: {
      ...createUserResponse(user),
      phone: userData.phone,
      bio: userData.bio,
      address: userData.address,
      socialLinks: userData.socialLinks,
      education: userData.education,
      enrolledCourses: userData.enrolledCourses?.map(c => ({
        ...c,
        thumbnail: getFullImageUrl(c.thumbnail)
      })),
      wishlist: userData.wishlist?.map(c => ({
        ...c,
        thumbnail: getFullImageUrl(c.thumbnail)
      })),
      lastLogin: userData.lastLogin,
      createdAt: userData.createdAt
    }
  });
});

// =============================================
// UPDATE PROFILE
// =============================================
export const updateProfile = asyncHandler(async (req, res) => {
  const {
    firstName, lastName, phone,
    bio, address, socialLinks, education
  } = req.body;

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (phone !== undefined) user.phone = phone;
  if (bio !== undefined) user.bio = bio;
  if (address !== undefined) user.address = { ...user.address, ...address };
  if (socialLinks !== undefined) user.socialLinks = { ...user.socialLinks, ...socialLinks };
  if (education !== undefined) user.education = education;

  const updated = await user.save();

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: createUserResponse(updated)
  });
});

// =============================================
// UPDATE AVATAR
// =============================================
export const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image file');
  }

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  user.avatar = `avatars/${req.file.filename}`;
  await user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: 'Avatar updated successfully',
    data: { avatar: getFullImageUrl(user.avatar) }
  });
});

// =============================================
// UPDATE PASSWORD
// =============================================
export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id)
    .select('+password +refreshToken');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user.password) {
    if (!currentPassword) {
      res.status(400);
      throw new Error('Current password is required');
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      securityLog('PASSWORD_UPDATE_WRONG_CURRENT', {
        userId: user._id, ip: req.ip
      });
      res.status(401);
      throw new Error('Current password is incorrect');
    }

    const isSame = await user.comparePassword(newPassword);
    if (isSame) {
      res.status(400);
      throw new Error('New password must be different from current password');
    }
  }

  user.password = newPassword;
  if (user.authProvider === 'google') user.authProvider = 'local';
  user.refreshToken = undefined;

  await user.save();

  securityLog('PASSWORD_UPDATED', { userId: user._id, ip: req.ip });

  clearTokenCookies(res);

  res.json({
    success: true,
    message: 'Password updated successfully. Please sign in again.'
  });
});

// =============================================
// LOGOUT
// =============================================
export const logout = asyncHandler(async (req, res) => {
  if (req.user) {
    await User.findByIdAndUpdate(
      req.user._id,
      { $unset: { refreshToken: 1 } },
      { validateBeforeSave: false }
    );
    securityLog('LOGOUT', { userId: req.user._id, ip: req.ip });
  }

  clearTokenCookies(res);

  res.json({ success: true, message: 'Logged out successfully' });
});

// =============================================
// CHECK AUTH
// =============================================
export const checkAuth = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user || !user.isActive) {
    res.status(401);
    throw new Error('Not authenticated');
  }

  res.json({
    success: true,
    data: {
      isAuthenticated: true,
      user: createUserResponse(user)
    }
  });
});