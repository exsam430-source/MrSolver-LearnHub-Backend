import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken } from '../utils/generateToken.js';
import { 
  sendWelcomeEmail, 
  sendPasswordResetEmail
} from '../utils/emailService.js';

// =============================================
// HELPER FUNCTIONS
// =============================================

// Generate random token
const generateRandomToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Hash token
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Standard user response
const createUserResponse = (user, token, isNewUser = false) => ({
  _id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  avatar: user.avatar,
  authProvider: user.authProvider,
  token,
  isNewUser
});

// =============================================
// REGISTER - Local Registration
// =============================================
export const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, phone } = req.body;

  // Validation
  if (!firstName || !lastName || !email || !password) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }

  // Check if user exists
  const userExists = await User.findOne({ email: email.toLowerCase() });
  
  if (userExists) {
    // If user registered with Google
    if (userExists.googleId && userExists.authProvider === 'google') {
      res.status(400);
      throw new Error('This email is registered with Google. Please use Google login.');
    }
    res.status(400);
    throw new Error('User already exists with this email');
  }

  // Create user
  const user = await User.create({
    firstName,
    lastName,
    email: email.toLowerCase(),
    password,
    phone,
    authProvider: 'local',
    isActive: true
  });

  if (user) {
    // Send welcome email
    try {
      await sendWelcomeEmail(user);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      data: createUserResponse(user, token, true)
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

// =============================================
// LOGIN - Local Login
// =============================================
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error('Please provide email and password');
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // Check if user registered with Google
  if (user.googleId && user.authProvider === 'google' && !user.password) {
    res.status(400);
    throw new Error('This account uses Google login. Please sign in with Google.');
  }

  // Check password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  // Check if account is active
  if (!user.isActive) {
    res.status(401);
    throw new Error('Your account has been deactivated. Please contact support.');
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  const token = generateToken(user._id);

  res.json({
    success: true,
    data: createUserResponse(user, token)
  });
});

// =============================================
// GOOGLE AUTH - Login/Register with Google
// =============================================
export const googleAuth = asyncHandler(async (req, res) => {
  const { googleUser, credential } = req.body;

  let email, firstName, lastName, googleId, picture;

  // Handle Google user info (from access token flow)
  if (googleUser) {
    email = googleUser.email;
    googleId = googleUser.sub;
    picture = googleUser.picture;
    
    // Parse name
    const nameParts = (googleUser.name || '').split(' ');
    firstName = googleUser.given_name || nameParts[0] || 'User';
    lastName = googleUser.family_name || nameParts.slice(1).join(' ') || '';
  }
  // Handle ID token (legacy flow)
  else if (credential) {
    try {
      // Decode JWT (Google ID token)
      const base64Url = credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const payload = JSON.parse(jsonPayload);
      
      email = payload.email;
      googleId = payload.sub;
      picture = payload.picture;
      firstName = payload.given_name || payload.name?.split(' ')[0] || 'User';
      lastName = payload.family_name || payload.name?.split(' ').slice(1).join(' ') || '';
    } catch (error) {
      console.error('Token decode error:', error);
      res.status(400);
      throw new Error('Invalid Google token');
    }
  } else {
    res.status(400);
    throw new Error('Google credentials required');
  }

  if (!email || !googleId) {
    res.status(400);
    throw new Error('Could not retrieve Google account information');
  }

  // Check if user exists (by googleId or email)
  let user = await User.findOne({
    $or: [
      { googleId },
      { email: email.toLowerCase() }
    ]
  });

  let isNewUser = false;

  if (user) {
    // Existing user
    
    // If user exists but doesn't have googleId (registered with email first)
    if (!user.googleId) {
      // Link Google account to existing user
      user.googleId = googleId;
      user.authProvider = user.password ? 'local' : 'google';
      if (picture && !user.avatar.includes('uploads')) {
        user.avatar = picture;
      }
      await user.save();
    }

    // Check if account is active
    if (!user.isActive) {
      res.status(401);
      throw new Error('Your account has been deactivated. Please contact support.');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

  } else {
    // New user - Create account
    isNewUser = true;

    user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      googleId,
      authProvider: 'google',
      avatar: picture || 'avatars/default-avatar.png',
      isActive: true
    });

    // Send welcome email
    try {
      await sendWelcomeEmail(user);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }
  }

  const token = generateToken(user._id);

  res.json({
    success: true,
    data: createUserResponse(user, token, isNewUser)
  });
});

// =============================================
// FORGOT PASSWORD
// =============================================
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    res.status(400);
    throw new Error('Please provide your email address');
  }

  const user = await User.findOne({ email: email.toLowerCase() });

  // Always return success message (security best practice)
  if (!user) {
    res.json({
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.'
    });
    return;
  }

  // Check if user uses Google login only
  if (user.authProvider === 'google' && !user.password) {
    res.status(400);
    throw new Error('This account uses Google login. Please sign in with Google.');
  }

  // Generate reset token
  const resetToken = generateRandomToken();
  user.resetPasswordToken = hashToken(resetToken);
  user.resetPasswordExpire = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save({ validateBeforeSave: false });

  // Send reset email
  try {
    await sendPasswordResetEmail(user, resetToken);
    res.json({
      success: true,
      message: 'Password reset link sent to your email.'
    });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });

    console.error('Failed to send password reset email:', error);
    res.status(500);
    throw new Error('Failed to send email. Please try again later.');
  }
});

// =============================================
// RESET PASSWORD
// =============================================
export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    res.status(400);
    throw new Error('Password must be at least 6 characters');
  }

  const hashedToken = hashToken(token);

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired reset link. Please request a new one.');
  }

  // Set new password
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  
  // If user was Google-only, now they can use both
  if (user.authProvider === 'google') {
    user.authProvider = 'local';
  }
  
  await user.save();

  // Generate token for auto-login
  const authToken = generateToken(user._id);

  res.json({
    success: true,
    message: 'Password reset successful! You can now login.',
    data: {
      token: authToken
    }
  });
});

// =============================================
// VALIDATE RESET TOKEN
// =============================================
export const validateResetToken = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const hashedToken = hashToken(token);

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    res.status(400);
    throw new Error('Invalid or expired reset link');
  }

  res.json({
    success: true,
    valid: true,
    email: user.email
  });
});

// =============================================
// GET CURRENT USER
// =============================================
export const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('enrolledCourses', 'title slug thumbnail')
    .populate('wishlist', 'title slug thumbnail price');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  res.json({
    success: true,
    data: user
  });
});

// =============================================
// UPDATE PROFILE
// =============================================
export const updateProfile = asyncHandler(async (req, res) => {
  const {
    firstName,
    lastName,
    phone,
    bio,
    address,
    socialLinks,
    education
  } = req.body;

  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  user.firstName = firstName || user.firstName;
  user.lastName = lastName || user.lastName;
  user.phone = phone || user.phone;
  user.bio = bio || user.bio;
  user.address = address || user.address;
  user.socialLinks = socialLinks || user.socialLinks;
  user.education = education || user.education;

  const updatedUser = await user.save();

  res.json({
    success: true,
    data: updatedUser
  });
});

// =============================================
// UPDATE AVATAR
// =============================================
export const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image');
  }

  const user = await User.findById(req.user._id);
  user.avatar = `avatars/${req.file.filename}`;
  await user.save();

  res.json({
    success: true,
    data: {
      avatar: user.avatar
    }
  });
});

// =============================================
// UPDATE PASSWORD (Logged in user)
// =============================================
export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400);
    throw new Error('New password must be at least 6 characters');
  }

  const user = await User.findById(req.user._id).select('+password');

  // If user has a password, verify current password
  if (user.password) {
    if (!currentPassword) {
      res.status(400);
      throw new Error('Current password is required');
    }
    
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      res.status(401);
      throw new Error('Current password is incorrect');
    }
  }

  user.password = newPassword;
  
  // If user was Google-only, now they can use both
  if (user.authProvider === 'google') {
    user.authProvider = 'local';
  }
  
  await user.save();

  const token = generateToken(user._id);

  res.json({
    success: true,
    message: 'Password updated successfully',
    data: { token }
  });
});

// =============================================
// LOGOUT (Client-side token removal)
// =============================================
export const logout = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// =============================================
// CHECK AUTH STATUS
// =============================================
export const checkAuth = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(401);
    throw new Error('Not authenticated');
  }

  res.json({
    success: true,
    data: {
      isAuthenticated: true,
      user: user.getPublicProfile()
    }
  });
});