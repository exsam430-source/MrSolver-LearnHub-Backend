import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import Payment from '../models/Payment.js';
import Review from '../models/Review.js';
import Announcement from '../models/Announcement.js';

// @desc    Get admin dashboard stats
// @route   GET /api/dashboard/admin
// @access  Private/Admin
export const getAdminDashboard = asyncHandler(async (req, res) => {
  // User stats
  const totalUsers = await User.countDocuments();
  const totalStudents = await User.countDocuments({ role: 'student' });
  const totalInstructors = await User.countDocuments({ role: 'instructor' });
  const activeUsers = await User.countDocuments({ isActive: true });

  // Course stats
  const totalCourses = await Course.countDocuments();
  const publishedCourses = await Course.countDocuments({ isPublished: true });
  const draftCourses = await Course.countDocuments({ isPublished: false });

  // Enrollment stats
  const totalEnrollments = await Enrollment.countDocuments();
  const activeEnrollments = await Enrollment.countDocuments({ status: 'active' });
  const completedEnrollments = await Enrollment.countDocuments({ status: 'completed' });

  // Payment stats
  const totalPayments = await Payment.countDocuments();
  const pendingPayments = await Payment.countDocuments({ status: 'pending' });
  const approvedPayments = await Payment.countDocuments({ status: 'approved' });

  // Revenue calculation
  const revenueResult = await Payment.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalRevenue = revenueResult[0]?.total || 0;

  // This month stats
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const newUsersThisMonth = await User.countDocuments({
    createdAt: { $gte: startOfMonth }
  });

  const enrollmentsThisMonth = await Enrollment.countDocuments({
    createdAt: { $gte: startOfMonth }
  });

  const monthlyRevenueResult = await Payment.aggregate([
    { 
      $match: { 
        status: 'approved',
        createdAt: { $gte: startOfMonth }
      } 
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

  // Recent enrollments
  const recentEnrollments = await Enrollment.find()
    .populate('student', 'firstName lastName email avatar')
    .populate('course', 'title slug')
    .sort({ createdAt: -1 })
    .limit(5);

  // Recent payments
  const recentPayments = await Payment.find()
    .populate('student', 'firstName lastName email')
    .populate('course', 'title')
    .sort({ createdAt: -1 })
    .limit(5);

  // Top courses by enrollment
  const topCourses = await Course.find({ isPublished: true })
    .select('title enrollmentCount rating thumbnail slug')
    .sort({ enrollmentCount: -1 })
    .limit(5);

  // Monthly enrollment trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const enrollmentTrend = await Enrollment.aggregate([
    { $match: { createdAt: { $gte: sixMonthsAgo } } },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  // Revenue trend (last 6 months)
  const revenueTrend = await Payment.aggregate([
    { 
      $match: { 
        status: 'approved',
        createdAt: { $gte: sixMonthsAgo }
      } 
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        amount: { $sum: '$amount' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  res.json({
    success: true,
    data: {
      users: {
        total: totalUsers,
        students: totalStudents,
        instructors: totalInstructors,
        active: activeUsers,
        newThisMonth: newUsersThisMonth
      },
      courses: {
        total: totalCourses,
        published: publishedCourses,
        draft: draftCourses
      },
      enrollments: {
        total: totalEnrollments,
        active: activeEnrollments,
        completed: completedEnrollments,
        thisMonth: enrollmentsThisMonth
      },
      payments: {
        total: totalPayments,
        pending: pendingPayments,
        approved: approvedPayments
      },
      revenue: {
        total: totalRevenue,
        monthly: monthlyRevenue
      },
      recentEnrollments,
      recentPayments,
      topCourses,
      trends: {
        enrollments: enrollmentTrend,
        revenue: revenueTrend
      }
    }
  });
});

// @desc    Get instructor dashboard stats
// @route   GET /api/dashboard/instructor
// @access  Private/Instructor
export const getInstructorDashboard = asyncHandler(async (req, res) => {
  const instructorId = req.user._id;

  // Course stats
  const totalCourses = await Course.countDocuments({ instructor: instructorId });
  const publishedCourses = await Course.countDocuments({ 
    instructor: instructorId, 
    isPublished: true 
  });

  // Get instructor's course IDs
  const instructorCourses = await Course.find({ instructor: instructorId }).select('_id');
  const courseIds = instructorCourses.map(c => c._id);

  // Enrollment stats
  const totalEnrollments = await Enrollment.countDocuments({ 
    course: { $in: courseIds } 
  });

  const activeStudents = await Enrollment.countDocuments({ 
    course: { $in: courseIds },
    status: 'active'
  });

  // Revenue
  const revenueResult = await Payment.aggregate([
    { 
      $match: { 
        course: { $in: courseIds },
        status: 'approved'
      } 
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalRevenue = revenueResult[0]?.total || 0;

  // This month stats
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const enrollmentsThisMonth = await Enrollment.countDocuments({
    course: { $in: courseIds },
    createdAt: { $gte: startOfMonth }
  });

  const monthlyRevenueResult = await Payment.aggregate([
    { 
      $match: { 
        course: { $in: courseIds },
        status: 'approved',
        createdAt: { $gte: startOfMonth }
      } 
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

  // Reviews stats
  const totalReviews = await Review.countDocuments({ 
    course: { $in: courseIds },
    isApproved: true
  });

  const avgRatingResult = await Review.aggregate([
    { $match: { course: { $in: courseIds }, isApproved: true } },
    { $group: { _id: null, avg: { $avg: '$rating' } } }
  ]);
  const averageRating = avgRatingResult[0]?.avg || 0;

  // Recent enrollments
  const recentEnrollments = await Enrollment.find({ 
    course: { $in: courseIds } 
  })
    .populate('student', 'firstName lastName email avatar')
    .populate('course', 'title slug')
    .sort({ createdAt: -1 })
    .limit(10);

  // Recent reviews
  const recentReviews = await Review.find({ 
    course: { $in: courseIds },
    isApproved: true
  })
    .populate('student', 'firstName lastName avatar')
    .populate('course', 'title slug')
    .sort({ createdAt: -1 })
    .limit(5);

  // Course performance
  const coursePerformance = await Course.find({ instructor: instructorId })
    .select('title enrollmentCount rating thumbnail isPublished slug')
    .sort({ enrollmentCount: -1 });

  // Enrollment trend (last 6 months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const enrollmentTrend = await Enrollment.aggregate([
    { 
      $match: { 
        course: { $in: courseIds },
        createdAt: { $gte: sixMonthsAgo }
      } 
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  res.json({
    success: true,
    data: {
      courses: {
        total: totalCourses,
        published: publishedCourses
      },
      students: {
        total: totalEnrollments,
        active: activeStudents,
        newThisMonth: enrollmentsThisMonth
      },
      revenue: {
        total: totalRevenue,
        monthly: monthlyRevenue
      },
      reviews: {
        total: totalReviews,
        averageRating: Math.round(averageRating * 10) / 10
      },
      recentEnrollments,
      recentReviews,
      coursePerformance,
      enrollmentTrend
    }
  });
});

// @desc    Get student dashboard stats
// @route   GET /api/dashboard/student
// @access  Private
export const getStudentDashboard = asyncHandler(async (req, res) => {
  const studentId = req.user._id;

  // Enrollment stats
  const totalEnrollments = await Enrollment.countDocuments({ 
    student: studentId 
  });

  const activeEnrollments = await Enrollment.countDocuments({ 
    student: studentId,
    status: 'active'
  });

  const completedCourses = await Enrollment.countDocuments({ 
    student: studentId,
    status: 'completed'
  });

  // In progress courses
  const inProgressCourses = await Enrollment.find({
    student: studentId,
    status: 'active'
  })
    .populate({
      path: 'course',
      select: 'title slug thumbnail instructor totalLectures duration',
      populate: {
        path: 'instructor',
        select: 'firstName lastName avatar'
      }
    })
    .sort({ 'progress.lastAccessed': -1 })
    .limit(4);

  // Completed courses
  const completedCoursesList = await Enrollment.find({
    student: studentId,
    status: 'completed'
  })
    .populate({
      path: 'course',
      select: 'title slug thumbnail'
    })
    .sort({ completedAt: -1 })
    .limit(4);

  // Calculate total completed lectures
  let totalCompletedLectures = 0;
  for (const enrollment of inProgressCourses) {
    totalCompletedLectures += enrollment.progress?.completedLectures?.length || 0;
  }

  // Certificates earned
  const certificates = await Enrollment.find({
    student: studentId,
    status: 'completed',
    certificateUrl: { $exists: true, $ne: null }
  })
    .populate('course', 'title slug thumbnail')
    .select('course certificateUrl certificateIssuedAt completedAt');

  // Get wishlist
  const user = await User.findById(studentId)
    .populate({
      path: 'wishlist',
      select: 'title slug thumbnail price discountPrice instructor rating',
      populate: {
        path: 'instructor',
        select: 'firstName lastName'
      }
    });

  // Recent announcements for students
  const announcements = await Announcement.find({
    isPublished: true,
    $or: [
      { targetAudience: 'all' },
      { targetAudience: 'students' }
    ],
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  })
    .populate('author', 'firstName lastName')
    .sort({ isPinned: -1, createdAt: -1 })
    .limit(3);

  // Pending payments
  const pendingPayments = await Payment.find({
    student: studentId,
    status: { $in: ['pending', 'under_review'] }
  })
    .populate('course', 'title slug thumbnail')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: {
      stats: {
        totalEnrollments,
        activeEnrollments,
        completedCourses,
        completedLectures: totalCompletedLectures,
        certificatesEarned: certificates.length
      },
      inProgressCourses,
      completedCoursesList,
      certificates,
      wishlist: user?.wishlist || [],
      announcements,
      pendingPayments
    }
  });
});

// @desc    Get quick stats for admin header
// @route   GET /api/dashboard/quick-stats
// @access  Private/Admin
export const getQuickStats = asyncHandler(async (req, res) => {
  const pendingPayments = await Payment.countDocuments({ status: 'pending' });
  const pendingEnrollments = await Enrollment.countDocuments({ status: 'pending' });
  
  // New users today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const newUsersToday = await User.countDocuments({
    createdAt: { $gte: todayStart }
  });

  // New enrollments today
  const newEnrollmentsToday = await Enrollment.countDocuments({
    createdAt: { $gte: todayStart }
  });

  // Pending reviews (if you want to moderate reviews)
  const pendingReviews = await Review.countDocuments({ isApproved: false });

  res.json({
    success: true,
    data: {
      pendingPayments,
      pendingEnrollments,
      newUsersToday,
      newEnrollmentsToday,
      pendingReviews
    }
  });
});

// @desc    Get revenue analytics
// @route   GET /api/dashboard/revenue-analytics
// @access  Private/Admin
export const getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { period = '6months' } = req.query;

  let startDate = new Date();
  if (period === '1month') {
    startDate.setMonth(startDate.getMonth() - 1);
  } else if (period === '3months') {
    startDate.setMonth(startDate.getMonth() - 3);
  } else if (period === '6months') {
    startDate.setMonth(startDate.getMonth() - 6);
  } else if (period === '1year') {
    startDate.setFullYear(startDate.getFullYear() - 1);
  }

  // Daily revenue for the period
  const dailyRevenue = await Payment.aggregate([
    {
      $match: {
        status: 'approved',
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);

  // Revenue by payment method
  const revenueByMethod = await Payment.aggregate([
    {
      $match: {
        status: 'approved',
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$paymentMethod',
        amount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Top earning courses
  const topEarningCourses = await Payment.aggregate([
    {
      $match: {
        status: 'approved',
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$course',
        totalRevenue: { $sum: '$amount' },
        enrollments: { $sum: 1 }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'courses',
        localField: '_id',
        foreignField: '_id',
        as: 'course'
      }
    },
    { $unwind: '$course' },
    {
      $project: {
        _id: 1,
        totalRevenue: 1,
        enrollments: 1,
        'course.title': 1,
        'course.slug': 1,
        'course.thumbnail': 1
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      dailyRevenue,
      revenueByMethod,
      topEarningCourses
    }
  });
});