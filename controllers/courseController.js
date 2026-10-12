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
import { securityLog } from '../middleware/auditLog.js';

// =============================================
// HELPERS
// =============================================

// ✅ Safe transform course (no sensitive data)
const transformCourse = (course) => {
  if (!course) return null;
  const obj = course.toObject ? course.toObject() : course;

  return {
    ...obj,
    thumbnail: getFullImageUrl(obj.thumbnail),
    certificateTemplate: obj.certificateTemplate
      ? getFullImageUrl(obj.certificateTemplate)
      : null,
    instructor: obj.instructor
      ? {
          ...obj.instructor,
          avatar: getFullImageUrl(obj.instructor.avatar)
        }
      : obj.instructor
  };
};

// ✅ Validate ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ✅ Escape regex special chars (prevent ReDoS)
const escapeRegex = (str) =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ✅ Get category ID from slug or ObjectId
const getCategoryId = async (categoryParam) => {
  if (!categoryParam || categoryParam === '' || categoryParam === 'all') {
    return null;
  }

  if (isValidId(categoryParam)) {
    return new mongoose.Types.ObjectId(categoryParam);
  }

  const escaped = escapeRegex(categoryParam);
  const category = await Category.findOne({
    $or: [
      { slug: categoryParam.toLowerCase() },
      { name: { $regex: new RegExp(`^${escaped}$`, 'i') } }
    ]
  }).select('_id').lean();

  return category ? category._id : null;
};

// ✅ Check course ownership
const checkOwnership = (course, user) => {
  if (user.role === 'admin') return true;
  const instructorId = course.instructor?._id || course.instructor;
  return instructorId?.toString() === user._id.toString();
};

// =============================================
// PUBLIC: GET ALL COURSES
// =============================================
export const getCourses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(
    req.query.page,
    Math.min(req.query.limit || 12, 50) // ✅ Max 50 per page
  );

  const {
    search,
    category,
    level,
    price,
    sort,
    instructor
  } = req.query;

  const query = { isPublished: true };

  // ✅ Safe search with escaped regex
  if (search && search.trim()) {
    const escaped = escapeRegex(search.trim());
    const searchRegex = new RegExp(escaped, 'i');
    query.$or = [
      { title: searchRegex },
      { tags: searchRegex }
    ];
  }

  // ✅ Category filter
  if (category && category !== 'all' && category !== '') {
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

  // ✅ Level filter (whitelist)
  if (level && level !== 'all' && level !== '') {
    const validLevels = ['beginner', 'intermediate', 'advanced', 'all-levels'];
    if (validLevels.includes(level)) {
      query.level = level;
    }
  }

  // ✅ Price filter
  if (price === 'free') {
    query.$or = query.$or
      ? [{ $and: [{ $or: query.$or }, { $or: [{ isFreeCourse: true }, { price: 0 }] }] }]
      : [{ isFreeCourse: true }, { price: 0 }];
    query.pricingType = 'free';
  } else if (price === 'paid') {
    query.isFreeCourse = { $ne: true };
    query.price = { $gt: 0 };
  }

  // ✅ Instructor filter
  if (instructor && isValidId(instructor)) {
    query.instructor = new mongoose.Types.ObjectId(instructor);
  }

  // ✅ Sort options (whitelist)
  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    'price-low': { price: 1 },
    'price-high': { price: -1 },
    rating: { 'rating.average': -1 },
    popular: { enrollmentCount: -1 }
  };
  const sortOptions = sortMap[sort] || sortMap.newest;

  const [total, courses] = await Promise.all([
    Course.countDocuments(query),
    Course.find(query)
      .populate('instructor', 'firstName lastName avatar')
      .populate('category', 'name slug')
      .select('-curriculum -certificateSettings -certificateTemplate')
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({
    success: true,
    data: courses.map((c) => ({
      ...c,
      thumbnail: getFullImageUrl(c.thumbnail),
      instructor: c.instructor
        ? { ...c.instructor, avatar: getFullImageUrl(c.instructor.avatar) }
        : null
    })),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// =============================================
// PUBLIC: GET FEATURED COURSES
// =============================================
export const getFeaturedCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({
    isPublished: true,
    isFeatured: true
  })
    .populate('instructor', 'firstName lastName avatar')
    .populate('category', 'name slug')
    .select('-curriculum -certificateSettings')
    .limit(8)
    .sort({ enrollmentCount: -1 })
    .lean();

  res.json({
    success: true,
    data: courses.map((c) => ({
      ...c,
      thumbnail: getFullImageUrl(c.thumbnail),
      instructor: c.instructor
        ? { ...c.instructor, avatar: getFullImageUrl(c.instructor.avatar) }
        : null
    }))
  });
});

// =============================================
// PUBLIC: GET COURSE BY SLUG
// =============================================
export const getCourseBySlug = asyncHandler(async (req, res) => {
  // ✅ Validate slug format
  const slug = req.params.slug;
  if (!slug || slug.length > 300) {
    res.status(400);
    throw new Error('Invalid course slug');
  }

  const course = await Course.findOne({ slug })
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

  // ✅ Check enrollment status
  let isEnrolled = false;
  if (req.user) {
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: course._id,
      status: { $in: ['active', 'completed'] }
    }).select('_id status').lean();
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

// =============================================
// PRIVATE: GET COURSE BY ID (Instructor/Admin)
// =============================================
export const getCourseById = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid course ID format');
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

  // ✅ Ownership check
  if (!checkOwnership(course, req.user)) {
    securityLog('UNAUTHORIZED_COURSE_ACCESS', {
      userId: req.user._id,
      courseId: course._id,
      ip: req.ip
    });
    res.status(403);
    throw new Error('You are not authorized to access this course');
  }

  res.json({
    success: true,
    data: transformCourse(course)
  });
});

// =============================================
// PRIVATE: CREATE COURSE
// =============================================
export const createCourse = asyncHandler(async (req, res) => {
  // ✅ Validation done by middleware
  const {
    title,
    description,
    shortDescription,
    category,
    level,
    language,
    pricingType,
    price,
    discountPrice,
    isFreeCourse,
    subscriptionPlans,
    requirements,
    whatYouWillLearn,
    targetAudience,
    tags,
    instructorId
  } = req.body;

  // ✅ Validate category exists
  if (!isValidId(category)) {
    res.status(400);
    throw new Error('Invalid category ID');
  }

  const categoryExists = await Category.findById(category).select('_id').lean();
  if (!categoryExists) {
    res.status(400);
    throw new Error('Category not found');
  }

  // ✅ Determine instructor
  let instructor = req.user._id;

  if (req.user.role === 'admin' && instructorId) {
    if (!isValidId(instructorId)) {
      res.status(400);
      throw new Error('Invalid instructor ID');
    }
    const instructorUser = await User.findById(instructorId)
      .select('role isActive').lean();
    if (!instructorUser || !['instructor', 'admin'].includes(instructorUser.role)) {
      res.status(400);
      throw new Error('Invalid instructor selected');
    }
    if (!instructorUser.isActive) {
      res.status(400);
      throw new Error('Selected instructor account is inactive');
    }
    instructor = instructorId;
  }

  // ✅ Price validation
  if (!isFreeCourse && pricingType !== 'free' && price <= 0 && pricingType === 'one_time') {
    res.status(400);
    throw new Error('Price must be greater than 0 for paid courses');
  }

  if (discountPrice && discountPrice >= price) {
    res.status(400);
    throw new Error('Discount price must be less than regular price');
  }

  // ✅ Subscription validation
  if (pricingType === 'subscription') {
    if (!subscriptionPlans?.monthly?.enabled) {
      res.status(400);
      throw new Error('Subscription courses must have monthly plan enabled');
    }
    if (!subscriptionPlans?.monthly?.price || subscriptionPlans.monthly.price <= 0) {
      res.status(400);
      throw new Error('Monthly subscription price must be greater than 0');
    }
  }

  const course = await Course.create({
    title,
    description,
    shortDescription,
    category,
    level,
    language,
    pricingType: isFreeCourse ? 'free' : pricingType,
    price: isFreeCourse ? 0 : price,
    discountPrice: discountPrice || undefined,
    isFreeCourse: isFreeCourse || pricingType === 'free',
    subscriptionPlans,
    requirements: requirements || [],
    whatYouWillLearn: whatYouWillLearn || [],
    targetAudience: targetAudience || [],
    tags: tags || [],
    instructor
  });

  securityLog('COURSE_CREATED', {
    userId: req.user._id,
    courseId: course._id,
    courseTitle: course.title,
    ip: req.ip
  });

  res.status(201).json({
    success: true,
    message: 'Course created successfully',
    data: transformCourse(course)
  });
});

// =============================================
// PRIVATE: UPDATE COURSE
// =============================================
export const updateCourse = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid course ID format');
  }

  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // ✅ Ownership check
  if (!checkOwnership(course, req.user)) {
    securityLog('UNAUTHORIZED_COURSE_UPDATE', {
      userId: req.user._id,
      courseId: course._id,
      ip: req.ip
    });
    res.status(403);
    throw new Error('You are not authorized to update this course');
  }

  // ✅ Validation done by middleware
  const {
    title,
    description,
    shortDescription,
    category,
    level,
    language,
    pricingType,
    price,
    discountPrice,
    isFreeCourse,
    subscriptionPlans,
    requirements,
    whatYouWillLearn,
    targetAudience,
    tags,
    instructorId,
    certificateSettings
  } = req.body;

  // ✅ Validate category if changing
  if (category && category !== course.category?.toString()) {
    if (!isValidId(category)) {
      res.status(400);
      throw new Error('Invalid category ID');
    }
    const catExists = await Category.findById(category).select('_id').lean();
    if (!catExists) {
      res.status(400);
      throw new Error('Category not found');
    }
  }

  // ✅ Admin can change instructor
  if (req.user.role === 'admin' && instructorId) {
    if (!isValidId(instructorId)) {
      res.status(400);
      throw new Error('Invalid instructor ID');
    }
    const instructorUser = await User.findById(instructorId)
      .select('role isActive').lean();
    if (instructorUser && ['instructor', 'admin'].includes(instructorUser.role)) {
      course.instructor = instructorId;
    }
  }

  // ✅ Price validation
  const newPrice = price !== undefined ? price : course.price;
  const newDiscountPrice = discountPrice !== undefined ? discountPrice : course.discountPrice;

  if (newDiscountPrice && newDiscountPrice >= newPrice) {
    res.status(400);
    throw new Error('Discount price must be less than regular price');
  }

  // ✅ Apply updates (only provided fields)
  if (title !== undefined) course.title = title;
  if (description !== undefined) course.description = description;
  if (shortDescription !== undefined) course.shortDescription = shortDescription;
  if (category !== undefined) course.category = category;
  if (level !== undefined) course.level = level;
  if (language !== undefined) course.language = language;
  if (pricingType !== undefined) course.pricingType = pricingType;
  if (price !== undefined) course.price = isFreeCourse ? 0 : price;
  if (discountPrice !== undefined) course.discountPrice = discountPrice || undefined;
  if (isFreeCourse !== undefined) course.isFreeCourse = isFreeCourse;
  if (subscriptionPlans !== undefined) course.subscriptionPlans = subscriptionPlans;
  if (requirements !== undefined) course.requirements = requirements;
  if (whatYouWillLearn !== undefined) course.whatYouWillLearn = whatYouWillLearn;
  if (targetAudience !== undefined) course.targetAudience = targetAudience;
  if (tags !== undefined) course.tags = tags;
  if (certificateSettings !== undefined) course.certificateSettings = certificateSettings;

  const updated = await course.save();

  securityLog('COURSE_UPDATED', {
    userId: req.user._id,
    courseId: course._id,
    ip: req.ip
  });

  res.json({
    success: true,
    message: 'Course updated successfully',
    data: transformCourse(updated)
  });
});

// =============================================
// PRIVATE: UPDATE THUMBNAIL
// =============================================
export const updateCourseThumbnail = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload an image file');
  }

  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!checkOwnership(course, req.user)) {
    res.status(403);
    throw new Error('Not authorized to update this course');
  }

  course.thumbnail = `thumbnails/${req.file.filename}`;
  await course.save();

  res.json({
    success: true,
    message: 'Thumbnail updated successfully',
    data: { thumbnail: getFullImageUrl(course.thumbnail) }
  });
});

// =============================================
// PRIVATE: DELETE COURSE
// =============================================
export const deleteCourse = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid course ID format');
  }

  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!checkOwnership(course, req.user)) {
    securityLog('UNAUTHORIZED_COURSE_DELETE', {
      userId: req.user._id,
      courseId: course._id,
      ip: req.ip
    });
    res.status(403);
    throw new Error('Not authorized to delete this course');
  }

  // ✅ Check active enrollments
  const activeEnrollments = await Enrollment.countDocuments({
    course: course._id,
    status: 'active'
  });

  if (activeEnrollments > 0 && req.user.role !== 'admin') {
    res.status(400);
    throw new Error(
      `Cannot delete course with ${activeEnrollments} active enrollment(s). Contact admin.`
    );
  }

  // ✅ Log before deletion
  securityLog('COURSE_DELETED', {
    userId: req.user._id,
    courseId: course._id,
    courseTitle: course.title,
    enrollments: activeEnrollments,
    ip: req.ip
  });

  // ✅ Clean up lectures
  await Lecture.deleteMany({ course: course._id });

  await course.deleteOne();

  res.json({
    success: true,
    message: 'Course deleted successfully'
  });
});

// =============================================
// PRIVATE: TOGGLE PUBLISH
// =============================================
export const togglePublish = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!checkOwnership(course, req.user)) {
    res.status(403);
    throw new Error('Not authorized');
  }

  // ✅ Check requirements before publishing
  if (!course.isPublished) {
    const lectureCount = await Lecture.countDocuments({
      course: course._id,
      isPublished: true
    });

    if (lectureCount === 0) {
      res.status(400);
      throw new Error('Course must have at least one published lecture before publishing');
    }

    if (!course.title || !course.description || !course.category) {
      res.status(400);
      throw new Error('Course must have title, description, and category before publishing');
    }

    course.publishedAt = course.publishedAt || new Date();
  }

  course.isPublished = !course.isPublished;
  await course.save();

  securityLog('COURSE_PUBLISH_TOGGLED', {
    userId: req.user._id,
    courseId: course._id,
    isPublished: course.isPublished,
    ip: req.ip
  });

  res.json({
    success: true,
    data: {
      isPublished: course.isPublished,
      publishedAt: course.publishedAt
    },
    message: `Course ${course.isPublished ? 'published' : 'unpublished'} successfully`
  });
});

// =============================================
// PRIVATE: TOGGLE FEATURED (Admin only)
// =============================================
export const toggleFeatured = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  course.isFeatured = !course.isFeatured;
  await course.save();

  res.json({
    success: true,
    data: { isFeatured: course.isFeatured },
    message: `Course ${course.isFeatured ? 'featured' : 'unfeatured'} successfully`
  });
});

// =============================================
// PRIVATE: ADD SECTION
// =============================================
export const addSection = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  // ✅ Validation done by middleware
  const { sectionTitle, sectionDescription } = req.body;

  const course = await Course.findById(req.params.id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!checkOwnership(course, req.user)) {
    res.status(403);
    throw new Error('Not authorized');
  }

  // ✅ Max sections limit
  if (course.curriculum.length >= 50) {
    res.status(400);
    throw new Error('Maximum 50 sections allowed per course');
  }

  course.curriculum.push({
    sectionTitle,
    sectionDescription: sectionDescription || '',
    lectures: [],
    order: course.curriculum.length
  });

  await course.save();

  res.status(201).json({
    success: true,
    message: 'Section added successfully',
    data: course.curriculum
  });
});

// =============================================
// PRIVATE: UPDATE SECTION
// =============================================
export const updateSection = asyncHandler(async (req, res) => {
  const { id, sectionIndex } = req.params;
  const idx = parseInt(sectionIndex);

  if (!isValidId(id)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  if (isNaN(idx) || idx < 0) {
    res.status(400);
    throw new Error('Invalid section index');
  }

  const { sectionTitle, sectionDescription } = req.body;

  const course = await Course.findById(id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.curriculum[idx]) {
    res.status(404);
    throw new Error('Section not found');
  }

  if (!checkOwnership(course, req.user)) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (sectionTitle) course.curriculum[idx].sectionTitle = sectionTitle;
  if (sectionDescription !== undefined) {
    course.curriculum[idx].sectionDescription = sectionDescription;
  }

  course.markModified('curriculum');
  await course.save();

  res.json({
    success: true,
    message: 'Section updated successfully',
    data: course.curriculum
  });
});

// =============================================
// PRIVATE: DELETE SECTION
// =============================================
export const deleteSection = asyncHandler(async (req, res) => {
  const { id, sectionIndex } = req.params;
  const idx = parseInt(sectionIndex);

  if (!isValidId(id)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  if (isNaN(idx) || idx < 0) {
    res.status(400);
    throw new Error('Invalid section index');
  }

  const course = await Course.findById(id);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.curriculum[idx]) {
    res.status(404);
    throw new Error('Section not found');
  }

  if (!checkOwnership(course, req.user)) {
    res.status(403);
    throw new Error('Not authorized');
  }

  // ✅ Delete lectures in this section
  const lectureIds = course.curriculum[idx].lectures;
  if (lectureIds?.length > 0) {
    await Lecture.deleteMany({ _id: { $in: lectureIds } });
  }

  course.curriculum.splice(idx, 1);

  // ✅ Recalculate total lectures
  const totalLectures = await Lecture.countDocuments({ course: course._id });
  course.totalLectures = totalLectures;

  await course.save();

  res.json({
    success: true,
    message: 'Section and its lectures deleted successfully'
  });
});

// =============================================
// PRIVATE: GET INSTRUCTOR COURSES
// =============================================
export const getInstructorCourses = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status, search } = req.query;

  const query = { instructor: req.user._id };

  if (status === 'published') query.isPublished = true;
  else if (status === 'draft') query.isPublished = false;

  if (search && search.trim()) {
    const escaped = escapeRegex(search.trim());
    query.title = { $regex: new RegExp(escaped, 'i') };
  }

  const [total, courses] = await Promise.all([
    Course.countDocuments(query),
    Course.find(query)
      .populate('category', 'name')
      .select('-curriculum -certificateSettings')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({
    success: true,
    data: courses.map((c) => ({
      ...c,
      thumbnail: getFullImageUrl(c.thumbnail)
    })),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// =============================================
// ADMIN: GET ALL COURSES
// =============================================
export const getAllCoursesAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status, search, category, instructor } = req.query;

  const query = {};

  if (status === 'published') query.isPublished = true;
  else if (status === 'draft') query.isPublished = false;

  if (search && search.trim()) {
    const escaped = escapeRegex(search.trim());
    query.$or = [
      { title: { $regex: new RegExp(escaped, 'i') } },
      { tags: { $regex: new RegExp(escaped, 'i') } }
    ];
  }

  if (category && category !== 'all') {
    const categoryId = await getCategoryId(category);
    if (categoryId) query.category = categoryId;
  }

  if (instructor && isValidId(instructor)) {
    query.instructor = new mongoose.Types.ObjectId(instructor);
  }

  const [total, courses] = await Promise.all([
    Course.countDocuments(query),
    Course.find(query)
      .populate('instructor', 'firstName lastName email avatar')
      .populate('category', 'name')
      .select('-curriculum -certificateSettings')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({
    success: true,
    data: courses.map((c) => ({
      ...c,
      thumbnail: getFullImageUrl(c.thumbnail),
      instructor: c.instructor
        ? { ...c.instructor, avatar: getFullImageUrl(c.instructor.avatar) }
        : null
    })),
    pagination: buildPaginationResponse(total, page, limit)
  });
});