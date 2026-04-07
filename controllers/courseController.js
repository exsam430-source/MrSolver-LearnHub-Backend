// controllers/courseController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Course from '../models/Course.js';
import Category from '../models/Category.js';
import Lecture from '../models/Lecture.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import { getFullImageUrl } from '../utils/imageHelper.js';

// Helper to transform course
const transformCourse = (course) => {
  if (!course) return course;
  const obj = course.toObject ? course.toObject() : course;
  return {
    ...obj,
    thumbnail: getFullImageUrl(obj.thumbnail),
    certificateTemplate: getFullImageUrl(obj.certificateTemplate),
    instructor: obj.instructor ? {
      ...obj.instructor,
      avatar: getFullImageUrl(obj.instructor.avatar)
    } : obj.instructor
  };
};

// Helper function to get category ID from slug or ID
const getCategoryId = async (categoryParam) => {
  if (!categoryParam || categoryParam === '' || categoryParam === 'all') {
    return null;
  }

  if (mongoose.Types.ObjectId.isValid(categoryParam)) {
    return categoryParam;
  }

  const category = await Category.findOne({
    $or: [
      { slug: categoryParam.toLowerCase() },
      { name: { $regex: new RegExp(`^${categoryParam}$`, 'i') } }
    ]
  });

  return category ? category._id : null;
};

// @desc Get all published courses
// @route GET /api/courses
// @access Public
export const getCourses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const {
    search,
    category,
    level,
    price,
    sort,
    instructor
  } = req.query;

  const query = { isPublished: true };

  if (search && search.trim() !== '') {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } }
    ];
  }

  if (category && category !== '' && category !== 'all') {
    const categoryId = await getCategoryId(category);
    if (categoryId) {
      query.category = categoryId;
    } else {
      return res.json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(0, page, limit)
      });
    }
  }

  if (level && level !== 'all' && level !== '') {
    query.level = level;
  }

  if (price === 'free') {
    if (!search) {
      query.$or = [{ isFreeCourse: true }, { price: 0 }];
    } else {
      query.isFreeCourse = true;
    }
  } else if (price === 'paid') {
    query.isFreeCourse = { $ne: true };
    query.price = { $gt: 0 };
  }

  if (instructor) {
    if (mongoose.Types.ObjectId.isValid(instructor)) {
      query.instructor = instructor;
    }
  }

  let sortOptions = {};
  switch (sort) {
    case 'newest':
      sortOptions = { createdAt: -1 };
      break;
    case 'oldest':
      sortOptions = { createdAt: 1 };
      break;
    case 'price-low':
      sortOptions = { price: 1 };
      break;
    case 'price-high':
      sortOptions = { price: -1 };
      break;
    case 'rating':
      sortOptions = { 'rating.average': -1 };
      break;
    case 'popular':
      sortOptions = { enrollmentCount: -1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const total = await Course.countDocuments(query);
  const courses = await Course.find(query)
    .populate('instructor', 'firstName lastName avatar')
    .populate('category', 'name slug')
    .select('-curriculum')
    .sort(sortOptions)
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: courses.map(transformCourse),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc Get featured courses
// @route GET /api/courses/featured
// @access Public
export const getFeaturedCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({ isPublished: true, isFeatured: true })
    .populate('instructor', 'firstName lastName avatar')
    .populate('category', 'name slug')
    .select('-curriculum')
    .limit(8)
    .sort({ enrollmentCount: -1 });

  res.json({
    success: true,
    data: courses.map(transformCourse)
  });
});

// @desc Get single course by slug
// @route GET /api/courses/:slug
// @access Public
export const getCourseBySlug = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ slug: req.params.slug })
    .populate('instructor', 'firstName lastName avatar bio socialLinks')
    .populate('category', 'name slug')
    .populate({
      path: 'curriculum.lectures',
      select: 'title description contentType duration isPreview order isPublished'
    });

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  let isEnrolled = false;
  if (req.user) {
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: course._id,
      status: { $in: ['active', 'completed'] }
    });
    isEnrolled = !!enrollment;
  }

  res.json({
    success: true,
    data: {
      ...transformCourse(course),
      isEnrolled
    }
  });
});

// @desc Get course by ID
// @route GET /api/courses/id/:id
// @access Private/Instructor
export const getCourseById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const course = await Course.findById(req.params.id)
    .populate('instructor', 'firstName lastName avatar')
    .populate('category', 'name slug')
    .populate({
      path: 'curriculum.lectures',
      select: 'title description contentType duration isPreview order isPublished'
    });

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor._id.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized to access this course');
  }

  res.json({
    success: true,
    data: transformCourse(course)
  });
});

// @desc Create course
// @route POST /api/courses
// @access Private/Instructor
export const createCourse = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    shortDescription,
    category,
    level,
    language,
    price,
    discountPrice,
    requirements,
    whatYouWillLearn,
    targetAudience,
    tags,
    isFreeCourse,
    instructorId
  } = req.body;

  let instructor = req.user._id;

  if (req.user.role === 'admin' && instructorId) {
    const instructorUser = await User.findById(instructorId);
    if (!instructorUser || !['instructor', 'admin'].includes(instructorUser.role)) {
      res.status(400);
      throw new Error('Invalid instructor selected');
    }
    instructor = instructorId;
  }

  const course = await Course.create({
    title,
    description,
    shortDescription,
    category,
    level,
    language,
    price: isFreeCourse ? 0 : price,
    discountPrice,
    requirements,
    whatYouWillLearn,
    targetAudience,
    tags,
    isFreeCourse,
    instructor
  });

  res.status(201).json({
    success: true,
    data: transformCourse(course)
  });
});

// @desc Update course
// @route PUT /api/courses/:id
// @access Private/Instructor
export const updateCourse = asyncHandler(async (req, res) => {
  let course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized to update this course');
  }

  if (req.user.role === 'admin' && req.body.instructorId) {
    const instructorUser = await User.findById(req.body.instructorId);
    if (instructorUser && ['instructor', 'admin'].includes(instructorUser.role)) {
      req.body.instructor = req.body.instructorId;
    }
  }

  course = await Course.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    data: transformCourse(course)
  });
});

// @desc Update course thumbnail
// @route PUT /api/courses/:id/thumbnail
// @access Private/Instructor
export const updateCourseThumbnail = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image');
  }

  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  course.thumbnail = `thumbnails/${req.file.filename}`;
  await course.save();

  res.json({
    success: true,
    data: { thumbnail: getFullImageUrl(course.thumbnail) }
  });
});

// @desc Delete course
// @route DELETE /api/courses/:id
// @access Private/Instructor
export const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized to delete this course');
  }

  const enrollments = await Enrollment.countDocuments({ course: course._id });
  if (enrollments > 0 && req.user.role !== 'admin') {
    res.status(400);
    throw new Error('Cannot delete course with active enrollments');
  }

  await Lecture.deleteMany({ course: course._id });

  await course.deleteOne();

  res.json({
    success: true,
    message: 'Course deleted successfully'
  });
});

// @desc Publish/Unpublish course
// @route PATCH /api/courses/:id/publish
// @access Private/Instructor
export const togglePublish = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (!course.isPublished) {
    const lectureCount = await Lecture.countDocuments({ course: course._id });
    if (lectureCount === 0) {
      res.status(400);
      throw new Error('Course must have at least one lecture before publishing');
    }
  }

  course.isPublished = !course.isPublished;
  if (course.isPublished && !course.publishedAt) {
    course.publishedAt = new Date();
  }
  await course.save();

  res.json({
    success: true,
    data: { isPublished: course.isPublished }
  });
});

// @desc Add curriculum section
// @route POST /api/courses/:id/sections
// @access Private/Instructor
export const addSection = asyncHandler(async (req, res) => {
  const { sectionTitle, sectionDescription } = req.body;

  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const newSection = {
    sectionTitle,
    sectionDescription,
    lectures: [],
    order: course.curriculum.length
  };

  course.curriculum.push(newSection);
  await course.save();

  res.status(201).json({
    success: true,
    data: course.curriculum
  });
});

// @desc Update curriculum section
// @route PUT /api/courses/:id/sections/:sectionIndex
// @access Private/Instructor
export const updateSection = asyncHandler(async (req, res) => {
  const { sectionTitle, sectionDescription } = req.body;
  const { id, sectionIndex } = req.params;

  const course = await Course.findById(id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.curriculum[sectionIndex]) {
    res.status(404);
    throw new Error('Section not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  course.curriculum[sectionIndex].sectionTitle = sectionTitle;
  course.curriculum[sectionIndex].sectionDescription = sectionDescription;
  await course.save();

  res.json({
    success: true,
    data: course.curriculum
  });
});

// @desc Delete curriculum section
// @route DELETE /api/courses/:id/sections/:sectionIndex
// @access Private/Instructor
export const deleteSection = asyncHandler(async (req, res) => {
  const { id, sectionIndex } = req.params;

  const course = await Course.findById(id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.curriculum[sectionIndex]) {
    res.status(404);
    throw new Error('Section not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const lectureIds = course.curriculum[sectionIndex].lectures;
  await Lecture.deleteMany({ _id: { $in: lectureIds } });

  course.curriculum.splice(sectionIndex, 1);
  await course.save();

  const totalLectures = await Lecture.countDocuments({ course: course._id });
  course.totalLectures = totalLectures;
  await course.save();

  res.json({
    success: true,
    message: 'Section deleted successfully'
  });
});

// @desc Get instructor's courses
// @route GET /api/courses/instructor/my-courses
// @access Private/Instructor
export const getInstructorCourses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status, search } = req.query;

  const query = { instructor: req.user._id };

  if (status === 'published') {
    query.isPublished = true;
  } else if (status === 'draft') {
    query.isPublished = false;
  }

  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  const total = await Course.countDocuments(query);
  const courses = await Course.find(query)
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: courses.map(transformCourse),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc Get all courses (Admin)
// @route GET /api/courses/admin/all
// @access Private/Admin
export const getAllCoursesAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status, search, category, instructor } = req.query;

  const query = {};

  if (status === 'published') {
    query.isPublished = true;
  } else if (status === 'draft') {
    query.isPublished = false;
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  if (category && category !== 'all') {
    const categoryId = await getCategoryId(category);
    if (categoryId) {
      query.category = categoryId;
    }
  }

  if (instructor) {
    if (mongoose.Types.ObjectId.isValid(instructor)) {
      query.instructor = instructor;
    }
  }

  const total = await Course.countDocuments(query);
  const courses = await Course.find(query)
    .populate('instructor', 'firstName lastName email avatar')
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: courses.map(transformCourse),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc Toggle featured status
// @route PATCH /api/courses/:id/featured
// @access Private/Admin
export const toggleFeatured = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  course.isFeatured = !course.isFeatured;
  await course.save();

  res.json({
    success: true,
    data: { isFeatured: course.isFeatured }
  });
});