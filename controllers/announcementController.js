import asyncHandler from 'express-async-handler';
import Announcement from '../models/Announcement.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';

// @desc    Get all announcements (Public)
// @route   GET /api/announcements
// @access  Public
export const getAnnouncements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { type } = req.query;

  const query = {
    isPublished: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  };

  if (type && type !== 'all') {
    query.type = type;
  }

  const total = await Announcement.countDocuments(query);
  const announcements = await Announcement.find(query)
    .populate('author', 'firstName lastName avatar')
    .sort({ isPinned: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: announcements,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc    Get all announcements (Admin)
// @route   GET /api/announcements/admin/all
// @access  Private/Admin
export const getAllAnnouncementsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { type, status } = req.query;

  const query = {};

  if (type && type !== 'all') {
    query.type = type;
  }

  if (status === 'published') {
    query.isPublished = true;
  } else if (status === 'draft') {
    query.isPublished = false;
  }

  const total = await Announcement.countDocuments(query);
  const announcements = await Announcement.find(query)
    .populate('author', 'firstName lastName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: announcements,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc    Get single announcement
// @route   GET /api/announcements/:id
// @access  Public
export const getAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id)
    .populate('author', 'firstName lastName avatar')
    .populate('course', 'title slug');

  if (!announcement) {
    res.status(404);
    throw new Error('Announcement not found');
  }

  // Increment view count
  announcement.viewCount += 1;
  await announcement.save();

  res.json({
    success: true,
    data: announcement
  });
});

// @desc    Create announcement
// @route   POST /api/announcements
// @access  Private/Admin
export const createAnnouncement = asyncHandler(async (req, res) => {
  const {
    title,
    content,
    type,
    priority,
    targetAudience,
    course,
    expiresAt,
    isPinned,
    isPublished
  } = req.body;

  const announcement = await Announcement.create({
    title,
    content,
    type,
    priority,
    targetAudience,
    course,
    author: req.user._id,
    expiresAt,
    isPinned,
    isPublished,
    publishedAt: isPublished ? new Date() : null
  });

  res.status(201).json({
    success: true,
    data: announcement
  });
});

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private/Admin
export const updateAnnouncement = asyncHandler(async (req, res) => {
  let announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    res.status(404);
    throw new Error('Announcement not found');
  }

  // If publishing for the first time
  if (req.body.isPublished && !announcement.isPublished) {
    req.body.publishedAt = new Date();
  }

  announcement = await Announcement.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    data: announcement
  });
});

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private/Admin
export const deleteAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    res.status(404);
    throw new Error('Announcement not found');
  }

  await announcement.deleteOne();

  res.json({
    success: true,
    message: 'Announcement deleted successfully'
  });
});

// @desc    Toggle announcement publish status
// @route   PATCH /api/announcements/:id/publish
// @access  Private/Admin
export const togglePublish = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    res.status(404);
    throw new Error('Announcement not found');
  }

  announcement.isPublished = !announcement.isPublished;
  if (announcement.isPublished && !announcement.publishedAt) {
    announcement.publishedAt = new Date();
  }
  await announcement.save();

  res.json({
    success: true,
    data: { isPublished: announcement.isPublished }
  });
});

// @desc    Toggle pin status
// @route   PATCH /api/announcements/:id/pin
// @access  Private/Admin
export const togglePin = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    res.status(404);
    throw new Error('Announcement not found');
  }

  announcement.isPinned = !announcement.isPinned;
  await announcement.save();

  res.json({
    success: true,
    data: { isPinned: announcement.isPinned }
  });
});

// @desc    Mark announcement as read
// @route   POST /api/announcements/:id/read
// @access  Private
export const markAsRead = asyncHandler(async (req, res) => {
  const announcement = await Announcement.findById(req.params.id);

  if (!announcement) {
    res.status(404);
    throw new Error('Announcement not found');
  }

  // Check if already read
  const alreadyRead = announcement.readBy.find(
    r => r.user.toString() === req.user._id.toString()
  );

  if (!alreadyRead) {
    announcement.readBy.push({
      user: req.user._id,
      readAt: new Date()
    });
    await announcement.save();
  }

  res.json({
    success: true,
    message: 'Marked as read'
  });
});