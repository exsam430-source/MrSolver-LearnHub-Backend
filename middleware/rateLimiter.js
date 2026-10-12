// middleware/rateLimiter.js
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// ✅ ADD export HERE - was missing!
export const createLimiter = (windowMinutes, max, message) => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    message: {
      success: false,
      message,
      retryAfter: `${windowMinutes} minutes`
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,

    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req);
      const userAgent = req.headers['user-agent']?.substring(0, 50) || 'unknown';
      return `${ip}-${userAgent}`;
    },

    handler: (req, res, next, options) => {
      console.warn(`⚠️ Rate limit exceeded: Path=${req.path}`);
      res.status(429).json(options.message);
    }
  });
};

// ✅ Very strict - login/register (5 attempts per 15 min)
export const authLimiter = createLimiter(
  15,
  5,
  'Too many attempts. Please try again after 15 minutes.'
);

// ✅ Strict - forgot password (3 per hour)
export const forgotPasswordLimiter = createLimiter(
  60,
  3,
  'Too many password reset requests. Please try again after 1 hour.'
);

// ✅ Moderate - general API (100 per 15 min)
export const apiLimiter = createLimiter(
  15,
  100,
  'Too many requests. Please slow down.'
);

// ✅ Strict - OTP/verification (5 per hour)
export const verificationLimiter = createLimiter(
  60,
  5,
  'Too many verification attempts. Please try again after 1 hour.'
);

// ✅ Upload limiter (10 per hour)
export const uploadLimiter = createLimiter(
  60,
  10,
  'Too many upload requests. Please try again after 1 hour.'
);

// ✅ Search limiter (30 per minute)
export const searchLimiter = createLimiter(
  1,
  30,
  'Too many search requests. Please slow down.'
);

// ✅ ADD THIS - Code execution limiter (10 per minute)
export const codeExecutionLimiter = createLimiter(
  1,
  10,
  'Too many code executions. Please wait a minute.'
);