// utils/generateToken.js
import jwt from 'jsonwebtoken';

// ✅ Access token: 15 minutes (short-lived for security)
export const generateAccessToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '15m',
    }
  );
};

// ✅ Refresh token: 30 days (long-lived, in HttpOnly cookie)
export const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
    }
  );
};

// ✅ Cookie config — CRITICAL for cross-domain HTTPS
const getCookieOptions = (maxAge) => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,                         // HTTPS only in prod
    sameSite: isProduction ? 'none' : 'lax',      // 'none' for cross-domain prod
    maxAge,
    path: '/',
  };
};

// ✅ Set secure HttpOnly cookies
export const setTokenCookies = (res, accessToken, refreshToken) => {
  // Access token: 15 minutes
  res.cookie('accessToken', accessToken, getCookieOptions(15 * 60 * 1000));
  // Refresh token: 30 days
  res.cookie('refreshToken', refreshToken, getCookieOptions(30 * 24 * 60 * 60 * 1000));
};

// ✅ Clear auth cookies on logout
export const clearTokenCookies = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };
  res.clearCookie('accessToken', options);
  res.clearCookie('refreshToken', options);
};

// ✅ Verify token helper
export const verifyToken = (token, secret) => {
  return jwt.verify(token, secret);
};

// ✅ Backward compatibility
export const generateToken = generateAccessToken;