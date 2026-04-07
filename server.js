import dotenv from 'dotenv';
dotenv.config();  


import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import connectDB from './config/db.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';

// Route imports
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
import codeRoutes from './routes/courseRoutes.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to database
connectDB();

const app = express();

// CORS configuration - MUST BE FIRST
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'http://localhost:3000', 
    'http://127.0.0.1:5173',
    'https://mr-solver-learn-hub.vercel.app'  // ✅ Add your Vercel URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { message: 'Too many requests, please try again later.' }
});
app.use('/api', limiter);

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));



// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'LearnHub API is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
});

export default app;
