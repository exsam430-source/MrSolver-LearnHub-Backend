// controllers/siteController.js
import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Category from '../models/Category.js';
import Review from '../models/Review.js';
import { getFullImageUrl } from '../utils/imageHelper.js';

// @desc    Get home page data (stats + testimonials)
// @route   GET /api/site/home
// @access  Public
export const getHomeData = asyncHandler(async (req, res) => {
  console.log('📍 GET /api/site/home called');

  // Fetch all data in parallel for better performance
  const [
    studentsCount,
    instructorsCount,
    publishedCoursesCount,
    categoriesCount,
    avgRatingAgg,
    testimonials
  ] = await Promise.all([
    User.countDocuments({ role: 'student', isActive: true }),
    User.countDocuments({ role: 'instructor', isActive: true }),
    Course.countDocuments({ isPublished: true }),
    Category.countDocuments({ isActive: true }),
    Review.aggregate([
      { $match: { isApproved: true } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]),
    Review.find({ isApproved: true })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('student', 'firstName lastName avatar')
      .populate('course', 'title slug')
      .select('rating title comment createdAt student course')
  ]);

  // Extract rating data
  const avgRating = avgRatingAgg?.[0]?.avg || 0;
  const reviewsCount = avgRatingAgg?.[0]?.count || 0;

  // ✅ Transform testimonials with full image URLs
  const transformedTestimonials = testimonials.map(t => {
    const obj = t.toObject ? t.toObject() : t;
    return {
      ...obj,
      student: obj.student ? {
        ...obj.student,
        avatar: getFullImageUrl(obj.student.avatar)
      } : obj.student
    };
  });

  // Debug log
  console.log('📊 Home Data Stats:', {
    students: studentsCount,
    instructors: instructorsCount,
    courses: publishedCoursesCount,
    categories: categoriesCount,
    avgRating: Math.round(avgRating * 10) / 10,
    reviews: reviewsCount,
    testimonials: transformedTestimonials.length
  });

  res.json({
    success: true,
    data: {
      stats: {
        students: studentsCount,
        instructors: instructorsCount,
        publishedCourses: publishedCoursesCount,
        categories: categoriesCount,
        avgRating: Math.round(avgRating * 10) / 10,
        reviewsCount
      },
      testimonials: transformedTestimonials
    }
  });
});

// @desc    Get featured courses for home page
// @route   GET /api/site/featured-courses
// @access  Public
export const getFeaturedCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({ 
    isPublished: true, 
    isFeatured: true 
  })
    .populate('instructor', 'firstName lastName avatar')
    .populate('category', 'name slug')
    .select('-curriculum')
    .limit(8)
    .sort({ enrollmentCount: -1 });

  // ✅ Transform courses with full image URLs
  const transformedCourses = courses.map(course => {
    const obj = course.toObject ? course.toObject() : course;
    return {
      ...obj,
      thumbnail: getFullImageUrl(obj.thumbnail),
      instructor: obj.instructor ? {
        ...obj.instructor,
        avatar: getFullImageUrl(obj.instructor.avatar)
      } : obj.instructor
    };
  });

  res.json({
    success: true,
    data: transformedCourses
  });
});

// @desc    Get active categories for home page
// @route   GET /api/site/categories
// @access  Public
export const getHomeCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true })
    .sort({ order: 1, name: 1 })
    .limit(6);

  // Get course count for each category
  const categoriesWithCount = await Promise.all(
    categories.map(async (category) => {
      const coursesCount = await Course.countDocuments({
        category: category._id,
        isPublished: true
      });
      
      const obj = category.toObject ? category.toObject() : category;
      
      return {
        ...obj,
        image: getFullImageUrl(obj.image),
        coursesCount
      };
    })
  );

  res.json({
    success: true,
    data: categoriesWithCount
  });
});