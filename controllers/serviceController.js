// controllers/serviceController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Service from '../models/Service.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import { getFullImageUrl } from '../utils/imageHelper.js';
import { securityLog } from '../middleware/auditLog.js';
import fs from 'fs';
import path from 'path';

// Validate MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Transform service with full image URLs
const transformService = (service) => {
  if (!service) return null;
  const obj = service.toObject ? service.toObject() : service;
  return {
    ...obj,
    thumbnail: getFullImageUrl(obj.thumbnail),
    coverImage: obj.coverImage ? getFullImageUrl(obj.coverImage) : null,
  };
};

// Delete old image file safely
const deleteOldImage = (imagePath) => {
  if (!imagePath || imagePath.includes('default-')) return;
  try {
    const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
    const fullPath = path.join(process.cwd(), 'uploads', cleanPath.replace('uploads/', ''));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn(`Failed to delete old image: ${imagePath}`);
  }
};

// =============================================
// PUBLIC ROUTES
// =============================================

// ✅ GET ALL PUBLIC SERVICES
// @route GET /api/services
// @access Public
export const getAllServices = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { search, category, sort } = req.query;

  const query = { isPublished: true };

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    query.$or = [
      { title: searchRegex },
      { shortDescription: searchRegex },
    ];
  }

  if (category && category !== 'all') {
    query.category = category;
  }

  // Sort options
  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    'price-low': { 'packages.0.price': 1 },
    'price-high': { 'packages.0.price': -1 },
    popular: { totalOrders: -1 },
    featured: { isFeatured: -1, order: 1 },
  };
  const sortBy = sortOptions[sort] || sortOptions.featured;

  const [total, services] = await Promise.all([
    Service.countDocuments(query),
    Service.find(query)
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    success: true,
    data: services.map(transformService),
    pagination: buildPaginationResponse(total, page, limit),
  });
});

// ✅ GET FEATURED SERVICES (for home page)
// @route GET /api/services/featured
// @access Public
export const getFeaturedServices = asyncHandler(async (req, res) => {
  const services = await Service.find({
    isPublished: true,
    isFeatured: true,
  })
    .sort({ order: 1, createdAt: -1 })
    .limit(6)
    .lean();

  // Fallback: if no featured, get latest 6
  const finalServices = services.length > 0
    ? services
    : await Service.find({ isPublished: true })
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();

  res.json({
    success: true,
    data: finalServices.map(transformService),
  });
});

// ✅ GET SERVICE BY SLUG
// @route GET /api/services/:slug
// @access Public
export const getServiceBySlug = asyncHandler(async (req, res) => {
  const service = await Service.findOne({
    slug: req.params.slug,
    isPublished: true,
  }).lean();

  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  res.json({
    success: true,
    data: transformService(service),
  });
});

// ✅ GET SERVICE STATS
// @route GET /api/services/stats
// @access Public
export const getServiceStats = asyncHandler(async (req, res) => {
  const [totalServices, totalOrders, categoryCounts] = await Promise.all([
    Service.countDocuments({ isPublished: true }),
    Service.aggregate([
      { $match: { isPublished: true } },
      { $group: { _id: null, total: { $sum: '$totalOrders' } } },
    ]),
    Service.aggregate([
      { $match: { isPublished: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      totalServices,
      totalOrders: totalOrders[0]?.total || 0,
      byCategory: categoryCounts,
    },
  });
});

// =============================================
// ADMIN/DEVELOPER ROUTES
// =============================================

// ✅ GET ALL SERVICES (Admin/Developer)
// @route GET /api/services/admin/all
// @access Private (Admin/Developer)
export const getAllServicesAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { search, category, status, sort } = req.query;

  const query = {};

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    query.$or = [
      { title: searchRegex },
      { shortDescription: searchRegex },
    ];
  }

  if (category && category !== 'all') {
    query.category = category;
  }

  if (status === 'published') query.isPublished = true;
  else if (status === 'draft') query.isPublished = false;
  else if (status === 'featured') query.isFeatured = true;

  const sortBy = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

  const [total, services] = await Promise.all([
    Service.countDocuments(query),
    Service.find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    success: true,
    data: services.map(transformService),
    pagination: buildPaginationResponse(total, page, limit),
  });
});

// ✅ GET SINGLE SERVICE BY ID (Admin/Developer)
// @route GET /api/services/admin/:id
// @access Private (Admin/Developer)
export const getServiceById = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid service ID');
  }

  const service = await Service.findById(req.params.id)
    .populate('createdBy', 'firstName lastName email');

  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  res.json({
    success: true,
    data: transformService(service),
  });
});

// ✅ CREATE SERVICE
// @route POST /api/services
// @access Private (Admin/Developer)
export const createService = asyncHandler(async (req, res) => {
  const {
    title, shortDescription, fullDescription, category, icon,
    whatYouGet, technologies, faqs, process, packages,
    metaTitle, metaDescription, metaKeywords, isPublished, isFeatured, order,
  } = req.body;

  // Validate packages
  if (!packages || !Array.isArray(packages) || packages.length !== 3) {
    res.status(400);
    throw new Error('Service must have exactly 3 packages (Basic, Standard, Premium)');
  }

  const packageNames = packages.map(p => p.name);
  if (!packageNames.includes('Basic') || !packageNames.includes('Standard') || !packageNames.includes('Premium')) {
    res.status(400);
    throw new Error('Packages must be Basic, Standard, and Premium');
  }

  const service = await Service.create({
    title,
    shortDescription,
    fullDescription,
    category,
    icon: icon || 'Code',
    whatYouGet: whatYouGet || [],
    technologies: technologies || [],
    faqs: faqs || [],
    process: process || [],
    packages,
    metaTitle,
    metaDescription,
    metaKeywords: metaKeywords || [],
    isPublished: isPublished || false,
    isFeatured: isFeatured || false,
    order: order || 0,
    createdBy: req.user._id,
  });

  securityLog('SERVICE_CREATED', {
    userId: req.user._id,
    serviceId: service._id,
    title: service.title,
  });

  res.status(201).json({
    success: true,
    message: 'Service created successfully',
    data: transformService(service),
  });
});

// ✅ UPDATE SERVICE
// @route PUT /api/services/:id
// @access Private (Admin/Developer)
export const updateService = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid service ID');
  }

  const service = await Service.findById(req.params.id);

  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  // Validate packages if updating
  if (req.body.packages) {
    if (!Array.isArray(req.body.packages) || req.body.packages.length !== 3) {
      res.status(400);
      throw new Error('Service must have exactly 3 packages');
    }
  }

  const fieldsToUpdate = [
    'title', 'shortDescription', 'fullDescription', 'category', 'icon',
    'whatYouGet', 'technologies', 'faqs', 'process', 'packages',
    'metaTitle', 'metaDescription', 'metaKeywords',
    'isPublished', 'isFeatured', 'order',
  ];

  fieldsToUpdate.forEach((field) => {
    if (req.body[field] !== undefined) {
      service[field] = req.body[field];
    }
  });

  await service.save();

  securityLog('SERVICE_UPDATED', {
    userId: req.user._id,
    serviceId: service._id,
  });

  res.json({
    success: true,
    message: 'Service updated successfully',
    data: transformService(service),
  });
});

// ✅ UPDATE SERVICE THUMBNAIL
// @route PUT /api/services/:id/thumbnail
// @access Private (Admin/Developer)
export const updateServiceThumbnail = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid service ID');
  }

  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image');
  }

  const service = await Service.findById(req.params.id);

  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  // Delete old thumbnail
  if (service.thumbnail) {
    deleteOldImage(service.thumbnail);
  }

  service.thumbnail = `services/${req.file.filename}`;
  await service.save();

  res.json({
    success: true,
    message: 'Thumbnail updated successfully',
    data: { thumbnail: getFullImageUrl(service.thumbnail) },
  });
});

// ✅ DELETE SERVICE
// @route DELETE /api/services/:id
// @access Private (Admin/Developer)
export const deleteService = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid service ID');
  }

  const service = await Service.findById(req.params.id);

  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  // Delete associated images
  if (service.thumbnail) deleteOldImage(service.thumbnail);
  if (service.coverImage) deleteOldImage(service.coverImage);

  securityLog('SERVICE_DELETED', {
    userId: req.user._id,
    serviceId: service._id,
    title: service.title,
  });

  await service.deleteOne();

  res.json({
    success: true,
    message: 'Service deleted successfully',
  });
});

// ✅ TOGGLE PUBLISH STATUS
// @route PATCH /api/services/:id/publish
// @access Private (Admin/Developer)
export const togglePublish = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid service ID');
  }

  const service = await Service.findById(req.params.id);

  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  service.isPublished = !service.isPublished;
  await service.save();

  res.json({
    success: true,
    message: `Service ${service.isPublished ? 'published' : 'unpublished'} successfully`,
    data: { isPublished: service.isPublished },
  });
});

// ✅ TOGGLE FEATURED STATUS
// @route PATCH /api/services/:id/featured
// @access Private (Admin/Developer)
export const toggleFeatured = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid service ID');
  }

  const service = await Service.findById(req.params.id);

  if (!service) {
    res.status(404);
    throw new Error('Service not found');
  }

  service.isFeatured = !service.isFeatured;
  await service.save();

  res.json({
    success: true,
    message: `Service ${service.isFeatured ? 'added to' : 'removed from'} featured`,
    data: { isFeatured: service.isFeatured },
  });
});