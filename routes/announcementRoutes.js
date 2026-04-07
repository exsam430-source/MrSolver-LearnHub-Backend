import express from 'express';
import {
  getAnnouncements,
  getAllAnnouncementsAdmin,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  togglePublish,
  togglePin,
  markAsRead
} from '../controllers/announcementController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getAnnouncements);
router.get('/:id', getAnnouncement);

// Protected routes
router.post('/:id/read', protect, markAsRead);

// Admin routes
router.get('/admin/all', protect, authorize('admin'), getAllAnnouncementsAdmin);
router.post('/', protect, authorize('admin'), createAnnouncement);
router.put('/:id', protect, authorize('admin'), updateAnnouncement);
router.delete('/:id', protect, authorize('admin'), deleteAnnouncement);
router.patch('/:id/publish', protect, authorize('admin'), togglePublish);
router.patch('/:id/pin', protect, authorize('admin'), togglePin);

export default router;