import asyncHandler from 'express-async-handler';
import Category from '../models/Category.js';
import Course from '../models/Course.js';

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true })
    .populate('coursesCount')
    .sort({ order: 1, name: 1 });

  res.json({
    success: true,
    data: categories
  });
});

// @desc    Get all categories (Admin - includes inactive)
// @route   GET /api/categories/admin
// @access  Private/Admin
export const getAllCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find()
    .populate('coursesCount')
    .sort({ order: 1, name: 1 });

  res.json({
    success: true,
    data: categories
  });
});

// @desc    Get single category
// @route   GET /api/categories/:id
// @access  Public
export const getCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  res.json({
    success: true,
    data: category
  });
});

// @desc    Get category by slug
// @route   GET /api/categories/slug/:slug
// @access  Public
export const getCategoryBySlug = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ slug: req.params.slug, isActive: true });

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  // Get courses in this category
  const courses = await Course.find({ category: category._id, isPublished: true })
    .populate('instructor', 'firstName lastName avatar')
    .select('title slug thumbnail price discountPrice rating enrollmentCount level');

  res.json({
    success: true,
    data: {
      category,
      courses
    }
  });
});

// @desc    Create category
// @route   POST /api/categories
// @access  Private/Admin
export const createCategory = asyncHandler(async (req, res) => {
  const { name, description, icon, color, parent, order } = req.body;

  const category = await Category.create({
    name,
    description,
    icon,
    color,
    parent,
    order
  });

  res.status(201).json({
    success: true,
    data: category
  });
});

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private/Admin
export const updateCategory = asyncHandler(async (req, res) => {
  let category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  category = await Category.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    data: category
  });
});

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  // Check if category has courses
  const coursesCount = await Course.countDocuments({ category: category._id });
  if (coursesCount > 0) {
    res.status(400);
    throw new Error('Cannot delete category with courses. Please move or delete courses first.');
  }

  await category.deleteOne();

  res.json({
    success: true,
    message: 'Category deleted successfully'
  });
});

// @desc    Toggle category status
// @route   PATCH /api/categories/:id/toggle-status
// @access  Private/Admin
export const toggleCategoryStatus = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  category.isActive = !category.isActive;
  await category.save();

  res.json({
    success: true,
    data: { isActive: category.isActive }
  });
});