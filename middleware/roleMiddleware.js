// middleware/roleMiddleware.js
import { securityLog } from './auditLog.js';

// ✅ Flexible role-based authorization
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401);
      throw new Error('Not authorized - Please log in');
    }

    if (!roles.includes(req.user.role)) {
      // ✅ Log unauthorized access attempts
      securityLog('UNAUTHORIZED_ACCESS', {
        userId: req.user._id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      res.status(403);
      throw new Error('Access denied - Insufficient permissions');
    }

    next();
  };
};

// ✅ Admin check
export const isAdmin = (req, res, next) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized');
  }

  if (req.user.role !== 'admin') {
    securityLog('ADMIN_ACCESS_DENIED', {
      userId: req.user._id,
      role: req.user.role,
      path: req.path,
      ip: req.ip
    });
    res.status(403);
    throw new Error('Admin access required');
  }

  next();
};

// ✅ Instructor or Admin check
export const isInstructorOrAdmin = (req, res, next) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized');
  }

  if (!['instructor', 'admin'].includes(req.user.role)) {
    securityLog('INSTRUCTOR_ACCESS_DENIED', {
      userId: req.user._id,
      role: req.user.role,
      path: req.path,
      ip: req.ip
    });
    res.status(403);
    throw new Error('Instructor or Admin access required');
  }

  next();
};

// ✅ Developer or Admin check
export const isDeveloperOrAdmin = (req, res, next) => {
  if (!req.user) {
    res.status(401);
    throw new Error('Not authorized');
  }

  if (!['developer', 'admin'].includes(req.user.role)) {
    securityLog('DEVELOPER_ACCESS_DENIED', {
      userId: req.user._id,
      role: req.user.role,
      path: req.path,
      ip: req.ip
    });
    res.status(403);
    throw new Error('Developer or Admin access required');
  }

  next();
};

// ✅ Resource ownership check
export const isOwnerOrAdmin = (resourceUserIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401);
      throw new Error('Not authorized');
    }

    const resourceUserId =
      req.params[resourceUserIdField] ||
      req.body[resourceUserIdField];

    // ✅ Admin can access any resource
    if (req.user.role === 'admin') {
      return next();
    }

    // ✅ Check ownership
    if (
      resourceUserId &&
      resourceUserId.toString() !== req.user._id.toString()
    ) {
      securityLog('OWNERSHIP_VIOLATION', {
        userId: req.user._id,
        attemptedResourceId: resourceUserId,
        path: req.path,
        ip: req.ip
      });
      res.status(403);
      throw new Error('Access denied - You can only access your own resources');
    }

    next();
  };
};