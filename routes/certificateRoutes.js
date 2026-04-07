// routes/certificateRoutes.js
import express from 'express';
import {
  uploadCertificateTemplate,
  updateCertificateSettings,
  issueCertificate,
  issueCertificatesBulk,
  getInstructorCertificates,
  getMyCertificates,
  getCertificate,
  downloadCertificate,
  verifyCertificate,
  revokeCertificate,
  reissueCertificate,
  getCourseCertificateStats,
  getEligibleStudents
} from '../controllers/certificateController.js';

import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';
import { uploadCertificate, handleMulterError } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================
router.get('/verify/:code', verifyCertificate);

// ============================================
// PROTECTED ROUTES (All routes below require authentication)
// ============================================
router.use(protect);

// Student routes
router.get('/my-certificates', getMyCertificates);
router.get('/:id/download', downloadCertificate);

// Instructor routes
router.get('/instructor', authorize('instructor', 'admin'), getInstructorCertificates);
router.post('/issue', authorize('instructor', 'admin'), issueCertificate);
router.post('/issue-bulk', authorize('instructor', 'admin'), issueCertificatesBulk);

// Course-specific routes
router.put(
  '/course/:courseId/template',
  authorize('instructor', 'admin'),
  uploadCertificate,
  handleMulterError,
  uploadCertificateTemplate
);
router.put('/course/:courseId/settings', authorize('instructor', 'admin'), updateCertificateSettings);
router.get('/course/:courseId/stats', authorize('instructor', 'admin'), getCourseCertificateStats);
router.get('/course/:courseId/eligible', authorize('instructor', 'admin'), getEligibleStudents);

// Single certificate management
router.get('/:id', getCertificate);
router.put('/:id/revoke', authorize('instructor', 'admin'), revokeCertificate);
router.post('/:id/reissue', authorize('instructor', 'admin'), reissueCertificate);

export default router;