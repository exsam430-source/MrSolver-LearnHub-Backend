// controllers/progressController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Progress from '../models/Progress.js';
import Enrollment from '../models/Enrollment.js';
import Lecture from '../models/Lecture.js';
import Course from '../models/Course.js';
import { calculateProgress } from '../utils/helpers.js';
import { securityLog } from '../middleware/auditLog.js';

// ============================================
// HELPERS
// ============================================

// ✅ Validate ObjectId
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ✅ Sanitize text
const sanitizeText = (text, maxLen = 1000) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, maxLen);
};

// ✅ Safe number
const safeNumber = (val, min = 0, max = 999999, fallback = 0) => {
  const n = Number(val);
  if (isNaN(n) || !isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
};

// ✅ Check enrollment helper
const checkEnrollment = async (studentId, courseId) => {
  return await Enrollment.findOne({
    student: studentId,
    course:  courseId,
    status:  { $in: ['active', 'completed'] },
  });
};

// ✅ Find or create progress
const findOrCreateProgress = async (studentId, courseId, lectureId) => {
  let progress = await Progress.findOne({
    student: studentId,
    course:  courseId,
    lecture: lectureId,
  });

  if (!progress) {
    progress = await Progress.create({
      student:      studentId,
      course:       courseId,
      lecture:      lectureId,
      isCompleted:  false,
      watchTime:    0,
      lastPosition: 0,
      notes:        [],
    });
  }

  return progress;
};

// ✅ Update enrollment after progress change
const syncEnrollmentProgress = async (studentId, courseId) => {
  try {
    const [completedProgress, course, enrollment] = await Promise.all([
      Progress.find({
        student:     studentId,
        course:      courseId,
        isCompleted: true,
      }).select('lecture'),
      Course.findById(courseId).select('totalLectures'),
      Enrollment.findOne({
        student: studentId,
        course:  courseId,
      }),
    ]);

    if (!enrollment || !course) return;

    const completedIds = completedProgress.map((p) => p.lecture);
    const percentage   = calculateProgress(
      completedIds.length,
      course.totalLectures || 1
    );

    enrollment.progress.completedLectures = completedIds;
    enrollment.progress.percentage        = percentage;
    enrollment.progress.lastAccessed      = new Date();

    if (percentage >= 100 && enrollment.status === 'active') {
      enrollment.status      = 'completed';
      enrollment.completedAt = new Date();
    }

    await enrollment.save();
    return percentage;
  } catch (err) {
    console.error('syncEnrollmentProgress error:', err.message);
  }
};

// ============================================
// GET COURSE PROGRESS
// @route GET /api/progress/course/:courseId
// @access Private
// ============================================
export const getCourseProgress = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const enrollment = await checkEnrollment(
    req.user._id,
    req.params.courseId
  );

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  const [progress, course] = await Promise.all([
    Progress.find({
      student: req.user._id,
      course:  req.params.courseId,
    }).populate('lecture', 'title contentType duration').lean(),
    Course.findById(req.params.courseId)
      .select('totalLectures title').lean(),
  ]);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  const completedCount = progress.filter((p) => p.isCompleted).length;
  const totalLectures  = course.totalLectures || 1;
  const percentage     = calculateProgress(completedCount, totalLectures);

  res.json({
    success: true,
    data: {
      progress,
      summary: {
        totalLectures,
        completedLectures: completedCount,
        percentage,
        totalWatchTime: progress.reduce(
          (acc, p) => acc + (p.watchTime || 0), 0
        ),
      },
    },
  });
});

// ============================================
// GET LECTURE PROGRESS
// @route GET /api/progress/lecture/:lectureId
// @access Private
// ============================================
export const getLectureProgress = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.lectureId)
    .select('course').lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const enrollment = await checkEnrollment(
    req.user._id,
    lecture.course
  );

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  const progress = await Progress.findOne({
    student: req.user._id,
    lecture: req.params.lectureId,
  }).lean();

  res.json({
    success: true,
    data: progress || {
      isCompleted:  false,
      watchTime:    0,
      lastPosition: 0,
      notes:        [],
    },
  });
});

// ============================================
// UPDATE LECTURE PROGRESS
// @route PUT /api/progress/lecture/:lectureId
// @access Private
// ============================================
export const updateLectureProgress = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { watchTime, lastPosition, isCompleted } = req.body;

  // ✅ Sanitize inputs
  const safeWatchTime    = safeNumber(watchTime,    0, 999999);
  const safeLastPosition = safeNumber(lastPosition, 0, 999999);
  const safeIsCompleted  = isCompleted !== undefined
    ? Boolean(isCompleted) : undefined;

  const lecture = await Lecture.findById(req.params.lectureId)
    .select('course').lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const enrollment = await checkEnrollment(
    req.user._id,
    lecture.course
  );

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  let progress = await Progress.findOne({
    student: req.user._id,
    course:  lecture.course,
    lecture: req.params.lectureId,
  });

  if (progress) {
    if (watchTime    !== undefined) progress.watchTime    = safeWatchTime;
    if (lastPosition !== undefined) progress.lastPosition = safeLastPosition;
    if (safeIsCompleted !== undefined) {
      progress.isCompleted = safeIsCompleted;
      if (safeIsCompleted && !progress.completedAt) {
        progress.completedAt = new Date();
      } else if (!safeIsCompleted) {
        progress.completedAt = null;
      }
    }
    await progress.save();
  } else {
    progress = await Progress.create({
      student:      req.user._id,
      course:       lecture.course,
      lecture:      req.params.lectureId,
      watchTime:    safeWatchTime,
      lastPosition: safeLastPosition,
      isCompleted:  safeIsCompleted || false,
      completedAt:  safeIsCompleted ? new Date() : null,
    });
  }

  const percentage = await syncEnrollmentProgress(
    req.user._id,
    lecture.course
  );

  res.json({
    success: true,
    data: {
      progress,
      courseProgress: { percentage: percentage || 0 },
    },
  });
});

// ============================================
// MARK LECTURE COMPLETE
// @route POST /api/progress/lecture/:lectureId/complete
// @access Private
// ============================================
export const markLectureComplete = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.lectureId)
    .select('course').lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const enrollment = await checkEnrollment(
    req.user._id,
    lecture.course
  );

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  let progress = await Progress.findOne({
    student: req.user._id,
    course:  lecture.course,
    lecture: req.params.lectureId,
  });

  if (progress) {
    if (!progress.isCompleted) {
      progress.isCompleted = true;
      progress.completedAt = new Date();
      await progress.save();
    }
  } else {
    progress = await Progress.create({
      student:      req.user._id,
      course:       lecture.course,
      lecture:      req.params.lectureId,
      isCompleted:  true,
      completedAt:  new Date(),
    });
  }

  const percentage = await syncEnrollmentProgress(
    req.user._id,
    lecture.course
  );

  res.json({
    success: true,
    data: {
      isCompleted:   true,
      percentage:    percentage || 0,
      courseCompleted: (percentage || 0) >= 100,
    },
  });
});

// ============================================
// MARK LECTURE INCOMPLETE
// @route POST /api/progress/lecture/:lectureId/incomplete
// @access Private
// ============================================
export const markLectureIncomplete = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.lectureId)
    .select('course').lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const progress = await Progress.findOne({
    student: req.user._id,
    lecture: req.params.lectureId,
  });

  if (progress) {
    progress.isCompleted = false;
    progress.completedAt = null;
    await progress.save();
  }

  const percentage = await syncEnrollmentProgress(
    req.user._id,
    lecture.course
  );

  res.json({
    success: true,
    message: 'Lecture marked as incomplete',
    data:    { percentage: percentage || 0 },
  });
});

// ============================================
// SUBMIT QUIZ
// @route POST /api/progress/lecture/:lectureId/quiz
// @access Private
// ============================================
export const submitQuiz = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { answers } = req.body;

  if (!Array.isArray(answers) || answers.length === 0) {
    res.status(400);
    throw new Error('Answers array is required');
  }

  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (lecture.contentType !== 'quiz') {
    res.status(400);
    throw new Error('This lecture is not a quiz');
  }

  const enrollment = await checkEnrollment(
    req.user._id,
    lecture.course
  );

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  const quiz           = lecture.content?.quiz;
  const totalQuestions = quiz?.questions?.length || 0;

  if (totalQuestions === 0) {
    res.status(400);
    throw new Error('Quiz has no questions');
  }

  // ✅ Limit answers to question count
  const safeAnswers = answers.slice(0, totalQuestions);

  let correctAnswers = 0;
  safeAnswers.forEach((answer, index) => {
    const question = quiz.questions[index];
    if (
      question &&
      Number.isInteger(answer) &&
      question.correctAnswer === answer
    ) {
      correctAnswers++;
    }
  });

  const score  = Math.round((correctAnswers / totalQuestions) * 100);
  const passed = score >= (quiz.passingScore || 70);

  let progress = await Progress.findOne({
    student: req.user._id,
    course:  lecture.course,
    lecture: req.params.lectureId,
  });

  const quizData = {
    score,
    totalQuestions,
    correctAnswers,
    attempts:    ((progress?.quizScore?.attempts || 0) + 1),
    lastAttempt: new Date(),
  };

  if (progress) {
    progress.quizScore = quizData;
    if (passed && !progress.isCompleted) {
      progress.isCompleted = true;
      progress.completedAt = new Date();
    }
    await progress.save();
  } else {
    progress = await Progress.create({
      student:     req.user._id,
      course:      lecture.course,
      lecture:     req.params.lectureId,
      quizScore:   quizData,
      isCompleted: passed,
      completedAt: passed ? new Date() : null,
    });
  }

  if (passed) {
    await syncEnrollmentProgress(req.user._id, lecture.course);
  }

  res.json({
    success: true,
    data: {
      score,
      totalQuestions,
      correctAnswers,
      passed,
      passingScore: quiz.passingScore || 70,
      attempts:     quizData.attempts,
    },
  });
});

// ============================================
// SUBMIT ASSIGNMENT
// @route POST /api/progress/lecture/:lectureId/assignment
// @access Private
// ============================================
export const submitAssignment = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { content } = req.body;
  const safeContent = sanitizeText(content || '', 10000);

  const lecture = await Lecture.findById(req.params.lectureId).lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (lecture.contentType !== 'assignment') {
    res.status(400);
    throw new Error('This lecture is not an assignment');
  }

  const enrollment = await checkEnrollment(
    req.user._id,
    lecture.course
  );

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  // ✅ Handle file uploads safely
  const attachments = Array.isArray(req.files)
    ? req.files
        .filter((f) => f.filename)
        .map((f) => f.filename)
        .slice(0, 10) // max 10 attachments
    : [];

  const submissionData = {
    submittedAt: new Date(),
    content:     safeContent,
    attachments,
  };

  let progress = await Progress.findOne({
    student: req.user._id,
    course:  lecture.course,
    lecture: req.params.lectureId,
  });

  if (progress) {
    progress.assignmentSubmission = submissionData;
    await progress.save();
  } else {
    progress = await Progress.create({
      student:              req.user._id,
      course:               lecture.course,
      lecture:              req.params.lectureId,
      assignmentSubmission: submissionData,
    });
  }

  res.json({
    success: true,
    message: 'Assignment submitted successfully',
    data:    progress,
  });
});

// ============================================
// GRADE ASSIGNMENT (Instructor)
// @route PUT /api/progress/:progressId/grade
// @access Private/Instructor
// ============================================
export const gradeAssignment = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.progressId)) {
    res.status(400);
    throw new Error('Invalid progress ID');
  }

  const { grade, feedback } = req.body;

  // ✅ Validate grade
  const safeGrade = safeNumber(grade, 0, 100);
  if (grade === undefined || grade === null) {
    res.status(400);
    throw new Error('Grade is required');
  }

  const progress = await Progress.findById(req.params.progressId)
    .populate({ path: 'course', select: 'instructor totalLectures' });

  if (!progress) {
    res.status(404);
    throw new Error('Progress not found');
  }

  // ✅ Authorization check
  if (
    progress.course.instructor.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    securityLog('GRADE_UNAUTHORIZED', {
      userId:     req.user._id,
      progressId: req.params.progressId,
      ip:         req.ip,
    });
    res.status(403);
    throw new Error('Not authorized to grade this assignment');
  }

  if (!progress.assignmentSubmission?.submittedAt) {
    res.status(400);
    throw new Error('No assignment submission found');
  }

  // ✅ Update grade
  progress.assignmentSubmission.grade      = safeGrade;
  progress.assignmentSubmission.feedback   = sanitizeText(feedback || '', 2000);
  progress.assignmentSubmission.gradedBy   = req.user._id;
  progress.assignmentSubmission.gradedAt   = new Date();

  // ✅ Auto-complete at 60%
  const lecture   = await Lecture.findById(progress.lecture).lean();
  const maxScore  = lecture?.content?.assignment?.maxScore || 100;
  const passMark  = maxScore * 0.6;

  if (safeGrade >= passMark && !progress.isCompleted) {
    progress.isCompleted = true;
    progress.completedAt = new Date();
    await progress.save();
    await syncEnrollmentProgress(
      progress.student,
      progress.course._id
    );
  } else {
    await progress.save();
  }

  res.json({
    success: true,
    message: 'Assignment graded successfully',
    data:    progress,
  });
});

// ============================================
// ADD NOTE
// @route POST /api/progress/lecture/:lectureId/notes
// @access Private
// ============================================
export const addNote = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { content, timestamp } = req.body;

  if (!content || !content.trim()) {
    res.status(400);
    throw new Error('Note content is required');
  }

  const safeContent   = sanitizeText(content, 2000);
  const safeTimestamp = safeNumber(timestamp, 0, 999999);

  const lecture = await Lecture.findById(req.params.lectureId)
    .select('course').lean();

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const enrollment = await checkEnrollment(
    req.user._id,
    lecture.course
  );

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  let progress = await Progress.findOne({
    student: req.user._id,
    course:  lecture.course,
    lecture: req.params.lectureId,
  });

  const newNote = {
    content:   safeContent,
    timestamp: safeTimestamp,
    createdAt: new Date(),
  };

  if (progress) {
    // ✅ Limit notes
    if (progress.notes.length >= 100) {
      res.status(400);
      throw new Error('Maximum 100 notes per lecture allowed');
    }
    progress.notes.push(newNote);
    await progress.save();
  } else {
    progress = await Progress.create({
      student:  req.user._id,
      course:   lecture.course,
      lecture:  req.params.lectureId,
      notes:    [newNote],
    });
  }

  res.status(201).json({
    success: true,
    data:    progress.notes,
  });
});

// ============================================
// GET NOTES
// @route GET /api/progress/lecture/:lectureId/notes
// @access Private
// ============================================
export const getNotes = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const progress = await Progress.findOne({
    student: req.user._id,
    lecture: req.params.lectureId,
  }).select('notes').lean();

  res.json({
    success: true,
    data:    progress?.notes || [],
  });
});

// ============================================
// DELETE NOTE
// @route DELETE /api/progress/lecture/:lectureId/notes/:noteIndex
// @access Private
// ============================================
export const deleteNote = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.lectureId)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const noteIndex = parseInt(req.params.noteIndex, 10);

  if (isNaN(noteIndex) || noteIndex < 0) {
    res.status(400);
    throw new Error('Invalid note index');
  }

  const progress = await Progress.findOne({
    student: req.user._id,
    lecture: req.params.lectureId,
  });

  if (!progress) {
    res.status(404);
    throw new Error('Progress not found');
  }

  if (noteIndex >= progress.notes.length) {
    res.status(404);
    throw new Error('Note not found');
  }

  progress.notes.splice(noteIndex, 1);
  await progress.save();

  res.json({
    success: true,
    message: 'Note deleted successfully',
    data:    progress.notes,
  });
});

// ============================================
// GET STUDENT PROGRESS (Instructor)
// @route GET /api/progress/course/:courseId/students
// @access Private/Instructor
// ============================================
export const getStudentProgress = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const course = await Course.findById(req.params.courseId)
    .select('instructor title totalLectures').lean();

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    course.instructor.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    securityLog('STUDENT_PROGRESS_UNAUTHORIZED', {
      userId:   req.user._id,
      courseId: req.params.courseId,
      ip:       req.ip,
    });
    res.status(403);
    throw new Error('Not authorized');
  }

  const enrollments = await Enrollment.find({
    course: req.params.courseId,
    status: { $in: ['active', 'completed'] },
  })
    .populate('student', 'firstName lastName email avatar')
    .select(
      'student status progress stats enrollmentDate completedAt certificateIssued'
    )
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data:    enrollments,
    meta: {
      totalStudents:   enrollments.length,
      completedCount:  enrollments.filter((e) => e.status === 'completed').length,
      activeCount:     enrollments.filter((e) => e.status === 'active').length,
    },
  });
});