import asyncHandler from 'express-async-handler';
import Progress from '../models/Progress.js';
import Enrollment from '../models/Enrollment.js';
import Lecture from '../models/Lecture.js';
import Course from '../models/Course.js';
import { calculateProgress } from '../utils/helpers.js';

// @desc    Get progress for a course
// @route   GET /api/progress/course/:courseId
// @access  Private
export const getCourseProgress = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  const progress = await Progress.find({
    student: req.user._id,
    course: courseId
  }).populate('lecture', 'title contentType duration');

  const course = await Course.findById(courseId);
  const completedCount = progress.filter(p => p.isCompleted).length;
  const percentage = calculateProgress(completedCount, course.totalLectures);

  res.json({
    success: true,
    data: {
      progress,
      summary: {
        totalLectures: course.totalLectures,
        completedLectures: completedCount,
        percentage
      }
    }
  });
});

// @desc    Get progress for a specific lecture
// @route   GET /api/progress/lecture/:lectureId
// @access  Private
export const getLectureProgress = asyncHandler(async (req, res) => {
  const { lectureId } = req.params;

  const lecture = await Lecture.findById(lectureId);
  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  let progress = await Progress.findOne({
    student: req.user._id,
    lecture: lectureId
  });

  if (!progress) {
    progress = {
      isCompleted: false,
      watchTime: 0,
      lastPosition: 0,
      notes: []
    };
  }

  res.json({
    success: true,
    data: progress
  });
});

// @desc    Update lecture progress
// @route   PUT /api/progress/lecture/:lectureId
// @access  Private
export const updateLectureProgress = asyncHandler(async (req, res) => {
  const { lectureId } = req.params;
  const { watchTime, lastPosition, isCompleted } = req.body;

  const lecture = await Lecture.findById(lectureId);
  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  let progress = await Progress.findOne({
    student: req.user._id,
    course: lecture.course,
    lecture: lectureId
  });

  if (progress) {
    // Update existing progress
    if (watchTime !== undefined) progress.watchTime = watchTime;
    if (lastPosition !== undefined) progress.lastPosition = lastPosition;
    if (isCompleted !== undefined) {
      progress.isCompleted = isCompleted;
      if (isCompleted && !progress.completedAt) {
        progress.completedAt = new Date();
      }
    }
    await progress.save();
  } else {
    // Create new progress
    progress = await Progress.create({
      student: req.user._id,
      course: lecture.course,
      lecture: lectureId,
      watchTime: watchTime || 0,
      lastPosition: lastPosition || 0,
      isCompleted: isCompleted || false,
      completedAt: isCompleted ? new Date() : null
    });
  }

  // Update enrollment progress
  const allProgress = await Progress.find({
    student: req.user._id,
    course: lecture.course,
    isCompleted: true
  });

  const course = await Course.findById(lecture.course);
  const completedLectureIds = allProgress.map(p => p.lecture);
  const percentage = calculateProgress(completedLectureIds.length, course.totalLectures);

  enrollment.progress.completedLectures = completedLectureIds;
  enrollment.progress.currentLecture = lectureId;
  enrollment.progress.percentage = percentage;
  enrollment.progress.lastAccessed = new Date();

  // Check if course is completed
  if (percentage === 100 && enrollment.status !== 'completed') {
    enrollment.status = 'completed';
    enrollment.completedAt = new Date();
  }

  await enrollment.save();

  res.json({
    success: true,
    data: {
      progress,
      courseProgress: {
        percentage,
        completedLectures: completedLectureIds.length,
        totalLectures: course.totalLectures
      }
    }
  });
});

// @desc    Mark lecture as complete
// @route   POST /api/progress/lecture/:lectureId/complete
// @access  Private
export const markLectureComplete = asyncHandler(async (req, res) => {
  const { lectureId } = req.params;

  const lecture = await Lecture.findById(lectureId);
  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  let progress = await Progress.findOne({
    student: req.user._id,
    course: lecture.course,
    lecture: lectureId
  });

  if (progress) {
    progress.isCompleted = true;
    progress.completedAt = new Date();
    await progress.save();
  } else {
    progress = await Progress.create({
      student: req.user._id,
      course: lecture.course,
      lecture: lectureId,
      isCompleted: true,
      completedAt: new Date()
    });
  }

  // Update enrollment
  if (!enrollment.progress.completedLectures.includes(lectureId)) {
    enrollment.progress.completedLectures.push(lectureId);
  }

  const course = await Course.findById(lecture.course);
  enrollment.progress.percentage = calculateProgress(
    enrollment.progress.completedLectures.length,
    course.totalLectures
  );
  enrollment.progress.lastAccessed = new Date();

  if (enrollment.progress.percentage === 100) {
    enrollment.status = 'completed';
    enrollment.completedAt = new Date();
  }

  await enrollment.save();

  res.json({
    success: true,
    data: {
      progress,
      courseProgress: {
        percentage: enrollment.progress.percentage,
        completedLectures: enrollment.progress.completedLectures.length,
        totalLectures: course.totalLectures
      }
    }
  });
});

// @desc    Mark lecture as incomplete
// @route   POST /api/progress/lecture/:lectureId/incomplete
// @access  Private
export const markLectureIncomplete = asyncHandler(async (req, res) => {
  const { lectureId } = req.params;

  const lecture = await Lecture.findById(lectureId);
  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const progress = await Progress.findOne({
    student: req.user._id,
    lecture: lectureId
  });

  if (progress) {
    progress.isCompleted = false;
    progress.completedAt = null;
    await progress.save();
  }

  // Update enrollment
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course
  });

  if (enrollment) {
    enrollment.progress.completedLectures = enrollment.progress.completedLectures.filter(
      id => id.toString() !== lectureId
    );

    const course = await Course.findById(lecture.course);
    enrollment.progress.percentage = calculateProgress(
      enrollment.progress.completedLectures.length,
      course.totalLectures
    );

    if (enrollment.status === 'completed') {
      enrollment.status = 'active';
      enrollment.completedAt = null;
    }

    await enrollment.save();
  }

  res.json({
    success: true,
    message: 'Lecture marked as incomplete'
  });
});

// @desc    Submit quiz
// @route   POST /api/progress/lecture/:lectureId/quiz
// @access  Private
export const submitQuiz = asyncHandler(async (req, res) => {
  const { lectureId } = req.params;
  const { answers } = req.body;

  const lecture = await Lecture.findById(lectureId);
  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (lecture.contentType !== 'quiz') {
    res.status(400);
    throw new Error('This lecture is not a quiz');
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  // Calculate score
  const quiz = lecture.content.quiz;
  let correctAnswers = 0;

  answers.forEach((answer, index) => {
    if (quiz.questions[index] && quiz.questions[index].correctAnswer === answer) {
      correctAnswers++;
    }
  });

  const totalQuestions = quiz.questions.length;
  const score = Math.round((correctAnswers / totalQuestions) * 100);
  const passed = score >= quiz.passingScore;

  // Update progress
  let progress = await Progress.findOne({
    student: req.user._id,
    course: lecture.course,
    lecture: lectureId
  });

  if (progress) {
    progress.quizScore = {
      score,
      totalQuestions,
      correctAnswers,
      attempts: (progress.quizScore?.attempts || 0) + 1,
      lastAttempt: new Date()
    };
    if (passed && !progress.isCompleted) {
      progress.isCompleted = true;
      progress.completedAt = new Date();
    }
    await progress.save();
  } else {
    progress = await Progress.create({
      student: req.user._id,
      course: lecture.course,
      lecture: lectureId,
      quizScore: {
        score,
        totalQuestions,
        correctAnswers,
        attempts: 1,
        lastAttempt: new Date()
      },
      isCompleted: passed,
      completedAt: passed ? new Date() : null
    });
  }

  // Update enrollment if passed
  if (passed && !enrollment.progress.completedLectures.includes(lectureId)) {
    enrollment.progress.completedLectures.push(lectureId);
    const course = await Course.findById(lecture.course);
    enrollment.progress.percentage = calculateProgress(
      enrollment.progress.completedLectures.length,
      course.totalLectures
    );
    await enrollment.save();
  }

  res.json({
    success: true,
    data: {
      score,
      totalQuestions,
      correctAnswers,
      passed,
      passingScore: quiz.passingScore,
      attempts: progress.quizScore.attempts
    }
  });
});

// @desc    Submit assignment
// @route   POST /api/progress/lecture/:lectureId/assignment
// @access  Private
export const submitAssignment = asyncHandler(async (req, res) => {
  const { lectureId } = req.params;
  const { content } = req.body;

  const lecture = await Lecture.findById(lectureId);
  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (lecture.contentType !== 'assignment') {
    res.status(400);
    throw new Error('This lecture is not an assignment');
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  // Handle file uploads
  let attachments = [];
  if (req.files && req.files.length > 0) {
    attachments = req.files.map(file => file.filename);
  }

  // Update progress
  let progress = await Progress.findOne({
    student: req.user._id,
    course: lecture.course,
    lecture: lectureId
  });

  if (progress) {
    progress.assignmentSubmission = {
      submittedAt: new Date(),
      content,
      attachments
    };
    await progress.save();
  } else {
    progress = await Progress.create({
      student: req.user._id,
      course: lecture.course,
      lecture: lectureId,
      assignmentSubmission: {
        submittedAt: new Date(),
        content,
        attachments
      }
    });
  }

  res.json({
    success: true,
    data: progress,
    message: 'Assignment submitted successfully'
  });
});

// @desc    Grade assignment (Instructor)
// @route   PUT /api/progress/:progressId/grade
// @access  Private/Instructor
export const gradeAssignment = asyncHandler(async (req, res) => {
  const { progressId } = req.params;
  const { grade, feedback } = req.body;

  const progress = await Progress.findById(progressId)
    .populate({
      path: 'course',
      select: 'instructor'
    });

  if (!progress) {
    res.status(404);
    throw new Error('Progress not found');
  }

  // Check if instructor
  if (
    progress.course.instructor.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (!progress.assignmentSubmission || !progress.assignmentSubmission.submittedAt) {
    res.status(400);
    throw new Error('No assignment submission found');
  }

  progress.assignmentSubmission.grade = grade;
  progress.assignmentSubmission.feedback = feedback;
  progress.assignmentSubmission.gradedBy = req.user._id;
  progress.assignmentSubmission.gradedAt = new Date();

  // Mark as complete if passed
  const lecture = await Lecture.findById(progress.lecture);
  const maxScore = lecture.content.assignment?.maxScore || 100;
  if (grade >= maxScore * 0.6) { // 60% to pass
    progress.isCompleted = true;
    progress.completedAt = new Date();

    // Update enrollment
    const enrollment = await Enrollment.findOne({
      student: progress.student,
      course: progress.course
    });

    if (enrollment && !enrollment.progress.completedLectures.includes(progress.lecture)) {
      enrollment.progress.completedLectures.push(progress.lecture);
      const course = await Course.findById(progress.course);
      enrollment.progress.percentage = calculateProgress(
        enrollment.progress.completedLectures.length,
        course.totalLectures
      );
      await enrollment.save();
    }
  }

  await progress.save();

  res.json({
    success: true,
    data: progress
  });
});

// @desc    Add note to lecture
// @route   POST /api/progress/lecture/:lectureId/notes
// @access  Private
export const addNote = asyncHandler(async (req, res) => {
  const { lectureId } = req.params;
  const { content, timestamp } = req.body;

  const lecture = await Lecture.findById(lectureId);
  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: lecture.course,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(403);
    throw new Error('You are not enrolled in this course');
  }

  let progress = await Progress.findOne({
    student: req.user._id,
    course: lecture.course,
    lecture: lectureId
  });

  const newNote = {
    content,
    timestamp: timestamp || 0,
    createdAt: new Date()
  };

  if (progress) {
    progress.notes.push(newNote);
    await progress.save();
  } else {
    progress = await Progress.create({
      student: req.user._id,
      course: lecture.course,
      lecture: lectureId,
      notes: [newNote]
    });
  }

  res.status(201).json({
    success: true,
    data: progress.notes
  });
});

// @desc    Get notes for a lecture
// @route   GET /api/progress/lecture/:lectureId/notes
// @access  Private
export const getNotes = asyncHandler(async (req, res) => {
  const { lectureId } = req.params;

  const progress = await Progress.findOne({
    student: req.user._id,
    lecture: lectureId
  });

  res.json({
    success: true,
    data: progress?.notes || []
  });
});

// @desc    Delete note
// @route   DELETE /api/progress/lecture/:lectureId/notes/:noteIndex
// @access  Private
export const deleteNote = asyncHandler(async (req, res) => {
  const { lectureId, noteIndex } = req.params;

  const progress = await Progress.findOne({
    student: req.user._id,
    lecture: lectureId
  });

  if (!progress) {
    res.status(404);
    throw new Error('Progress not found');
  }

  if (noteIndex < 0 || noteIndex >= progress.notes.length) {
    res.status(404);
    throw new Error('Note not found');
  }

  progress.notes.splice(noteIndex, 1);
  await progress.save();

  res.json({
    success: true,
    message: 'Note deleted successfully'
  });
});

// @desc    Get all student progress for a course (Instructor)
// @route   GET /api/progress/course/:courseId/students
// @access  Private/Instructor
export const getStudentProgress = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // Check if instructor
  if (
    course.instructor.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const enrollments = await Enrollment.find({
    course: courseId,
    status: { $in: ['active', 'completed'] }
  })
    .populate('student', 'firstName lastName email avatar')
    .select('student progress status completedAt enrollmentDate');

  res.json({
    success: true,
    data: enrollments
  });
});