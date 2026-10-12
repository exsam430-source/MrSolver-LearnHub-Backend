// middleware/auditLog.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Create logs directory if not exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ✅ Write log to file safely
const writeLog = (logEntry) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `audit-${today}.log`);
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (err) {
    // Silent fail - never crash the app because of logging
  }
};

// ✅ Mask sensitive data before logging
const maskSensitiveData = (data) => {
  if (!data) return data;
  const masked = { ...data };
  const sensitiveFields = ['password', 'token', 'secret', 'creditCard', 'cvv'];
  sensitiveFields.forEach((field) => {
    if (masked[field]) masked[field] = '***MASKED***';
  });
  return masked;
};

// ✅ Main audit log middleware
export const auditLog = (action) => {
  return (req, res, next) => {
    const startTime = Date.now();

    // ✅ Capture response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const duration = Date.now() - startTime;

      const logEntry = {
        timestamp: new Date().toISOString(),
        action,
        method: req.method,
        path: req.path,
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent']?.substring(0, 100),
        userId: req.user?._id || 'anonymous',
        userRole: req.user?.role || 'anonymous',
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        success: body?.success || false,
        // ✅ Only log body in non-production (and masked)
        ...(process.env.NODE_ENV !== 'production' && {
          requestBody: maskSensitiveData(req.body)
        })
      };

      writeLog(logEntry);

      return originalJson(body);
    };

    next();
  };
};

// ✅ Security event logger (always logs, even in production)
export const securityLog = (event, details = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'SECURITY_EVENT',
    event,
    ...maskSensitiveData(details)
  };

  writeLog(logEntry);

  // Also log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.warn('🔒 Security Event:', logEntry);
  }
};