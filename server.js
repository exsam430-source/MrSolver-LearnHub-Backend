// server.js - FIXED for Express 5 + Hostinger
// ✅ Services & Projects routes registered
import './config/env.js';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { apiLimiter } from './middleware/rateLimiter.js';

console.log('🔍 ENV CHECK:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI ? '✅ set' : '❌ MISSING',
  JWT_SECRET: process.env.JWT_SECRET ? '✅ set' : '❌ MISSING',
  FRONTEND_URL: process.env.FRONTEND_URL,
});

const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required env vars: ${missingVars.join(', ')}`);
  process.exit(1);
}

// =============================================
// ROUTE IMPORTS
// =============================================
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import lectureRoutes from './routes/lectureRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import progressRoutes from './routes/progressRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import siteRoutes from './routes/siteRoutes.js';
import certificateRoutes from './routes/certificateRoutes.js';
import codeRoutes from './routes/codeRoutes.js';

// ✅ NEW: Services & Projects routes
import serviceRoutes from './routes/serviceRoutes.js';
import projectRoutes from './routes/projectRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

connectDB();

const app = express();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

// =============================================
// CORS
// =============================================
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://mrsolverlearninghub.com',
  'https://www.mrsolverlearninghub.com',
  'https://mistyrose-cat-644040.hostingersite.com',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      if (origin.endsWith('.hostingersite.com')) return callback(null, true);

      console.warn(`⚠️ CORS blocked: ${origin}`);
      return callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Request-Id'],
  })
);

// =============================================
// SECURITY & MIDDLEWARE
// =============================================
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: false,
    hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  })
);

app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB Key Sanitizer
app.use((req, res, next) => {
  const sanitizeKeys = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map((item) => sanitizeKeys(item));
    const cleaned = {};
    for (const key of Object.keys(obj)) {
      const safeKey = key.startsWith('$') ? `_${key.slice(1)}` : key;
      const value = obj[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        cleaned[safeKey] = sanitizeKeys(value);
      } else if (Array.isArray(value)) {
        cleaned[safeKey] = value.map((item) => sanitizeKeys(item));
      } else {
        cleaned[safeKey] = value;
      }
    }
    return cleaned;
  };
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeKeys(req.body);
  }
  next();
});

// Logger
if (!isProduction) {
  app.use(morgan('dev'));
} else {
  app.use(morgan(':method :url :status :response-time ms'));
}

// Request ID
app.use((req, res, next) => {
  req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// Rate Limiter
app.use('/api', apiLimiter);

// =============================================
// STATIC UPLOADS
// =============================================
app.use('/uploads/avatars', express.static(path.join(__dirname, 'uploads', 'avatars')));
app.use('/uploads/thumbnails', express.static(path.join(__dirname, 'uploads', 'thumbnails')));
app.use('/uploads/certificates', express.static(path.join(__dirname, 'uploads', 'certificates')));
app.use('/uploads/payments', express.static(path.join(__dirname, 'uploads', 'payments')));
app.use('/uploads/lectures', express.static(path.join(__dirname, 'uploads', 'lectures')));
app.use('/uploads/resources', express.static(path.join(__dirname, 'uploads', 'resources')));

// ✅ NEW: Services & Projects static uploads
app.use('/uploads/services', express.static(path.join(__dirname, 'uploads', 'services')));
app.use('/uploads/projects', express.static(path.join(__dirname, 'uploads', 'projects')));

// =============================================
// HEALTH CHECK
// =============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    port: PORT,
    message: 'Backend running successfully!',
    features: {
      auth: '✅',
      courses: '✅',
      services: '✅',
      projects: '✅',
      payments: '✅',
    },
  });
});

// =============================================
// API ROUTES
// =============================================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/lectures', lectureRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/site', siteRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/code', codeRoutes);

// ✅ NEW: Services & Projects routes
app.use('/api/services', serviceRoutes);
app.use('/api/projects', projectRoutes);

// =============================================
// ✅ SERVE REACT FRONTEND (PRODUCTION)
// Express 5 compatible - uses middleware
// =============================================
if (isProduction) {
  const frontendDistPath = path.join(__dirname, 'dist');

  app.use(express.static(frontendDistPath));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
      if (err) {
        console.error('Error serving index.html:', err.message);
        next(err);
      }
    });
  });

  console.log('📦 Serving frontend from:', frontendDistPath);
}

// =============================================
// ERROR HANDLERS
// =============================================
app.use(notFound);
app.use(errorHandler);

// =============================================
// START SERVER
// =============================================
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV}`);
  console.log(`✨ New features: Services & Portfolio routes registered`);
});

process.on('unhandledRejection', (err) => {
  console.error(`❌ Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error(`❌ Uncaught Exception: ${err.message}`);
  process.exit(1);
});

export default app;