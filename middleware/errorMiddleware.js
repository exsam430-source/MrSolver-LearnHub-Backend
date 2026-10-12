// middleware/errorMiddleware.js
import { securityLog } from './auditLog.js';

// ✅ 404 Handler
export const notFound = (req, res, next) => {
  // ✅ Don't expose the full URL in error (can leak internal paths)
  const error = new Error(`Route not found`);
  res.status(404);
  next(error);
};

// ✅ Global Error Handler
export const errorHandler = (err, req, res, next) => {
  // ✅ NEVER set CORS headers in error handler
  // CORS is already handled by the cors middleware
  // Setting it here causes conflicts and security issues

  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Something went wrong';

  // ✅ Mongoose bad ObjectId
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Resource not found';
  }

  // ✅ Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
  }

  // ✅ Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  // ✅ JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token expired';
  }

  // ✅ Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    message = 'File size too large';
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    statusCode = 400;
    message = 'Too many files uploaded';
  }

  // ✅ Log server errors (5xx) with security logger
  if (statusCode >= 500) {
    securityLog('SERVER_ERROR', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userId: req.user?._id,
      errorName: err.name,
      // ✅ Only log stack in development
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
  }

  // ✅ In production, never expose server errors to client
  if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
    message = 'Internal server error. Please try again later.';
  }

  res.status(statusCode).json({
    success: false,
    message,
    // ✅ Only include stack in development
    ...(process.env.NODE_ENV !== 'production' && statusCode < 500 && {
      stack: err.stack
    })
  });
};