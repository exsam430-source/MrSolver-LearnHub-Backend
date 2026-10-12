// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import { securityLog } from './auditLog.js';

// ✅ Helper to extract token from request
const extractToken = (req) => {
  // ✅ Check HttpOnly cookie first (more secure)
  if (req.cookies?.accessToken) {
    return { token: req.cookies.accessToken, source: 'cookie' };
  }

  // ✅ Fall back to Authorization header (for mobile/API clients)
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return {
      token: req.headers.authorization.split(' ')[1],
      source: 'header'
    };
  }

  return { token: null, source: null };
};

// ✅ Main protect middleware
export const protect = asyncHandler(async (req, res, next) => {
  const { token, source } = extractToken(req);

  if (!token) {
    res.status(401);
    throw new Error('Not authorized - No token provided');
  }

  try {
    // ✅ Verify with ACCESS token secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Fetch fresh user from DB (don't trust token payload alone)
    const user = await User.findById(decoded.id)
      .select('-password -resetPasswordToken -resetPasswordExpire -refreshToken');

    if (!user) {
      securityLog('AUTH_USER_NOT_FOUND', { userId: decoded.id, ip: req.ip });
      res.status(401);
      throw new Error('Not authorized - User not found');
    }

    // ✅ Check if account is active
    if (!user.isActive) {
      securityLog('AUTH_INACTIVE_ACCOUNT', {
        userId: user._id,
        email: user.email,
        ip: req.ip
      });
      res.status(401);
      throw new Error('Account has been deactivated. Please contact support.');
    }

    // ✅ Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      res.status(423);
      throw new Error(`Account is temporarily locked. Try again in ${minutesLeft} minutes.`);
    }

    // ✅ Check if password was changed after token was issued
    if (user.passwordChangedAt) {
      const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
      if (decoded.iat < changedTimestamp) {
        securityLog('AUTH_TOKEN_STALE', { userId: user._id, ip: req.ip });
        res.status(401);
        throw new Error('Password was recently changed. Please log in again.');
      }
    }

    req.user = user;
    req.tokenSource = source;
    next();

  } catch (error) {
    // ✅ Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      res.status(401);
      throw new Error('Token expired - Please log in again');
    }

    if (error.name === 'JsonWebTokenError') {
      securityLog('AUTH_INVALID_TOKEN', { ip: req.ip, path: req.path });
      res.status(401);
      throw new Error('Invalid token - Please log in again');
    }

    // Re-throw other errors
    if (!res.headersSent) {
      throw error;
    }
  }
});

// ✅ Optional auth - doesn't fail if no token
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const { token } = extractToken(req);

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id)
      .select('-password -resetPasswordToken -resetPasswordExpire -refreshToken');

    if (user && user.isActive) {
      req.user = user;
    }
  } catch (error) {
    // Silent fail for optional auth
  }

  next();
});

// ✅ Refresh token middleware
export const refreshTokenMiddleware = asyncHandler(async (req, res, next) => {
  // ✅ Get refresh token from HttpOnly cookie
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    res.status(401);
    throw new Error('No refresh token provided');
  }

  try {
    // ✅ Verify with REFRESH token secret (different from access)
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await User.findById(decoded.id)
      .select('-password -resetPasswordToken -resetPasswordExpire');

    if (!user) {
      res.status(401);
      throw new Error('User not found');
    }

    if (!user.isActive) {
      res.status(401);
      throw new Error('Account deactivated');
    }

    // ✅ Check stored refresh token matches
    if (user.refreshToken !== refreshToken) {
      securityLog('REFRESH_TOKEN_REUSE', {
        userId: user._id,
        ip: req.ip
      });
      // ✅ Possible token theft - invalidate all tokens
      user.refreshToken = null;
      await user.save({ validateBeforeSave: false });
      res.status(401);
      throw new Error('Invalid refresh token - Please log in again');
    }

    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      res.status(401);
      throw new Error('Refresh token expired - Please log in again');
    }
    if (error.name === 'JsonWebTokenError') {
      res.status(401);
      throw new Error('Invalid refresh token');
    }
    throw error;
  }
});