// controllers/enrollmentController.js
import asyncHandler from 'express-async-handler';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import Lecture from '../models/Lecture.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import { sendEnrollmentConfirmation } from '../utils/emailService.js';

// Helper function to merge overlapping segments
const mergeSegments = (segments) => {
  if (!segments || segments.length === 0) return [];
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];
    if (current.start <= last.end + 2) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
};

// @desc    Enroll in a course (for free courses)
// @route   POST /api/enrollments
// @access  Private
export const enrollInCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.body;

  const course = await Course.findById(courseId);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.isPublished) {
    res.status(400);
    throw new Error('Course is not available for enrollment');
  }

  const existingEnrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId
  });

  if (existingEnrollment) {
    res.status(400);
    throw new Error('You are already enrolled in this course');
  }

  if (course.isFreeCourse || course.price === 0) {
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

    course.enrollmentCount += 1;
    await course.save();

    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { enrolledCourses: courseId }
    });

    try {
      await sendEnrollmentConfirmation(req.user, course);
    } catch (error) {
      console.error('Failed to send enrollment email:', error);
    }

    res.status(201).json({
      success: true,
      data: enrollment,
      message: 'Successfully enrolled in the course'
    });
  } else {
    res.status(400);
    throw new Error('This is a paid course. Please make a payment to enroll.');
  }
});

// @desc    Get my enrollments
// @route   GET /api/enrollments/my-enrollments
// @access  Private
export const getMyEnrollments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status } = req.query;

  const query = { student: req.user._id };

  if (status && status !== 'all') {
    query.status = status;
  }

  const total = await Enrollment.countDocuments(query);
  const enrollments = await Enrollment.find(query)
    .populate({
      path: 'course',
      select: 'title slug thumbnail instructor duration totalLectures',
      populate: {
        path: 'instructor',
        select: 'firstName lastName'
      }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: enrollments,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc    Get enrollment details
// @route   GET /api/enrollments/:id
// @access  Private
export const getEnrollment = asyncHandler(async (req, res) => {
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
    throw new Error('Not authorized');
  }

  res.json({
    success: true,
    data: enrollment
  });
});

// @desc    Get all enrollments (Admin)
// @route   GET /api/enrollments/admin/all
// @access  Private/Admin
export const getAllEnrollments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status, paymentStatus, course, student, search } = req.query;

  const query = {};

  if (status && status !== 'all') query.status = status;
  if (paymentStatus && paymentStatus !== 'all') query.paymentStatus = paymentStatus;
  if (course) query.course = course;
  if (student) query.student = student;

  const total = await Enrollment.countDocuments(query);
  let enrollments = await Enrollment.find(query)
    .populate('student', 'firstName lastName email')
    .populate('course', 'title slug price')
    .populate('payment', 'paymentId status amount')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  if (search) {
    enrollments = enrollments.filter(e => 
      e.student.firstName.toLowerCase().includes(search.toLowerCase()) ||
      e.student.lastName.toLowerCase().includes(search.toLowerCase()) ||
      e.student.email.toLowerCase().includes(search.toLowerCase()) ||
      e.course.title.toLowerCase().includes(search.toLowerCase())
    );
  }

  res.json({
    success: true,
    data: enrollments,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc    Update enrollment status (Admin)
// @route   PUT /api/enrollments/:id/status
// @access  Private/Admin
export const updateEnrollmentStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;

  const enrollment = await Enrollment.findById(req.params.id);

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found');
  }

  enrollment.status = status;
  if (notes) enrollment.notes = notes;
  if (status === 'completed') enrollment.completedAt = new Date();

  await enrollment.save();

  res.json({
    success: true,
    data: enrollment
  });
});

// @desc    Get course enrollments (Instructor)
// @route   GET /api/enrollments/course/:courseId
// @access  Private/Instructor
export const getCourseEnrollments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);

  const course = await Course.findById(req.params.courseId);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    course.instructor.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const query = { course: req.params.courseId };
  const total = await Enrollment.countDocuments(query);

  const enrollments = await Enrollment.find(query)
    .populate('student', 'firstName lastName email avatar')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: enrollments,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc    Check enrollment status
// @route   GET /api/enrollments/check/:courseId
// @access  Private
export const checkEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: req.params.courseId
  });

  res.json({
    success: true,
    data: {
      isEnrolled: !!enrollment && ['active', 'completed'].includes(enrollment.status),
      enrollment: enrollment || null
    }
  });
});

// @desc    Cancel enrollment
// @route   DELETE /api/enrollments/:id
// @access  Private/Admin
export const cancelEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id);

  if (!enrollment) {
    res.status(404);
    throw new Error('Enrollment not found');
  }

  enrollment.status = 'cancelled';
  await enrollment.save();

  await Course.findByIdAndUpdate(enrollment.course, {
    $inc: { enrollmentCount: -1 }
  });

  await User.findByIdAndUpdate(enrollment.student, {
    $pull: { enrolledCourses: enrollment.course }
  });

  res.json({
    success: true,
    message: 'Enrollment cancelled successfully'
  });
});

// ============================================
// NEW: WATCH TRACKING & PROGRESS FUNCTIONS
// ============================================

// @desc    Get course progress
// @route   GET /api/enrollments/progress/:courseId
// @access  Private
export const getCourseProgress = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: req.params.courseId,
    status: { $in: ['active', 'completed'] }
  }).populate('lectureProgress.lecture', 'title contentType duration watchSettings');

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
  const percentage = totalLectures > 0 ? Math.round((actualCompleted / totalLectures) * 100) : 0;

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
      // Include legacy progress for compatibility
      legacyProgress: {
        completedLectures: enrollment.progress?.completedLectures || [],
        percentage: enrollment.progress?.percentage || 0
      }
    }
  });
});

// @desc    Get lecture watch progress
// @route   GET /api/enrollments/lecture-progress/:lectureId
// @access  Private
export const getLectureWatchProgress = asyncHandler(async (req, res) => {
  const lecture = await Lecture.findById(req.params.lectureId);
  
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

  const progress = enrollment.getLectureProgress(lecture._id);
  const maxWatches = lecture.watchSettings?.maxWatches || 0;
  const watchCount = progress?.watchCount || 0;

  res.json({
    success: true,
    data: {
      lastPosition: progress?.lastPosition || 0,
      totalWatchTime: progress?.totalWatchTime || 0,
      watchCount: watchCount,
      isCompleted: progress?.isCompleted || false,
      completedAt: progress?.completedAt,
      watchedSegments: progress?.watchedSegments || [],
      canWatch: maxWatches === 0 || watchCount < maxWatches,
      remainingWatches: maxWatches > 0 ? Math.max(0, maxWatches - watchCount) : -1,
      watchSettings: lecture.watchSettings,
      personalNotes: progress?.personalNotes || ''
    }
  });
});

// @desc    Start watching (increment watch count)
// @route   POST /api/enrollments/start-watch/:lectureId
// @access  Private
export const startWatch = asyncHandler(async (req, res) => {
  const lecture = await Lecture.findById(req.params.lectureId);

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

  let progressIndex = enrollment.lectureProgress.findIndex(
    p => p.lecture.toString() === lecture._id.toString()
  );

  if (progressIndex === -1) {
    enrollment.lectureProgress.push({
      lecture: lecture._id,
      watchCount: 0,
      totalWatchTime: 0,
      lastPosition: 0,
      lastWatchedAt: new Date(),
      isCompleted: false,
      watchedSegments: []
    });
    progressIndex = enrollment.lectureProgress.length - 1;
  }

  const progress = enrollment.lectureProgress[progressIndex];
  const maxWatches = lecture.watchSettings?.maxWatches || 0;

  if (maxWatches > 0 && progress.watchCount >= maxWatches) {
    res.status(403);
    throw new Error('Maximum watch limit reached for this lecture');
  }

  progress.watchCount += 1;
  progress.lastWatchedAt = new Date();
  
  enrollment.updateStreak();
  enrollment.progress.currentLecture = lecture._id;
  enrollment.progress.lastAccessed = new Date();
  
  await enrollment.save();

  res.json({
    success: true,
    data: {
      watchCount: progress.watchCount,
      canWatch: maxWatches === 0 || progress.watchCount < maxWatches,
      remainingWatches: maxWatches > 0 ? Math.max(0, maxWatches - progress.watchCount) : -1
    }
  });
});

// @desc    Update watch progress
// @route   POST /api/enrollments/watch-progress/:lectureId
// @access  Private
export const updateWatchProgress = asyncHandler(async (req, res) => {
  const { currentTime, duration, watchedSegment } = req.body;

  const lecture = await Lecture.findById(req.params.lectureId);

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

  let progressIndex = enrollment.lectureProgress.findIndex(
    p => p.lecture.toString() === lecture._id.toString()
  );

  if (progressIndex === -1) {
    enrollment.lectureProgress.push({
      lecture: lecture._id,
      watchCount: 1,
      totalWatchTime: 0,
      lastPosition: 0,
      lastWatchedAt: new Date(),
      isCompleted: false,
      watchedSegments: []
    });
    progressIndex = enrollment.lectureProgress.length - 1;
  }

  const progress = enrollment.lectureProgress[progressIndex];

  const maxWatches = lecture.watchSettings?.maxWatches || 0;
  if (maxWatches > 0 && progress.watchCount > maxWatches) {
    res.status(403);
    throw new Error('Maximum watch limit reached');
  }

  progress.lastPosition = currentTime || 0;
  progress.lastWatchedAt = new Date();
  progress.totalWatchTime = (progress.totalWatchTime || 0) + 1;

  enrollment.stats = enrollment.stats || {};
  enrollment.stats.totalWatchTime = (enrollment.stats.totalWatchTime || 0) + 1;
  enrollment.stats.totalTimeSpent = (enrollment.stats.totalTimeSpent || 0) + 1;

  if (watchedSegment && watchedSegment.start !== undefined && watchedSegment.end !== undefined) {
    const existingSegments = progress.watchedSegments || [];
    progress.watchedSegments = mergeSegments([
      ...existingSegments,
      { start: watchedSegment.start, end: watchedSegment.end }
    ]);
  }

  if (duration && currentTime && !progress.isCompleted) {
    const watchedPercentage = (currentTime / duration) * 100;
    if (watchedPercentage >= 90) {
      progress.isCompleted = true;
      progress.completedAt = new Date();
      
      if (!enrollment.progress.completedLectures.includes(lecture._id)) {
        enrollment.progress.completedLectures.push(lecture._id);
      }
    }
  }

  await enrollment.save();

  res.json({
    success: true,
    data: {
      lastPosition: progress.lastPosition,
      totalWatchTime: progress.totalWatchTime,
      watchCount: progress.watchCount,
      isCompleted: progress.isCompleted,
      canWatch: maxWatches === 0 || progress.watchCount <= maxWatches
    }
  });
});

// @desc    Mark lecture as complete
// @route   POST /api/enrollments/complete/:lectureId
// @access  Private
export const markLectureComplete = asyncHandler(async (req, res) => {
  const lecture = await Lecture.findById(req.params.lectureId);

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

  let progressIndex = enrollment.lectureProgress.findIndex(
    p => p.lecture.toString() === lecture._id.toString()
  );

  if (progressIndex === -1) {
    enrollment.lectureProgress.push({
      lecture: lecture._id,
      watchCount: 0,
      totalWatchTime: 0,
      lastPosition: 0,
      lastWatchedAt: new Date(),
      isCompleted: true,
      completedAt: new Date(),
      watchedSegments: []
    });
  } else {
    enrollment.lectureProgress[progressIndex].isCompleted = true;
    enrollment.lectureProgress[progressIndex].completedAt = new Date();
  }

  // Sync with legacy progress
  if (!enrollment.progress.completedLectures.includes(lecture._id)) {
    enrollment.progress.completedLectures.push(lecture._id);
  }

  const totalLectures = await Lecture.countDocuments({
    course: lecture.course,
    isPublished: true
  });
  
  enrollment.progress.percentage = enrollment.calculateProgress(totalLectures);
  enrollment.progress.lastAccessed = new Date();
  
  enrollment.updateStreak();

  if (enrollment.progress.percentage >= 100) {
    enrollment.status = 'completed';
    enrollment.completedAt = new Date();
  }

  await enrollment.save();

  res.json({
    success: true,
    data: {
      isCompleted: true,
      progress: enrollment.progress.percentage,
      courseCompleted: enrollment.status === 'completed'
    }
  });
});

// @desc    Submit code for interactive lecture
// @route   POST /api/enrollments/submit-code/:lectureId
// @access  Private
export const submitCode = asyncHandler(async (req, res) => {
  const { html, css, js } = req.body;

  const lecture = await Lecture.findById(req.params.lectureId);

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
    throw new Error('Not enrolled in this course');
  }

  enrollment.codeSubmissions.push({
    lecture: lecture._id,
    code: { html: html || '', css: css || '', js: js || '' },
    submittedAt: new Date()
  });

  enrollment.updateStreak();
  await enrollment.save();

  res.json({
    success: true,
    message: 'Code submitted successfully',
    data: {
      submissionId: enrollment.codeSubmissions[enrollment.codeSubmissions.length - 1]._id
    }
  });
});

// @desc    Record Zoom attendance
// @route   POST /api/enrollments/zoom-attendance/:lectureId
// @access  Private
export const recordZoomAttendance = asyncHandler(async (req, res) => {
  const { joinedAt, leftAt } = req.body;

  const lecture = await Lecture.findById(req.params.lectureId);

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
    attendanceData.duration = Math.round((new Date(leftAt) - new Date(joinedAt)) / 60000);
  }

  if (attendanceIndex === -1) {
    enrollment.zoomAttendance.push(attendanceData);
  } else {
    enrollment.zoomAttendance[attendanceIndex] = attendanceData;
  }

  await enrollment.save();

  res.json({
    success: true,
    message: 'Attendance recorded'
  });
});

// @desc    Add bookmark
// @route   POST /api/enrollments/bookmark/:lectureId
// @access  Private
export const addBookmark = asyncHandler(async (req, res) => {
  const { timestamp, note } = req.body;

  const lecture = await Lecture.findById(req.params.lectureId);

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

  enrollment.bookmarks.push({
    lecture: lecture._id,
    timestamp: timestamp || 0,
    note: note || '',
    createdAt: new Date()
  });

  await enrollment.save();

  res.json({
    success: true,
    data: enrollment.bookmarks[enrollment.bookmarks.length - 1]
  });
});

// @desc    Remove bookmark
// @route   DELETE /api/enrollments/bookmark/:bookmarkId
// @access  Private
export const removeBookmark = asyncHandler(async (req, res) => {
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

// @desc    Save personal notes for a lecture
// @route   PUT /api/enrollments/notes/:lectureId
// @access  Private
export const saveLectureNotes = asyncHandler(async (req, res) => {
  const { notes } = req.body;

  const lecture = await Lecture.findById(req.params.lectureId);

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

  let progressIndex = enrollment.lectureProgress.findIndex(
    p => p.lecture.toString() === lecture._id.toString()
  );

  if (progressIndex === -1) {
    enrollment.lectureProgress.push({
      lecture: lecture._id,
      watchCount: 0,
      totalWatchTime: 0,
      lastPosition: 0,
      isCompleted: false,
      personalNotes: notes
    });
  } else {
    enrollment.lectureProgress[progressIndex].personalNotes = notes;
  }

  await enrollment.save();

  res.json({
    success: true,
    message: 'Notes saved'
  });
});

// @desc    Get code submissions
// @route   GET /api/enrollments/submissions/:lectureId
// @access  Private
export const getCodeSubmissions = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({
    student: req.user._id
  }).populate('codeSubmissions.lecture', 'title');

  if (!enrollment) {
    res.status(404);
    throw new Error('No enrollments found');
  }

  const submissions = enrollment.codeSubmissions.filter(
    s => s.lecture._id.toString() === req.params.lectureId ||
         s.lecture.toString() === req.params.lectureId
  );

  res.json({
    success: true,
    data: submissions
  });
});