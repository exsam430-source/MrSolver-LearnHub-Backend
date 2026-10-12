// controllers/dashboardController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Payment from '../models/Payment.js';
import Review from '../models/Review.js';
import Announcement from '../models/Announcement.js';
import { securityLog } from '../middleware/auditLog.js';

// ============================================
// HELPERS
// ============================================

// ✅ Get start of current month
const getStartOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// ✅ Get start of today
const getStartOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// ✅ Get N months ago
const getMonthsAgo = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

// ✅ Safe aggregate - returns 0 on error
const safeAggregate = async (model, pipeline) => {
  try {
    const result = await model.aggregate(pipeline);
    return result;
  } catch (err) {
    console.error('Aggregate error:', err.message);
    return [];
  }
};

// ============================================
// ADMIN DASHBOARD
// @route GET /api/dashboard/admin
// @access Private/Admin
// ============================================
export const getAdminDashboard = asyncHandler(async (req, res) => {
  const startOfMonth = getStartOfMonth();
  const sixMonthsAgo = getMonthsAgo(6);

  // ✅ Run all counts in parallel
  const [
    totalUsers,
    totalStudents,
    totalInstructors,
    activeUsers,
    totalCourses,
    publishedCourses,
    draftCourses,
    totalEnrollments,
    activeEnrollments,
    completedEnrollments,
    totalPayments,
    pendingPayments,
    approvedPayments,
    newUsersThisMonth,
    enrollmentsThisMonth,
    revenueResult,
    monthlyRevenueResult,
    recentEnrollments,
    recentPayments,
    topCourses,
    enrollmentTrend,
    revenueTrend,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'instructor' }),
    User.countDocuments({ isActive: true }),
    Course.countDocuments(),
    Course.countDocuments({ isPublished: true }),
    Course.countDocuments({ isPublished: false }),
    Enrollment.countDocuments(),
    Enrollment.countDocuments({ status: 'active' }),
    Enrollment.countDocuments({ status: 'completed' }),
    Payment.countDocuments(),
    Payment.countDocuments({ status: 'pending' }),
    Payment.countDocuments({ status: 'approved' }),
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Enrollment.countDocuments({ createdAt: { $gte: startOfMonth } }),

    // Revenue
    safeAggregate(Payment, [
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),

    // Monthly revenue
    safeAggregate(Payment, [
      { $match: { status: 'approved', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),

    // Recent enrollments
    Enrollment.find()
      .populate('student', 'firstName lastName email avatar')
      .populate('course', 'title slug thumbnail')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),

    // Recent payments
    Payment.find()
      .populate('student', 'firstName lastName email')
      .populate('course', 'title thumbnail')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),

    // Top courses
    Course.find({ isPublished: true })
      .select('title enrollmentCount rating thumbnail slug')
      .sort({ enrollmentCount: -1 })
      .limit(5)
      .lean(),

    // Enrollment trend
    safeAggregate(Enrollment, [
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),

    // Revenue trend
    safeAggregate(Payment, [
      {
        $match: {
          status:    'approved',
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
          },
          amount: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      users: {
        total:        totalUsers,
        students:     totalStudents,
        instructors:  totalInstructors,
        active:       activeUsers,
        newThisMonth: newUsersThisMonth,
      },
      courses: {
        total:     totalCourses,
        published: publishedCourses,
        draft:     draftCourses,
      },
      enrollments: {
        total:     totalEnrollments,
        active:    activeEnrollments,
        completed: completedEnrollments,
        thisMonth: enrollmentsThisMonth,
      },
      payments: {
        total:    totalPayments,
        pending:  pendingPayments,
        approved: approvedPayments,
      },
      revenue: {
        total:   revenueResult[0]?.total   || 0,
        monthly: monthlyRevenueResult[0]?.total || 0,
      },
      recentEnrollments,
      recentPayments,
      topCourses,
      trends: {
        enrollments: enrollmentTrend,
        revenue:     revenueTrend,
      },
    },
  });
});

// ============================================
// INSTRUCTOR DASHBOARD
// @route GET /api/dashboard/instructor
// @access Private/Instructor
// ============================================
export const getInstructorDashboard = asyncHandler(async (req, res) => {
  const instructorId = req.user._id;
  const startOfMonth = getStartOfMonth();
  const sixMonthsAgo = getMonthsAgo(6);

  // ✅ Get instructor course IDs first
  const instructorCourses = await Course.find({
    instructor: instructorId,
  }).select('_id title enrollmentCount rating thumbnail isPublished slug');

  const courseIds = instructorCourses.map((c) => c._id);

  if (courseIds.length === 0) {
    return res.json({
      success: true,
      data: {
        courses:           { total: 0, published: 0 },
        students:          { total: 0, active: 0, newThisMonth: 0 },
        revenue:           { total: 0, monthly: 0 },
        reviews:           { total: 0, averageRating: 0 },
        recentEnrollments: [],
        recentReviews:     [],
        coursePerformance: [],
        enrollmentTrend:   [],
      },
    });
  }

  // ✅ Run all queries in parallel
  const [
    totalCourses,
    publishedCourses,
    totalEnrollments,
    activeStudents,
    enrollmentsThisMonth,
    totalReviews,
    revenueResult,
    monthlyRevenueResult,
    avgRatingResult,
    recentEnrollments,
    recentReviews,
    enrollmentTrend,
  ] = await Promise.all([
    Course.countDocuments({ instructor: instructorId }),
    Course.countDocuments({ instructor: instructorId, isPublished: true }),

    Enrollment.countDocuments({ course: { $in: courseIds } }),
    Enrollment.countDocuments({
      course: { $in: courseIds },
      status: 'active',
    }),
    Enrollment.countDocuments({
      course:    { $in: courseIds },
      createdAt: { $gte: startOfMonth },
    }),

    Review.countDocuments({
      course:     { $in: courseIds },
      isApproved: true,
    }),

    safeAggregate(Payment, [
      { $match: { course: { $in: courseIds }, status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),

    safeAggregate(Payment, [
      {
        $match: {
          course:    { $in: courseIds },
          status:    'approved',
          createdAt: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),

    safeAggregate(Review, [
      { $match: { course: { $in: courseIds }, isApproved: true } },
      { $group: { _id: null, avg: { $avg: '$rating' } } },
    ]),

    Enrollment.find({ course: { $in: courseIds } })
      .populate('student', 'firstName lastName email avatar')
      .populate('course', 'title slug thumbnail')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    Review.find({ course: { $in: courseIds }, isApproved: true })
      .populate('student', 'firstName lastName avatar')
      .populate('course', 'title slug')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),

    safeAggregate(Enrollment, [
      {
        $match: {
          course:    { $in: courseIds },
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  const averageRating = avgRatingResult[0]?.avg || 0;

  res.json({
    success: true,
    data: {
      courses: {
        total:     totalCourses,
        published: publishedCourses,
      },
      students: {
        total:        totalEnrollments,
        active:       activeStudents,
        newThisMonth: enrollmentsThisMonth,
      },
      revenue: {
        total:   revenueResult[0]?.total        || 0,
        monthly: monthlyRevenueResult[0]?.total || 0,
      },
      reviews: {
        total:         totalReviews,
        averageRating: Math.round(averageRating * 10) / 10,
      },
      recentEnrollments,
      recentReviews,
      coursePerformance: instructorCourses,
      enrollmentTrend,
    },
  });
});

// ============================================
// STUDENT DASHBOARD
// @route GET /api/dashboard/student
// @access Private
// ============================================
export const getStudentDashboard = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  const [
    totalEnrollments,
    activeEnrollments,
    completedCourses,
    inProgressCourses,
    completedCoursesList,
    certificates,
    user,
    announcements,
    pendingPayments,
  ] = await Promise.all([
    Enrollment.countDocuments({ student: studentId }),
    Enrollment.countDocuments({ student: studentId, status: 'active' }),
    Enrollment.countDocuments({ student: studentId, status: 'completed' }),

    Enrollment.find({ student: studentId, status: 'active' })
      .populate({
        path:     'course',
        select:   'title slug thumbnail instructor totalLectures duration',
        populate: { path: 'instructor', select: 'firstName lastName avatar' },
      })
      .sort({ 'progress.lastAccessed': -1 })
      .limit(4)
      .lean(),

    Enrollment.find({ student: studentId, status: 'completed' })
      .populate('course', 'title slug thumbnail')
      .sort({ completedAt: -1 })
      .limit(4)
      .lean(),

    Enrollment.find({
      student:        studentId,
      status:         'completed',
      certificateUrl: { $exists: true, $ne: null },
    })
      .populate('course', 'title slug thumbnail')
      .select('course certificateUrl certificateIssuedAt completedAt')
      .lean(),

    User.findById(studentId)
      .populate({
        path:   'wishlist',
        select: 'title slug thumbnail price discountPrice rating',
        populate: { path: 'instructor', select: 'firstName lastName' },
      })
      .select('wishlist')
      .lean(),

    // ✅ Fixed: Only one $or allowed - merge conditions
    Announcement.find({
      isPublished:    true,
      targetAudience: { $in: ['all', 'students'] },
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    })
      .populate('author', 'firstName lastName')
      .sort({ isPinned: -1, createdAt: -1 })
      .limit(3)
      .lean(),

    Payment.find({
      student: studentId,
      status:  { $in: ['pending', 'under_review'] },
    })
      .populate('course', 'title slug thumbnail')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  // ✅ Calculate total completed lectures
  const totalCompletedLectures = inProgressCourses.reduce(
    (acc, e) => acc + (e.progress?.completedLectures?.length || 0),
    0
  );

  res.json({
    success: true,
    data: {
      stats: {
        totalEnrollments,
        activeEnrollments,
        completedCourses,
        completedLectures:  totalCompletedLectures,
        certificatesEarned: certificates.length,
      },
      inProgressCourses,
      completedCoursesList,
      certificates,
      wishlist:       user?.wishlist || [],
      announcements,
      pendingPayments,
    },
  });
});

// ============================================
// QUICK STATS
// @route GET /api/dashboard/quick-stats
// @access Private/Admin
// ============================================
export const getQuickStats = asyncHandler(async (req, res) => {
  const todayStart = getStartOfToday();

  const [
    pendingPayments,
    pendingEnrollments,
    newUsersToday,
    newEnrollmentsToday,
    pendingReviews,
  ] = await Promise.all([
    Payment.countDocuments({ status: 'pending' }),
    Enrollment.countDocuments({ status: 'pending' }),
    User.countDocuments({ createdAt: { $gte: todayStart } }),
    Enrollment.countDocuments({ createdAt: { $gte: todayStart } }),
    Review.countDocuments({ isApproved: false }),
  ]);

  res.json({
    success: true,
    data: {
      pendingPayments,
      pendingEnrollments,
      newUsersToday,
      newEnrollmentsToday,
      pendingReviews,
    },
  });
});

// ============================================
// REVENUE ANALYTICS
// @route GET /api/dashboard/revenue-analytics
// @access Private/Admin
// ============================================
export const getRevenueAnalytics = asyncHandler(async (req, res) => {
  // ✅ Whitelist allowed periods
  const ALLOWED_PERIODS = new Set(['1month', '3months', '6months', '1year']);
  const period = ALLOWED_PERIODS.has(req.query.period)
    ? req.query.period
    : '6months';

  const startDate = new Date();
  switch (period) {
    case '1month':  startDate.setMonth(startDate.getMonth()       -  1); break;
    case '3months': startDate.setMonth(startDate.getMonth()       -  3); break;
    case '1year':   startDate.setFullYear(startDate.getFullYear() -  1); break;
    default:        startDate.setMonth(startDate.getMonth()       -  6); break;
  }

  const matchApproved = {
    status:    'approved',
    createdAt: { $gte: startDate },
  };

  const [dailyRevenue, revenueByMethod, topEarningCourses] =
    await Promise.all([

      safeAggregate(Payment, [
        { $match: matchApproved },
        {
          $group: {
            _id: {
              year:  { $year:          '$createdAt' },
              month: { $month:         '$createdAt' },
              day:   { $dayOfMonth:    '$createdAt' },
            },
            amount: { $sum: '$amount' },
            count:  { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
      ]),

      safeAggregate(Payment, [
        { $match: matchApproved },
        {
          $group: {
            _id:    '$paymentMethod',
            amount: { $sum: '$amount' },
            count:  { $sum: 1 },
          },
        },
      ]),

      safeAggregate(Payment, [
        { $match: matchApproved },
        {
          $group: {
            _id:          '$course',
            totalRevenue: { $sum: '$amount' },
            enrollments:  { $sum: 1 },
          },
        },
        { $sort: { totalRevenue: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from:         'courses',
            localField:   '_id',
            foreignField: '_id',
            as:           'course',
          },
        },
        { $unwind: '$course' },
        {
          $project: {
            _id:           1,
            totalRevenue:  1,
            enrollments:   1,
            'course.title':     1,
            'course.slug':      1,
            'course.thumbnail': 1,
          },
        },
      ]),
    ]);

  res.json({
    success: true,
    data: {
      period,
      dailyRevenue,
      revenueByMethod,
      topEarningCourses,
    },
  });
});