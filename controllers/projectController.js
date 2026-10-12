// controllers/projectController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Project from '../models/Project.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import { getFullImageUrl } from '../utils/imageHelper.js';
import { securityLog } from '../middleware/auditLog.js';
import fs from 'fs';
import path from 'path';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Transform project with full image URLs
const transformProject = (project) => {
  if (!project) return null;
  const obj = project.toObject ? project.toObject() : project;
  return {
    ...obj,
    thumbnail: getFullImageUrl(obj.thumbnail),
    clientLogo: obj.clientLogo ? getFullImageUrl(obj.clientLogo) : null,
    screenshots: (obj.screenshots || []).map(s => ({
      ...s,
      url: getFullImageUrl(s.url),
    })),
  };
};

// Delete old image safely
const deleteOldImage = (imagePath) => {
  if (!imagePath || imagePath.includes('default-')) return;
  try {
    const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
    const fullPath = path.join(process.cwd(), 'uploads', cleanPath.replace('uploads/', ''));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn(`Failed to delete: ${imagePath}`);
  }
};

// =============================================
// PUBLIC ROUTES
// =============================================

// ✅ GET ALL PUBLIC PROJECTS
// @route GET /api/projects
// @access Public
export const getAllProjects = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { search, category, status, sort } = req.query;

  const query = { isPublished: true };

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    query.$or = [
      { title: searchRegex },
      { shortDescription: searchRegex },
      { clientName: searchRegex },
    ];
  }

  if (category && category !== 'all') {
    query.category = category;
  }

  if (status && status !== 'all') {
    query.status = status;
  }

  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    popular: { views: -1 },
    featured: { isFeatured: -1, order: 1 },
  };
  const sortBy = sortOptions[sort] || sortOptions.featured;

  const [total, projects] = await Promise.all([
    Project.countDocuments(query),
    Project.find(query)
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    success: true,
    data: projects.map(transformProject),
    pagination: buildPaginationResponse(total, page, limit),
  });
});

// ✅ GET FEATURED PROJECTS
// @route GET /api/projects/featured
// @access Public
export const getFeaturedProjects = asyncHandler(async (req, res) => {
  const projects = await Project.find({
    isPublished: true,
    isFeatured: true,
  })
    .sort({ order: 1, createdAt: -1 })
    .limit(6)
    .lean();

  const finalProjects = projects.length > 0
    ? projects
    : await Project.find({ isPublished: true })
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();

  res.json({
    success: true,
    data: finalProjects.map(transformProject),
  });
});

// ✅ GET PROJECT BY SLUG
// @route GET /api/projects/:slug
// @access Public
export const getProjectBySlug = asyncHandler(async (req, res) => {
  const project = await Project.findOne({
    slug: req.params.slug,
    isPublished: true,
  });

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  // Increment view count
  project.views = (project.views || 0) + 1;
  await project.save({ validateBeforeSave: false });

  res.json({
    success: true,
    data: transformProject(project),
  });
});

// ✅ GET PROJECT STATS
// @route GET /api/projects/stats
// @access Public
export const getProjectStats = asyncHandler(async (req, res) => {
  const [totalProjects, completedProjects, categoryCounts] = await Promise.all([
    Project.countDocuments({ isPublished: true }),
    Project.countDocuments({ isPublished: true, status: 'completed' }),
    Project.aggregate([
      { $match: { isPublished: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      totalProjects,
      completedProjects,
      byCategory: categoryCounts,
    },
  });
});

// =============================================
// ADMIN/DEVELOPER ROUTES
// =============================================

// ✅ GET ALL PROJECTS (Admin/Developer)
// @route GET /api/projects/admin/all
// @access Private (Admin/Developer)
export const getAllProjectsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { search, category, status, isPublished, sort } = req.query;

  const query = {};

  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    query.$or = [
      { title: searchRegex },
      { clientName: searchRegex },
    ];
  }

  if (category && category !== 'all') query.category = category;
  if (status && status !== 'all') query.status = status;
  if (isPublished === 'true') query.isPublished = true;
  else if (isPublished === 'false') query.isPublished = false;

  const sortBy = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

  const [total, projects] = await Promise.all([
    Project.countDocuments(query),
    Project.find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    success: true,
    data: projects.map(transformProject),
    pagination: buildPaginationResponse(total, page, limit),
  });
});

// ✅ GET SINGLE PROJECT BY ID (Admin)
// @route GET /api/projects/admin/:id
// @access Private (Admin/Developer)
export const getProjectById = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid project ID');
  }

  const project = await Project.findById(req.params.id)
    .populate('createdBy', 'firstName lastName email');

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  res.json({
    success: true,
    data: transformProject(project),
  });
});

// ✅ CREATE PROJECT
// @route POST /api/projects
// @access Private (Admin/Developer)
export const createProject = asyncHandler(async (req, res) => {
  const {
    title, shortDescription, fullDescription, category,
    clientName, clientLocation, liveUrl,
    technologies, features, challenges, solution, results,
    duration, completedDate, testimonial, status,
    metaTitle, metaDescription, metaKeywords,
    isPublished, isFeatured, order,
  } = req.body;

  // Thumbnail must be uploaded
  if (!req.file && !req.body.thumbnail) {
    res.status(400);
    throw new Error('Project thumbnail is required');
  }

  const projectData = {
    title,
    shortDescription,
    fullDescription,
    category,
    thumbnail: req.file ? `projects/${req.file.filename}` : req.body.thumbnail,
    clientName,
    clientLocation,
    liveUrl,
    technologies: technologies || [],
    features: features || [],
    challenges,
    solution,
    results: results || [],
    duration,
    completedDate,
    testimonial,
    status: status || 'completed',
    metaTitle,
    metaDescription,
    metaKeywords: metaKeywords || [],
    isPublished: isPublished || false,
    isFeatured: isFeatured || false,
    order: order || 0,
    createdBy: req.user._id,
  };

  const project = await Project.create(projectData);

  securityLog('PROJECT_CREATED', {
    userId: req.user._id,
    projectId: project._id,
    title: project.title,
  });

  res.status(201).json({
    success: true,
    message: 'Project created successfully',
    data: transformProject(project),
  });
});

// ✅ UPDATE PROJECT
// @route PUT /api/projects/:id
// @access Private (Admin/Developer)
export const updateProject = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid project ID');
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  const fieldsToUpdate = [
    'title', 'shortDescription', 'fullDescription', 'category',
    'clientName', 'clientLocation', 'liveUrl',
    'technologies', 'features', 'challenges', 'solution', 'results',
    'duration', 'completedDate', 'testimonial', 'status',
    'metaTitle', 'metaDescription', 'metaKeywords',
    'isPublished', 'isFeatured', 'order',
  ];

  fieldsToUpdate.forEach((field) => {
    if (req.body[field] !== undefined) {
      project[field] = req.body[field];
    }
  });

  await project.save();

  securityLog('PROJECT_UPDATED', {
    userId: req.user._id,
    projectId: project._id,
  });

  res.json({
    success: true,
    message: 'Project updated successfully',
    data: transformProject(project),
  });
});

// ✅ UPDATE PROJECT THUMBNAIL
// @route PUT /api/projects/:id/thumbnail
// @access Private (Admin/Developer)
export const updateProjectThumbnail = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid project ID');
  }

  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image');
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  if (project.thumbnail) {
    deleteOldImage(project.thumbnail);
  }

  project.thumbnail = `projects/${req.file.filename}`;
  await project.save();

  res.json({
    success: true,
    message: 'Thumbnail updated successfully',
    data: { thumbnail: getFullImageUrl(project.thumbnail) },
  });
});

// ✅ ADD SCREENSHOTS
// @route POST /api/projects/:id/screenshots
// @access Private (Admin/Developer)
export const addScreenshots = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid project ID');
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error('Please upload at least one image');
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  const newScreenshots = req.files.map((file, index) => ({
    url: `projects/${file.filename}`,
    caption: req.body.captions?.[index] || '',
  }));

  project.screenshots.push(...newScreenshots);
  await project.save();

  res.json({
    success: true,
    message: 'Screenshots added successfully',
    data: transformProject(project),
  });
});

// ✅ REMOVE SCREENSHOT
// @route DELETE /api/projects/:id/screenshots/:index
// @access Private (Admin/Developer)
export const removeScreenshot = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid project ID');
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  const index = parseInt(req.params.index, 10);

  if (isNaN(index) || index < 0 || index >= project.screenshots.length) {
    res.status(400);
    throw new Error('Invalid screenshot index');
  }

  // Delete physical file
  const screenshot = project.screenshots[index];
  if (screenshot?.url) deleteOldImage(screenshot.url);

  // Remove from array
  project.screenshots.splice(index, 1);
  await project.save();

  res.json({
    success: true,
    message: 'Screenshot removed successfully',
    data: transformProject(project),
  });
});

// ✅ DELETE PROJECT
// @route DELETE /api/projects/:id
// @access Private (Admin/Developer)
export const deleteProject = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid project ID');
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  // Delete all images
  if (project.thumbnail) deleteOldImage(project.thumbnail);
  if (project.clientLogo) deleteOldImage(project.clientLogo);
  project.screenshots.forEach((s) => s.url && deleteOldImage(s.url));

  securityLog('PROJECT_DELETED', {
    userId: req.user._id,
    projectId: project._id,
    title: project.title,
  });

  await project.deleteOne();

  res.json({
    success: true,
    message: 'Project deleted successfully',
  });
});

// ✅ TOGGLE PUBLISH
// @route PATCH /api/projects/:id/publish
// @access Private (Admin/Developer)
export const togglePublish = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid project ID');
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  project.isPublished = !project.isPublished;
  await project.save();

  res.json({
    success: true,
    message: `Project ${project.isPublished ? 'published' : 'unpublished'} successfully`,
    data: { isPublished: project.isPublished },
  });
});

// ✅ TOGGLE FEATURED
// @route PATCH /api/projects/:id/featured
// @access Private (Admin/Developer)
export const toggleFeatured = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid project ID');
  }

  const project = await Project.findById(req.params.id);

  if (!project) {
    res.status(404);
    throw new Error('Project not found');
  }

  project.isFeatured = !project.isFeatured;
  await project.save();

  res.json({
    success: true,
    message: `Project ${project.isFeatured ? 'added to' : 'removed from'} featured`,
    data: { isFeatured: project.isFeatured },
  });
});