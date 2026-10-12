// controllers/categoryController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Course from '../models/Course.js';
import { securityLog } from '../middleware/auditLog.js';

// =============================================
// HELPERS
// =============================================

// ✅ Validate ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ✅ Escape regex (prevent ReDoS)
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ✅ Validate hex color
const isValidHexColor = (color) =>
  /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);

// ✅ Allowed icon values (whitelist)
const ALLOWED_ICONS = [
  'code', 'smartphone', 'chart', 'palette', 'briefcase',
  'server', 'book', 'music', 'camera', 'globe',
  'heart', 'star', 'zap', 'shield', 'cpu',
  'database', 'film', 'headphones', 'pen', 'scissors'
];

// =============================================
// PUBLIC: GET ALL ACTIVE CATEGORIES
// =============================================
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true })
    .populate('coursesCount')
    .select('-__v')
    .sort({ order: 1, name: 1 })
    .lean();

  res.json({
    success: true,
    count: categories.length,
    data: categories
  });
});

// =============================================
// ADMIN: GET ALL CATEGORIES (includes inactive)
// =============================================
export const getAllCategories = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;

  const query = {};

  // ✅ Status filter
  if (status === 'active') query.isActive = true;
  else if (status === 'inactive') query.isActive = false;

  // ✅ Search filter
  if (search?.trim()) {
    const escaped = escapeRegex(search.trim());
    query.$or = [
      { name: { $regex: new RegExp(escaped, 'i') } },
      { description: { $regex: new RegExp(escaped, 'i') } }
    ];
  }

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [total, categories] = await Promise.all([
    Category.countDocuments(query),
    Category.find(query)
      .populate('coursesCount')
      .select('-__v')
      .sort({ order: 1, name: 1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
  ]);

  res.json({
    success: true,
    count: categories.length,
    total,
    data: categories
  });
});

// =============================================
// PUBLIC: GET SINGLE CATEGORY BY ID
// =============================================
export const getCategory = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid category ID');
  }

  const category = await Category.findById(req.params.id)
    .populate('coursesCount')
    .select('-__v')
    .lean();

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  res.json({
    success: true,
    data: category
  });
});

// =============================================
// PUBLIC: GET CATEGORY BY SLUG
// =============================================
export const getCategoryBySlug = asyncHandler(async (req, res) => {
  // ✅ Validate slug
  const slug = req.params.slug;
  if (!slug || slug.length > 200 || !/^[a-z0-9-]+$/.test(slug)) {
    res.status(400);
    throw new Error('Invalid category slug');
  }

  const category = await Category.findOne({
    slug,
    isActive: true
  })
    .populate('coursesCount')
    .select('-__v')
    .lean();

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  // ✅ Get courses in this category (paginated)
  const { page = 1, limit = 12 } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 12));
  const skip = (pageNum - 1) * limitNum;

  const [total, courses] = await Promise.all([
    Course.countDocuments({
      category: category._id,
      isPublished: true
    }),
    Course.find({
      category: category._id,
      isPublished: true
    })
      .populate('instructor', 'firstName lastName avatar')
      .select('title slug thumbnail price discountPrice pricingType rating enrollmentCount level duration')
      .sort({ enrollmentCount: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean()
  ]);

  res.json({
    success: true,
    data: {
      category,
      courses,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }
  });
});

// =============================================
// ADMIN: CREATE CATEGORY
// =============================================
export const createCategory = asyncHandler(async (req, res) => {
  const { name, description, icon, color, parent, order } = req.body;

  // ✅ Validate name
  if (!name?.trim()) {
    res.status(400);
    throw new Error('Category name is required');
  }

  const safeName = name.replace(/<[^>]*>/g, '').trim();
  if (safeName.length < 2) {
    res.status(400);
    throw new Error('Category name must be at least 2 characters');
  }
  if (safeName.length > 100) {
    res.status(400);
    throw new Error('Category name cannot exceed 100 characters');
  }

  // ✅ Check duplicate name (case insensitive)
  const existing = await Category.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(safeName)}$`, 'i') }
  }).lean();

  if (existing) {
    res.status(400);
    throw new Error('Category with this name already exists');
  }

  // ✅ Validate icon (whitelist)
  const safeIcon = ALLOWED_ICONS.includes(icon) ? icon : 'code';

  // ✅ Validate color
  const safeColor = color && isValidHexColor(color) ? color : '#3B82F6';

  // ✅ Validate parent
  let safeParent = null;
  if (parent && isValidId(parent)) {
    const parentExists = await Category.findById(parent).select('_id').lean();
    if (!parentExists) {
      res.status(400);
      throw new Error('Parent category not found');
    }
    safeParent = parent;
  }

  // ✅ Safe order
  const safeOrder = Math.max(0, Math.min(9999, parseInt(order) || 0));

  // ✅ Safe description
  const safeDescription = description
    ? description.replace(/<[^>]*>/g, '').trim().substring(0, 500)
    : '';

  const category = await Category.create({
    name: safeName,
    description: safeDescription,
    icon: safeIcon,
    color: safeColor,
    parent: safeParent,
    order: safeOrder
  });

  securityLog('CATEGORY_CREATED', {
    adminId: req.user._id,
    categoryId: category._id,
    categoryName: category.name,
    ip: req.ip
  });

  res.status(201).json({
    success: true,
    data: category,
    message: 'Category created successfully'
  });
});

// =============================================
// ADMIN: UPDATE CATEGORY
// =============================================
export const updateCategory = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid category ID');
  }

  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  const { name, description, icon, color, parent, order, isActive } = req.body;

  // ✅ Validate and update name
  if (name !== undefined) {
    const safeName = name.replace(/<[^>]*>/g, '').trim();
    if (safeName.length < 2) {
      res.status(400);
      throw new Error('Category name must be at least 2 characters');
    }
    if (safeName.length > 100) {
      res.status(400);
      throw new Error('Category name cannot exceed 100 characters');
    }

    // ✅ Check duplicate (exclude current)
    const existing = await Category.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(safeName)}$`, 'i') },
      _id: { $ne: req.params.id }
    }).lean();

    if (existing) {
      res.status(400);
      throw new Error('Category with this name already exists');
    }

    category.name = safeName;
  }

  // ✅ Update description
  if (description !== undefined) {
    category.description = description
      ? description.replace(/<[^>]*>/g, '').trim().substring(0, 500)
      : '';
  }

  // ✅ Validate and update icon (whitelist)
  if (icon !== undefined) {
    category.icon = ALLOWED_ICONS.includes(icon) ? icon : category.icon;
  }

  // ✅ Validate and update color
  if (color !== undefined) {
    category.color = isValidHexColor(color) ? color : category.color;
  }

  // ✅ Validate and update parent
  if (parent !== undefined) {
    if (parent === null || parent === '') {
      category.parent = null;
    } else if (isValidId(parent)) {
      // ✅ Prevent self-reference
      if (parent.toString() === req.params.id) {
        res.status(400);
        throw new Error('Category cannot be its own parent');
      }
      const parentExists = await Category.findById(parent).select('_id').lean();
      if (!parentExists) {
        res.status(400);
        throw new Error('Parent category not found');
      }
      category.parent = parent;
    }
  }

  // ✅ Update order
  if (order !== undefined) {
    category.order = Math.max(0, Math.min(9999, parseInt(order) || 0));
  }

  // ✅ Update isActive
  if (isActive !== undefined) {
    category.isActive = Boolean(isActive);
  }

  const updated = await category.save();

  securityLog('CATEGORY_UPDATED', {
    adminId: req.user._id,
    categoryId: category._id,
    ip: req.ip
  });

  res.json({
    success: true,
    data: updated,
    message: 'Category updated successfully'
  });
});

// =============================================
// ADMIN: DELETE CATEGORY
// =============================================
export const deleteCategory = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid category ID');
  }

  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  // ✅ Check if category has courses
  const coursesCount = await Course.countDocuments({
    category: category._id
  });

  if (coursesCount > 0) {
    res.status(400);
    throw new Error(
      `Cannot delete category with ${coursesCount} course(s). Please move or delete courses first.`
    );
  }

  // ✅ Check if has child categories
  const childCount = await Category.countDocuments({
    parent: category._id
  });

  if (childCount > 0) {
    res.status(400);
    throw new Error(
      `Cannot delete category with ${childCount} sub-category(ies). Delete sub-categories first.`
    );
  }

  await category.deleteOne();

  securityLog('CATEGORY_DELETED', {
    adminId: req.user._id,
    categoryId: category._id,
    categoryName: category.name,
    ip: req.ip
  });

  res.json({
    success: true,
    message: 'Category deleted successfully'
  });
});

// =============================================
// ADMIN: TOGGLE CATEGORY STATUS
// =============================================
export const toggleCategoryStatus = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid category ID');
  }

  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  category.isActive = !category.isActive;
  await category.save();

  securityLog('CATEGORY_STATUS_TOGGLED', {
    adminId: req.user._id,
    categoryId: category._id,
    newStatus: category.isActive,
    ip: req.ip
  });

  res.json({
    success: true,
    data: {
      isActive: category.isActive,
      message: `Category ${category.isActive ? 'activated' : 'deactivated'} successfully`
    }
  });
});

// =============================================
// ADMIN: REORDER CATEGORIES
// =============================================
export const reorderCategories = asyncHandler(async (req, res) => {
  const { orders } = req.body;

  // ✅ Validate orders array
  if (!Array.isArray(orders) || orders.length === 0) {
    res.status(400);
    throw new Error('Orders array is required');
  }

  if (orders.length > 100) {
    res.status(400);
    throw new Error('Too many categories to reorder at once');
  }

  // ✅ Validate each item
  for (const item of orders) {
    if (!isValidId(item.id)) {
      res.status(400);
      throw new Error(`Invalid category ID: ${item.id}`);
    }
    if (typeof item.order !== 'number' || item.order < 0) {
      res.status(400);
      throw new Error('Invalid order value');
    }
  }

  // ✅ Bulk update
  const bulkOps = orders.map(({ id, order }) => ({
    updateOne: {
      filter: { _id: new mongoose.Types.ObjectId(id) },
      update: { $set: { order: Math.min(9999, order) } }
    }
  }));

  await Category.bulkWrite(bulkOps);

  securityLog('CATEGORIES_REORDERED', {
    adminId: req.user._id,
    count: orders.length,
    ip: req.ip
  });

  res.json({
    success: true,
    message: 'Categories reordered successfully'
  });
});

// =============================================
// PUBLIC: GET CATEGORY STATS
// =============================================
export const getCategoryStats = asyncHandler(async (req, res) => {
  const stats = await Category.aggregate([
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: 'category',
        as: 'courses'
      }
    },
    {
      $project: {
        name: 1,
        slug: 1,
        color: 1,
        icon: 1,
        isActive: 1,
        totalCourses: { $size: '$courses' },
        publishedCourses: {
          $size: {
            $filter: {
              input: '$courses',
              cond: { $eq: ['$$this.isPublished', true] }
            }
          }
        },
        totalEnrollments: { $sum: '$courses.enrollmentCount' }
      }
    },
    { $sort: { totalCourses: -1 } }
  ]);

  res.json({
    success: true,
    data: stats
  });
});