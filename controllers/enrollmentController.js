// controllers/enrollmentController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import Lecture from '../models/Lecture.js';
import User from '../models/User.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import { sendEnrollmentConfirmation } from '../utils/emailService.js';
import { securityLog } from '../middleware/auditLog.js';

// ✅ Validate ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ✅ Escape regex
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ✅ Merge video segments helper
const mergeSegments = (segments) => {
  if (!segments?.length) return [];
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= last.end + 2) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
};

// =============================================
// ENROLL IN COURSE (Free courses ONLY)
// =============================================
export const enrollInCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.body;

  if (!courseId || !isValidId(courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const course = await Course.findById(courseId)
    .select('title price discountPrice isPublished isFreeCourse pricingType subscriptionPlans')
    .lean();

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.isPublished) {
    res.status(400);
    throw new Error('Course is not available for enrollment');
  }

  // ✅ FIX: Only truly free courses can bypass payment
  if (!course.isFreeCourse && course.pricingType !== 'free') {
    res.status(400);
    throw new Error(
      course.pricingType === 'subscription'
        ? 'This is a subscription course. Please submit payment to enroll.'
        : 'This is a paid course. Please complete payment to enroll.'
    );
  }

  // ✅ Check existing enrollment
  const existingEnrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId
  }).lean();

  if (existingEnrollment) {
    if (['active', 'completed'].includes(existingEnrollment.status)) {
      res.status(400);
      throw new Error('You are already enrolled in this course');
    }
    // Reactivate cancelled enrollment
    if (existingEnrollment.status === 'cancelled') {
      await Enrollment.findByIdAndUpdate(existingEnrollment._id, {
        status: 'active',
        paymentStatus: 'paid'
      });
      return res.json({
        success: true,
        message: 'Enrollment reactivated successfully'
      });
    }
  }

  const enrollment = await Enrollment.create({
    student: req.user._id,
    course: courseId,
    status: 'active',
    paymentStatus: 'paid',
    lectureProgress: [],
    codeSubmissions: [],
    zoomAttendance: [],
    bookmarks: [],
    stats: {
      totalWatchTime: 0,
      totalTimeSpent: 0,
      streakDays: 0,
      longestStreak: 0
    }
  });

  await Course.findByIdAndUpdate(courseId, {
    $inc: { enrollmentCount: 1 }
  });

  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { enrolledCourses: courseId }
  });

  setImmediate(async () => {
    try {
      await sendEnrollmentConfirmation(req.user, course);
    } catch (err) {
      console.error('Enrollment email failed:', err.message);
    }
  });

  securityLog('COURSE_ENROLLED', {
    userId: req.user._id,
    courseId,
    type: 'free',
    ip: req.ip
  });

  res.status(201).json({
    success: true,
    data: enrollment,
    message: 'Successfully enrolled in the course! 🎉'
  });
});

// =============================================
// GET MY ENROLLMENTS
// =============================================
export const getMyEnrollments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status } = req.query;

  const query = { student: req.user._id };

  const validStatuses = ['pending', 'active', 'completed', 'expired', 'cancelled'];
  if (status && status !== 'all' && validStatuses.includes(status)) {
    query.status = status;
  }

  const [total, enrollments] = await Promise.all([
    Enrollment.countDocuments(query),
    Enrollment.find(query)
      .populate({
        path: 'course',
        select: 'title slug thumbnail instructor duration totalLectures pricingType subscriptionPlans',
        populate: {
          path: 'instructor',
          select: 'firstName lastName avatar'
        }
      })
      .select('-lectureProgress -codeSubmissions -zoomAttendance -bookmarks')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({
    success: true,
    data: enrollments,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// =============================================
// GET SINGLE ENROLLMENT
// =============================================
export const getEnrollment = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid enrollment ID');
  }

  const enrollment = await Enrollment.findById(req.params.id)
    .populate({
      path: 'course',
      populate: [
        { path: 'instructor', select: 'firstName lastName avatar' },
        { path: 'curriculum.lectures' }
      ]
    })
    .populate('payment');

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found');
  }

  if (
    enrollment.student.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized to view this enrollment');
  }

  res.json({
    success: true,
    data: enrollment
  });
});

// =============================================
// ✅ CHECK ENROLLMENT STATUS - FIXED
// =============================================
export const checkEnrollment = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: req.params.courseId
  }).select(
    'status progress certificateIssued certificateId subscriptionExpiry isPermanentlyUnlocked subscriptionMonthsPaid paymentStatus'
  );

  if (!enrollment) {
    return res.json({
      success: true,
      data: {
        isEnrolled: false,
        enrollment: null,
        subscriptionExpired: false
      }
    });
  }

  // ✅ Must be active or completed AND payment must be paid
  const hasActiveStatus = ['active', 'completed'].includes(enrollment.status);
  const hasPaidPayment = enrollment.paymentStatus === 'paid';

  // ✅ Check subscription expiry
  let subscriptionActive = true;
  let subscriptionExpired = false;

  if (
    hasActiveStatus &&
    enrollment.subscriptionExpiry &&
    !enrollment.isPermanentlyUnlocked
  ) {
    subscriptionActive = new Date(enrollment.subscriptionExpiry) > new Date();
    subscriptionExpired = !subscriptionActive;
  }

  const isEnrolled = hasActiveStatus && hasPaidPayment && subscriptionActive;

  res.json({
    success: true,
    data: {
      isEnrolled,
      enrollment: enrollment || null,
      subscriptionExpired,
      isPermanentlyUnlocked: enrollment?.isPermanentlyUnlocked || false,
      subscriptionMonthsPaid: enrollment?.subscriptionMonthsPaid || 0,
      subscriptionExpiry: enrollment?.subscriptionExpiry || null
    }
  });
});

// =============================================
// ADMIN: GET ALL ENROLLMENTS
// =============================================
export const getAllEnrollments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status, paymentStatus, courseId, studentId, search } = req.query;

  const query = {};

  const validStatuses = ['pending', 'active', 'completed', 'expired', 'cancelled'];
  if (status && status !== 'all' && validStatuses.includes(status)) {
    query.status = status;
  }

  const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];
  if (paymentStatus && paymentStatus !== 'all' && validPaymentStatuses.includes(paymentStatus)) {
    query.paymentStatus = paymentStatus;
  }

  if (courseId && isValidId(courseId)) {
    query.course = new mongoose.Types.ObjectId(courseId);
  }

  if (studentId && isValidId(studentId)) {
    query.student = new mongoose.Types.ObjectId(studentId);
  }

  if (search?.trim()) {
    const escaped = escapeRegex(search.trim());
    const searchRegex = new RegExp(escaped, 'i');

    const matchingUsers = await User.find({
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex }
      ]
    }).select('_id').lean();

    const matchingCourses = await Course.find({
      title: searchRegex
    }).select('_id').lean();

    const userIds = matchingUsers.map(u => u._id);
    const courseIds = matchingCourses.map(c => c._id);

    if (userIds.length === 0 && courseIds.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(0, page, limit)
      });
    }

    query.$or = [
      ...(userIds.length > 0 ? [{ student: { $in: userIds } }] : []),
      ...(courseIds.length > 0 ? [{ course: { $in: courseIds } }] : [])
    ];
  }

  const [total, enrollments] = await Promise.all([
    Enrollment.countDocuments(query),
    Enrollment.find(query)
      .populate('student', 'firstName lastName email avatar')
      .populate('course', 'title slug price pricingType')
      .populate('payment', 'paymentId status amount')
      .select('-lectureProgress -codeSubmissions -zoomAttendance -bookmarks')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({
    success: true,
    data: enrollments,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// =============================================
// ADMIN: UPDATE ENROLLMENT STATUS
// =============================================
export const updateEnrollmentStatus = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid enrollment ID');
  }

  const { status, notes } = req.body;

  const validStatuses = ['pending', 'active', 'completed', 'expired', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400);
    throw new Error('Invalid status value');
  }

  const enrollment = await Enrollment.findById(req.params.id);

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found');
  }

  enrollment.status = status;
  if (notes) enrollment.notes = notes;
  if (status === 'completed' && !enrollment.completedAt) {
    enrollment.completedAt = new Date();
  }

  await enrollment.save();

  securityLog('ENROLLMENT_STATUS_UPDATED', {
    adminId: req.user._id,
    enrollmentId: enrollment._id,
    newStatus: status,
    ip: req.ip
  });

  res.json({
    success: true,
    data: enrollment,
    message: `Enrollment ${status} successfully`
  });
});

// =============================================
// INSTRUCTOR: GET COURSE ENROLLMENTS
// =============================================
export const getCourseEnrollments = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const { page, limit, skip } = paginate(req.query.page, req.query.limit);

  const course = await Course.findById(req.params.courseId)
    .select('instructor title').lean();

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    course.instructor.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized to view these enrollments');
  }

  const query = {
    course: req.params.courseId,
    status: { $in: ['active', 'completed'] }
  };

  const [total, enrollments] = await Promise.all([
    Enrollment.countDocuments(query),
    Enrollment.find(query)
      .populate('student', 'firstName lastName email avatar')
      .select('student status progress stats enrollmentDate completedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({
    success: true,
    data: enrollments,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// =============================================
// ADMIN: CANCEL ENROLLMENT
// =============================================
export const cancelEnrollment = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid enrollment ID');
  }

  const enrollment = await Enrollment.findById(req.params.id);

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found');
  }

  if (enrollment.status === 'cancelled') {
    res.status(400);
    throw new Error('Enrollment is already cancelled');
  }

  enrollment.status = 'cancelled';
  await enrollment.save();

  await Course.findByIdAndUpdate(enrollment.course, {
    $inc: { enrollmentCount: -1 }
  });

  await User.findByIdAndUpdate(enrollment.student, {
    $pull: { enrolledCourses: enrollment.course }
  });

  securityLog('ENROLLMENT_CANCELLED', {
    adminId: req.user._id,
    enrollmentId: enrollment._id,
    studentId: enrollment.student,
    courseId: enrollment.course,
    ip: req.ip
  });

  res.json({
    success: true,
    message: 'Enrollment cancelled successfully'
  });
});

// =============================================
// GET COURSE PROGRESS
// =============================================
export const getCourseProgress = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: req.params.courseId,
    status: { $in: ['active', 'completed'] }
  }).populate('lectureProgress.lecture', 'title contentType duration');

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found');
  }

  const totalLectures = await Lecture.countDocuments({
    course: req.params.courseId,
    isPublished: true
  });

  const completedCount = enrollment.lectureProgress.filter(p => p.isCompleted).length;
  const legacyCompleted = enrollment.progress?.completedLectures?.length || 0;
  const actualCompleted = Math.max(completedCount, legacyCompleted);
  const percentage = totalLectures > 0
    ? Math.round((actualCompleted / totalLectures) * 100)
    : 0;

  res.json({
    success: true,
    data: {
      progress: enrollment.lectureProgress,
      summary: {
        totalLectures,
        completedLectures: actualCompleted,
        percentage,
        totalWatchTime: enrollment.stats?.totalWatchTime || 0,
        currentLecture: enrollment.progress?.currentLecture,
        streakDays: enrollment.stats?.streakDays || 0
      },
      stats: enrollment.stats,
      bookmarks: enrollment.bookmarks,
      legacyProgress: {
        completedLectures: enrollment.progress?.completedLectures || [],
        percentage: enrollment.progress?.percentage || 0
      }
    }
  });
});

// =============================================
// GET LECTURE WATCH PROGRESS
// =============================================
export const getLectureWatchProgress = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  const progress = enrollment.getLectureProgress(lecture._id);
  const maxWatches = lecture.watchSettings?.maxWatches || 0;
  const watchCount = progress?.watchCount || 0;

  res.json({
    success: true,
    data: {
      lastPosition: progress?.lastPosition || 0,
      totalWatchTime: progress?.totalWatchTime || 0,
      watchCount,
      isCompleted: progress?.isCompleted || false,
      completedAt: progress?.completedAt,
      watchedSegments: progress?.watchedSegments || [],
      canWatch: maxWatches === 0 || watchCount < maxWatches,
      remainingWatches: maxWatches > 0 ? Math.max(0, maxWatches - watchCount) : -1,
      personalNotes: progress?.personalNotes || ''
    }
  });
});

// =============================================
// START WATCH
// =============================================
export const startWatch = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  // ✅ FIX: Accept both active AND completed enrollments
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course:  lecture.course,
    status:  { $in: ['active', 'completed'] },
  });

  // ✅ FIX: Preview lectures don't need enrollment
  if (!enrollment && !lecture.isPreview) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  // ✅ If preview lecture and no enrollment - return mock data
  if (!enrollment && lecture.isPreview) {
    return res.json({
      success: true,
      data: {
        watchCount:       1,
        canWatch:         true,
        remainingWatches: -1,
      },
    });
  }

  // ✅ Find or create lecture progress entry
  let progressIndex = enrollment.lectureProgress.findIndex(
    (p) => p.lecture.toString() === lecture._id.toString()
  );

  if (progressIndex === -1) {
    enrollment.lectureProgress.push({
      lecture:         lecture._id,
      watchCount:      0,
      totalWatchTime:  0,
      lastPosition:    0,
      lastWatchedAt:   new Date(),
      isCompleted:     false,
      watchedSegments: [],
    });
    progressIndex = enrollment.lectureProgress.length - 1;
  }

  const progress    = enrollment.lectureProgress[progressIndex];
  const maxWatches  = lecture.watchSettings?.maxWatches || 0;
  const watchCount  = progress.watchCount || 0;

  // ✅ Check watch limit
  if (maxWatches > 0 && watchCount >= maxWatches) {
    res.status(403);
    throw new Error('Maximum watch limit reached for this lecture');
  }

  // ✅ Increment watch count
  progress.watchCount   += 1;
  progress.lastWatchedAt = new Date();

  // ✅ Update streak safely
  try {
    enrollment.updateStreak();
  } catch (e) {
    // Silent fail - don't break watch
  }

  enrollment.progress        = enrollment.progress || {};
  enrollment.progress.currentLecture = lecture._id;
  enrollment.progress.lastAccessed   = new Date();

  await enrollment.save();

  const newCount = progress.watchCount;

  res.json({
    success: true,
    data: {
      watchCount:       newCount,
      canWatch:         maxWatches === 0 || newCount < maxWatches,
      remainingWatches: maxWatches > 0
        ? Math.max(0, maxWatches - newCount)
        : -1,
    },
  });
});

// =============================================
// UPDATE WATCH PROGRESS
// =============================================
export const updateWatchProgress = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { currentTime, duration, watchedSegment } = req.body;

  // ✅ Safe number parsing
  const safeCurrentTime = Math.max(0, Number(currentTime) || 0);
  const safeDuration    = Math.max(0, Number(duration)    || 0);

  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  // ✅ FIX: Accept active AND completed
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course:  lecture.course,
    status:  { $in: ['active', 'completed'] },
  });

  // ✅ FIX: Don't throw for preview - just return ok
  if (!enrollment) {
    if (lecture.isPreview) {
      return res.json({
        success:  true,
        data: {
          lastPosition:   safeCurrentTime,
          totalWatchTime: 0,
          watchCount:     0,
          isCompleted:    false,
        },
      });
    }
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  // ✅ Find or create progress entry
  let progressIndex = enrollment.lectureProgress.findIndex(
    (p) => p.lecture.toString() === lecture._id.toString()
  );

  if (progressIndex === -1) {
    enrollment.lectureProgress.push({
      lecture:         lecture._id,
      watchCount:      1,
      totalWatchTime:  0,
      lastPosition:    0,
      lastWatchedAt:   new Date(),
      isCompleted:     false,
      watchedSegments: [],
    });
    progressIndex = enrollment.lectureProgress.length - 1;
  }

  const progress   = enrollment.lectureProgress[progressIndex];
  const maxWatches = lecture.watchSettings?.maxWatches || 0;

  // ✅ Check watch limit
  if (maxWatches > 0 && (progress.watchCount || 0) > maxWatches) {
    res.status(403);
    throw new Error('Maximum watch limit reached');
  }

  // ✅ Update position
  progress.lastPosition  = safeCurrentTime;
  progress.lastWatchedAt = new Date();

  // ✅ Increment watch time safely
  progress.totalWatchTime = (progress.totalWatchTime || 0) + 5;

  enrollment.stats                    = enrollment.stats || {};
  enrollment.stats.totalWatchTime     = (enrollment.stats.totalWatchTime || 0) + 5;
  enrollment.stats.totalTimeSpent     = (enrollment.stats.totalTimeSpent || 0) + 5;
  enrollment.stats.lastActivityAt     = new Date();

  // ✅ Add watched segment
  if (
    watchedSegment &&
    typeof watchedSegment.start === 'number' &&
    typeof watchedSegment.end   === 'number' &&
    watchedSegment.start >= 0 &&
    watchedSegment.end > watchedSegment.start &&
    watchedSegment.end - watchedSegment.start <= 3600
  ) {
    const existing = progress.watchedSegments || [];

    // ✅ Limit segments to prevent DB bloat
    if (existing.length < 500) {
      progress.watchedSegments = mergeSegments([
        ...existing,
        {
          start: Math.floor(watchedSegment.start),
          end:   Math.ceil(watchedSegment.end),
        },
      ]);
    }
  }

  // ✅ Auto-complete at 90%
  if (
    safeDuration > 0 &&
    safeCurrentTime > 0 &&
    !progress.isCompleted
  ) {
    const watchedPct = (safeCurrentTime / safeDuration) * 100;
    if (watchedPct >= 90) {
      progress.isCompleted  = true;
      progress.completedAt  = new Date();

      const alreadyCompleted = enrollment.progress.completedLectures.some(
        (id) => id.toString() === lecture._id.toString()
      );
      if (!alreadyCompleted) {
        enrollment.progress.completedLectures.push(lecture._id);
      }
    }
  }

  await enrollment.save();

  res.json({
    success: true,
    data: {
      lastPosition:   progress.lastPosition,
      totalWatchTime: progress.totalWatchTime,
      watchCount:     progress.watchCount,
      isCompleted:    progress.isCompleted,
    },
  });
});

// =============================================
// MARK LECTURE COMPLETE
// =============================================
export const markLectureComplete = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  // ✅ FIX: Accept active AND completed enrollments
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course:  lecture.course,
    status:  { $in: ['active', 'completed'] },
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  // ✅ Find or create progress
  let progressIndex = enrollment.lectureProgress.findIndex(
    (p) => p.lecture.toString() === lecture._id.toString()
  );

  if (progressIndex === -1) {
    enrollment.lectureProgress.push({
      lecture:         lecture._id,
      watchCount:      0,
      totalWatchTime:  0,
      lastPosition:    0,
      lastWatchedAt:   new Date(),
      isCompleted:     true,
      completedAt:     new Date(),
      watchedSegments: [],
    });
  } else {
    if (!enrollment.lectureProgress[progressIndex].isCompleted) {
      enrollment.lectureProgress[progressIndex].isCompleted = true;
      enrollment.lectureProgress[progressIndex].completedAt = new Date();
    }
  }

  // ✅ Add to legacy completedLectures array
  const alreadyInLegacy = enrollment.progress.completedLectures.some(
    (id) => id.toString() === lecture._id.toString()
  );
  if (!alreadyInLegacy) {
    enrollment.progress.completedLectures.push(lecture._id);
  }

  // ✅ Recalculate percentage
  const totalLectures = await Lecture.countDocuments({
    course:      lecture.course,
    isPublished: true,
  });

  enrollment.progress.percentage  = enrollment.calculateProgress(totalLectures);
  enrollment.progress.lastAccessed = new Date();

  // ✅ Update streak safely
  try {
    enrollment.updateStreak();
  } catch (e) {
    // Silent fail
  }

  // ✅ Auto-complete course at 100%
  if (
    enrollment.progress.percentage >= 100 &&
    enrollment.status === 'active'
  ) {
    enrollment.status      = 'completed';
    enrollment.completedAt = new Date();
  }

  await enrollment.save();

  res.json({
    success: true,
    data: {
      isCompleted:   true,
      percentage:    enrollment.progress.percentage,
      courseCompleted: enrollment.status === 'completed',
    },
  });
});

// =============================================
// SUBMIT CODE
// =============================================
export const submitCode = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { html, css, js } = req.body;
  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (lecture.contentType !== 'interactive') {
    res.status(400);
    throw new Error('This lecture does not accept code submissions');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: 'active'
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  enrollment.codeSubmissions.push({
    lecture: lecture._id,
    code: {
      html: String(html || '').substring(0, 50000),
      css: String(css || '').substring(0, 20000),
      js: String(js || '').substring(0, 50000)
    },
    submittedAt: new Date()
  });

  enrollment.updateStreak();
  await enrollment.save();

  const submission = enrollment.codeSubmissions[enrollment.codeSubmissions.length - 1];

  res.json({
    success: true,
    message: 'Code submitted successfully',
    data: { submissionId: submission._id }
  });
});

// =============================================
// RECORD ZOOM ATTENDANCE
// =============================================
export const recordZoomAttendance = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { joinedAt, leftAt } = req.body;
  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: 'active'
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('Not enrolled in this course');
  }

  const attendanceIndex = enrollment.zoomAttendance.findIndex(
    a => a.lecture.toString() === lecture._id.toString()
  );

  const attendanceData = {
    lecture: lecture._id,
    joinedAt: joinedAt ? new Date(joinedAt) : new Date(),
    leftAt: leftAt ? new Date(leftAt) : null,
    attended: true
  };

  if (leftAt && joinedAt) {
    attendanceData.duration = Math.round(
      (new Date(leftAt) - new Date(joinedAt)) / 60000
    );
  }

  if (attendanceIndex === -1) {
    enrollment.zoomAttendance.push(attendanceData);
  } else {
    enrollment.zoomAttendance[attendanceIndex] = attendanceData;
  }

  await enrollment.save();

  res.json({
    success: true,
    message: 'Attendance recorded successfully'
  });
});

// =============================================
// ADD BOOKMARK
// =============================================
export const addBookmark = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { timestamp, note } = req.body;
  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('Not enrolled in this course');
  }

  if (enrollment.bookmarks.length >= 100) {
    res.status(400);
    throw new Error('Maximum 100 bookmarks allowed');
  }

  enrollment.bookmarks.push({
    lecture: lecture._id,
    timestamp: Math.max(0, Number(timestamp) || 0),
    note: String(note || '').substring(0, 500),
    createdAt: new Date()
  });

  await enrollment.save();

  const bookmark = enrollment.bookmarks[enrollment.bookmarks.length - 1];

  res.json({
    success: true,
    data: bookmark
  });
});

// =============================================
// REMOVE BOOKMARK
// =============================================
export const removeBookmark = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.bookmarkId)) {
    res.status(400);
    throw new Error('Invalid bookmark ID');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    'bookmarks._id': req.params.bookmarkId
  });

  if (!enrollment) {
    res.status(404);
    throw new Error('Bookmark not found');
  }

  enrollment.bookmarks = enrollment.bookmarks.filter(
    b => b._id.toString() !== req.params.bookmarkId
  );

  await enrollment.save();

  res.json({
    success: true,
    message: 'Bookmark removed'
  });
});

// =============================================
// SAVE LECTURE NOTES
// =============================================
export const saveLectureNotes = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { notes } = req.body;
  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('Not enrolled in this course');
  }

  let progressIndex = enrollment.lectureProgress.findIndex(
    p => p.lecture.toString() === lecture._id.toString()
  );

  const safeNotes = String(notes || '').substring(0, 5000);

  if (progressIndex === -1) {
    enrollment.lectureProgress.push({
      lecture: lecture._id,
      watchCount: 0,
      totalWatchTime: 0,
      lastPosition: 0,
      isCompleted: false,
      personalNotes: safeNotes
    });
  } else {
    enrollment.lectureProgress[progressIndex].personalNotes = safeNotes;
  }

  await enrollment.save();

  res.json({
    success: true,
    message: 'Notes saved successfully'
  });
});

// =============================================
// GET CODE SUBMISSIONS
// =============================================
export const getCodeSubmissions = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const enrollment = await Enrollment.findOne({
    student: req.user._id
  }).populate('codeSubmissions.lecture', 'title').lean();

  if (!enrollment) {
    res.status(404);
    throw new Error('No enrollments found');
  }

  const submissions = enrollment.codeSubmissions.filter(s => {
    const lectureId = s.lecture?._id || s.lecture;
    return lectureId?.toString() === req.params.lectureId;
  });

  res.json({
    success: true,
    data: submissions
  });
});