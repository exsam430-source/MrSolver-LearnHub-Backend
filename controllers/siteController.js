// controllers/siteController.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Category from '../models/Category.js';
import Review from '../models/Review.js';
import { getFullImageUrl } from '../utils/imageHelper.js';

// ✅ Simple in-memory cache (5 min TTL)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCache = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return item.data;
};

const setCache = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};

// ✅ Transform user with avatar
const transformUser = (user) => {
  if (!user) return user;
  return {
    ...user,
    avatar: getFullImageUrl(user.avatar),
  };
};

// ✅ Transform course with thumbnail
const transformCourse = (course) => {
  if (!course) return course;
  return {
    ...course,
    thumbnail:  getFullImageUrl(course.thumbnail),
    instructor: course.instructor
      ? transformUser(course.instructor)
      : course.instructor,
  };
};

// ============================================
// GET HOME DATA
// @route GET /api/site/home
// @access Public
// ============================================
export const getHomeData = asyncHandler(async (req, res) => {
  // ✅ Check cache first
  const cached = getCache('homeData');
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  // ✅ Import Service model dynamically to avoid circular deps
  const Service = (await import('../models/Service.js')).default;
  const Project = (await import('../models/Project.js')).default;

  const [
    studentsCount,
    instructorsCount,
    publishedCoursesCount,
    categoriesCount,
    avgRatingAgg,
    testimonials,
    featuredServices,
    featuredProjects,
    servicesCount,
    projectsCount,
  ] = await Promise.all([
    User.countDocuments({ role: 'student', isActive: true }),
    User.countDocuments({ role: 'instructor', isActive: true }),
    Course.countDocuments({ isPublished: true }),
    Category.countDocuments({ isActive: true }),

    Review.aggregate([
      { $match: { isApproved: true } },
      {
        $group: {
          _id: null,
          avg: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]),

    Review.find({ isApproved: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate('student', 'firstName lastName avatar')
      .populate('course', 'title slug')
      .select('rating title comment createdAt student course')
      .lean(),

    // ✅ Featured services (max 6)
    Service.find({ isPublished: true, isFeatured: true })
      .sort({ order: 1 })
      .limit(6)
      .lean(),

    // ✅ Featured projects (max 6)
    Project.find({ isPublished: true, isFeatured: true })
      .sort({ order: 1 })
      .limit(6)
      .lean(),

    Service.countDocuments({ isPublished: true }),
    Project.countDocuments({ isPublished: true }),
  ]);

  const avgRating = avgRatingAgg[0]?.avg || 0;
  const reviewsCount = avgRatingAgg[0]?.count || 0;

  // Transform testimonials
  const transformedTestimonials = testimonials.map((t) => ({
    ...t,
    student: t.student ? transformUser(t.student) : t.student,
  }));

  // Transform services & projects
  const transformedServices = featuredServices.map((s) => ({
    ...s,
    thumbnail: getFullImageUrl(s.thumbnail),
    coverImage: s.coverImage ? getFullImageUrl(s.coverImage) : null,
  }));

  const transformedProjects = featuredProjects.map((p) => ({
    ...p,
    thumbnail: getFullImageUrl(p.thumbnail),
  }));

  const data = {
    stats: {
      students: studentsCount,
      instructors: instructorsCount,
      publishedCourses: publishedCoursesCount,
      categories: categoriesCount,
      avgRating: Math.round(avgRating * 10) / 10,
      reviewsCount,
      services: servicesCount,
      projects: projectsCount,
    },
    testimonials: transformedTestimonials,
    featuredServices: transformedServices,
    featuredProjects: transformedProjects,
  };

  setCache('homeData', data);

  res.json({ success: true, data });
});

// ============================================
// GET FEATURED COURSES
// @route GET /api/site/featured-courses
// @access Public
// ============================================
export const getFeaturedCourses = asyncHandler(async (req, res) => {
  // ✅ Check cache
  const cached = getCache('featuredCourses');
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  const courses = await Course.find({
    isPublished: true,
    isFeatured:  true,
  })
    .populate('instructor', 'firstName lastName avatar')
    .populate('category',   'name slug')
    .select('-curriculum')
    .limit(8)
    .sort({ enrollmentCount: -1 })
    .lean();

  // ✅ If no featured, get top enrolled
  const finalCourses = courses.length > 0
    ? courses
    : await Course.find({ isPublished: true })
        .populate('instructor', 'firstName lastName avatar')
        .populate('category',   'name slug')
        .select('-curriculum')
        .limit(8)
        .sort({ enrollmentCount: -1 })
        .lean();

  const transformed = finalCourses.map(transformCourse);

  setCache('featuredCourses', transformed);

  res.json({ success: true, data: transformed });
});

// ============================================
// GET HOME CATEGORIES
// @route GET /api/site/categories
// @access Public
// ============================================
export const getHomeCategories = asyncHandler(async (req, res) => {
  // ✅ Check cache
  const cached = getCache('homeCategories');
  if (cached) {
    return res.json({ success: true, data: cached, cached: true });
  }

  const categories = await Category.find({ isActive: true })
    .sort({ order: 1, name: 1 })
    .limit(8)
    .lean();

  // ✅ Get course counts in parallel
  const categoriesWithCount = await Promise.all(
    categories.map(async (category) => {
      const coursesCount = await Course.countDocuments({
        category:    category._id,
        isPublished: true,
      });

      return {
        ...category,
        image:       getFullImageUrl(category.image),
        coursesCount,
      };
    })
  );

  setCache('homeCategories', categoriesWithCount);

  res.json({ success: true, data: categoriesWithCount });
});