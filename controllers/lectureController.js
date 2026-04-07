// controllers/lectureController.js
import asyncHandler from 'express-async-handler';
import Lecture from '../models/Lecture.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { extractYouTubeId } from '../utils/helpers.js';

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

// @desc Get lecture by ID
// @route GET /api/lectures/:id
// @access Private
export const getLecture = asyncHandler(async (req, res) => {
  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'title instructor'
  );

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const courseId = lecture.course?._id || lecture.course;
  const instructorId = lecture.course?.instructor?._id || lecture.course?.instructor;

  // Student must be enrolled OR lecture must be preview
  if (req.user.role === 'student') {
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course: courseId,
      status: 'active',
    });

    if (!enrollment && !lecture.isPreview) {
      res.status(403);
      throw new Error('You are not enrolled in this course');
    }

    if (!lecture.isPublished && !lecture.isPreview) {
      res.status(403);
      throw new Error('Lecture is not published yet');
    }
  }

  // Instructor must own the course
  if (req.user.role === 'instructor') {
    if (instructorId?.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized');
    }
  }

  res.json({ success: true, data: lecture });
});

// @desc Create lecture
// @route POST /api/lectures
// @access Private/Instructor
export const createLecture = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    courseId,
    sectionIndex,
    contentType,
    isPreview,
    isPublished,
    duration
  } = req.body;

  if (!title) {
    res.status(400);
    throw new Error('Lecture title is required');
  }

  if (!courseId) {
    res.status(400);
    throw new Error('Course ID is required');
  }

  if (sectionIndex === undefined || sectionIndex === null) {
    res.status(400);
    throw new Error('Section index is required');
  }

  if (!contentType) {
    res.status(400);
    throw new Error('Content type is required');
  }

  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized to add lectures to this course');
  }

  if (!course.curriculum[sectionIndex]) {
    res.status(400);
    throw new Error(`Section at index ${sectionIndex} does not exist`);
  }

  const sectionLectures = course.curriculum[sectionIndex]?.lectures || [];
  const order = sectionLectures.length;

  const lecture = await Lecture.create({
    title,
    description: description || '',
    course: courseId,
    sectionIndex: parseInt(sectionIndex, 10),
    order,
    contentType,
    isPreview: !!isPreview,
    isPublished: !!isPublished,
    duration: duration ? parseInt(duration, 10) : 0
  });

  course.curriculum[sectionIndex].lectures.push(lecture._id);
  course.totalLectures = await Lecture.countDocuments({ course: courseId });
  await course.save();

  res.status(201).json({ success: true, data: lecture });
});

// @desc Update lecture
// @route PUT /api/lectures/:id
// @access Private/Instructor
export const updateLecture = asyncHandler(async (req, res) => {
  let lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  lecture = await Lecture.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    data: lecture
  });
});

// @desc Upload video to lecture
// @route PUT /api/lectures/:id/video
// @access Private/Instructor
export const uploadLectureVideo = asyncHandler(async (req, res) => {
  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (!req.file) {
    res.status(400);
    throw new Error('Please upload a video file');
  }

  lecture.content = lecture.content || {};
  lecture.content.videoUrl = `lectures/${req.file.filename}`;
  lecture.contentType = 'video';
  await lecture.save();

  const course = await Course.findById(lecture.course._id);
  const lectures = await Lecture.find({ course: course._id });
  const totalDuration = lectures.reduce((acc, l) => acc + (l.duration || 0), 0);
  course.duration = totalDuration;
  await course.save();

  res.json({
    success: true,
    data: { videoUrl: lecture.content.videoUrl }
  });
});

// @desc Add YouTube video to lecture
// @route PUT /api/lectures/:id/youtube
// @access Private/Instructor
export const addYouTubeVideo = asyncHandler(async (req, res) => {
  const { youtubeUrl } = req.body;

  if (!youtubeUrl) {
    res.status(400);
    throw new Error('YouTube URL is required');
  }

  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const youtubeId = extractYouTubeId(youtubeUrl);
  if (!youtubeId) {
    res.status(400);
    throw new Error('Invalid YouTube URL');
  }

  lecture.content = lecture.content || {};
  lecture.content.youtubeUrl = youtubeUrl;
  lecture.content.youtubeId = youtubeId;
  lecture.contentType = 'youtube';
  await lecture.save();

  res.json({
    success: true,
    data: {
      youtubeUrl: lecture.content.youtubeUrl,
      youtubeId: lecture.content.youtubeId
    }
  });
});

// @desc Add article content to lecture
// @route PUT /api/lectures/:id/article
// @access Private/Instructor
export const addArticleContent = asyncHandler(async (req, res) => {
  const { articleContent } = req.body;

  if (!articleContent) {
    res.status(400);
    throw new Error('Article content is required');
  }

  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  lecture.content = lecture.content || {};
  lecture.content.articleContent = articleContent;
  lecture.contentType = 'article';
  await lecture.save();

  res.json({
    success: true,
    data: lecture
  });
});

// @desc Add quiz to lecture
// @route PUT /api/lectures/:id/quiz
// @access Private/Instructor
export const addQuiz = asyncHandler(async (req, res) => {
  const { questions, passingScore, timeLimit } = req.body;

  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  lecture.content = lecture.content || {};
  lecture.content.quiz = {
    questions,
    passingScore: passingScore || 70,
    timeLimit
  };
  lecture.contentType = 'quiz';
  await lecture.save();

  res.json({
    success: true,
    data: lecture
  });
});

// @desc Delete lecture
// @route DELETE /api/lectures/:id
// @access Private/Instructor
export const deleteLecture = asyncHandler(async (req, res) => {
  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  const course = await Course.findById(lecture.course._id);
  if (course.curriculum[lecture.sectionIndex]) {
    course.curriculum[lecture.sectionIndex].lectures =
      course.curriculum[lecture.sectionIndex].lectures.filter(
        id => id.toString() !== lecture._id.toString()
      );
    course.totalLectures = await Lecture.countDocuments({ course: course._id }) - 1;
    await course.save();
  }

  await lecture.deleteOne();

  res.json({
    success: true,
    message: 'Lecture deleted successfully'
  });
});

// @desc Reorder lectures
// @route PUT /api/lectures/reorder
// @access Private/Instructor
export const reorderLectures = asyncHandler(async (req, res) => {
  const { courseId, sectionIndex, lectureOrders } = req.body;

  const course = await Course.findById(courseId);

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

  for (const item of lectureOrders) {
    await Lecture.findByIdAndUpdate(item.lectureId, { order: item.order });
  }

  course.curriculum[sectionIndex].lectures = lectureOrders
    .sort((a, b) => a.order - b.order)
    .map(item => item.lectureId);

  await course.save();

  res.json({
    success: true,
    message: 'Lectures reordered successfully'
  });
});

// @desc Toggle lecture publish status
// @route PATCH /api/lectures/:id/publish
// @access Private/Instructor
export const toggleLecturePublish = asyncHandler(async (req, res) => {
  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  lecture.isPublished = !lecture.isPublished;
  await lecture.save();

  res.json({
    success: true,
    data: { isPublished: lecture.isPublished }
  });
});

// @desc Add resources to lecture
// @route POST /api/lectures/:id/resources
// @access Private/Instructor
export const addResources = asyncHandler(async (req, res) => {
  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (!req.files || req.files.length === 0) {
    res.status(400);
    throw new Error('Please upload at least one file');
  }

  const newResources = req.files.map(file => ({
    title: file.originalname,
    type: file.mimetype,
    url: `resources/${file.filename}`
  }));

  lecture.resources = lecture.resources || [];
  lecture.resources.push(...newResources);
  await lecture.save();

  res.json({
    success: true,
    data: lecture.resources
  });
});

// @desc Add Zoom meeting to lecture
// @route PUT /api/lectures/:id/zoom
// @access Private/Instructor
export const addZoomMeeting = asyncHandler(async (req, res) => {
  const { 
    meetingUrl, 
    meetingId, 
    password, 
    scheduledAt, 
    duration, 
    topic,
    isRecurring,
    recurringSchedule 
  } = req.body;

  if (!meetingUrl) {
    res.status(400);
    throw new Error('Zoom meeting URL is required');
  }

  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  lecture.content = lecture.content || {};
  lecture.content.zoom = {
    meetingUrl,
    meetingId: meetingId || '',
    password: password || '',
    hostEmail: req.user.email,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    duration: duration ? parseInt(duration, 10) : 60,
    topic: topic || lecture.title,
    isRecurring: !!isRecurring,
    recurringSchedule: recurringSchedule || ''
  };
  lecture.contentType = 'zoom';
  await lecture.save();

  res.json({
    success: true,
    data: lecture
  });
});

// @desc Add interactive code content
// @route PUT /api/lectures/:id/interactive
// @access Private/Instructor
export const addInteractiveContent = asyncHandler(async (req, res) => {
  const { 
    instructions, 
    initialCode, 
    solution, 
    codeType 
  } = req.body;

  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  lecture.content = lecture.content || {};
  lecture.content.interactive = {
    instructions: instructions || '',
    initialCode: {
      html: initialCode?.html || '',
      css: initialCode?.css || '',
      js: initialCode?.js || ''
    },
    solution: {
      html: solution?.html || '',
      css: solution?.css || '',
      js: solution?.js || ''
    },
    codeType: codeType || 'html'
  };
  lecture.contentType = 'interactive';
  await lecture.save();

  res.json({
    success: true,
    data: lecture
  });
});

// @desc Update watch settings
// @route PUT /api/lectures/:id/watch-settings
// @access Private/Instructor
export const updateWatchSettings = asyncHandler(async (req, res) => {
  const { 
    maxWatches, 
    allowRewind, 
    allowSpeedChange, 
    trackWatchTime 
  } = req.body;

  const lecture = await Lecture.findById(req.params.id)
    .populate('course', 'instructor');

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  lecture.watchSettings = {
    maxWatches: maxWatches !== undefined ? parseInt(maxWatches, 10) : 0,
    allowRewind: allowRewind !== undefined ? !!allowRewind : true,
    allowSpeedChange: allowSpeedChange !== undefined ? !!allowSpeedChange : true,
    trackWatchTime: trackWatchTime !== undefined ? !!trackWatchTime : true
  };
  await lecture.save();

  res.json({
    success: true,
    data: lecture.watchSettings
  });
});

export const addLessonContent = async (req, res) => {
  try {
    const { id } = req.params;
    const { sections } = req.body;

    const lecture = await Lecture.findById(id);
    
    if (!lecture) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lecture not found' 
      });
    }

    // Verify ownership through course
    const course = await Course.findById(lecture.course);
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: 'Course not found' 
      });
    }

    // Check if user is the instructor of the course or admin
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Not authorized to update this lecture' 
      });
    }

    // Initialize content if it doesn't exist
    if (!lecture.content) {
      lecture.content = {};
    }

    // Set the lesson content
    lecture.content.lesson = {
      sections: sections || []
    };

    // Calculate estimated duration based on content
    const estimatedDuration = calculateLessonDuration(sections);
    if (!lecture.duration || lecture.duration === 0) {
      lecture.duration = estimatedDuration;
    }

    await lecture.save();

    res.status(200).json({
      success: true,
      message: 'Lesson content added successfully',
      data: lecture
    });

  } catch (error) {
    console.error('Error adding lesson content:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to add lesson content',
      error: error.message 
    });
  }
};

/**
 * Helper function to calculate estimated reading time for lesson
 */
const calculateLessonDuration = (sections) => {
  if (!sections || !Array.isArray(sections)) return 5;

  let wordCount = 0;
  let codeExamples = 0;

  sections.forEach(section => {
    switch (section.type) {
      case 'heading':
      case 'paragraph':
        wordCount += (section.content || '').split(/\s+/).length;
        break;
      case 'list':
        wordCount += (section.items || []).join(' ').split(/\s+/).length;
        break;
      case 'code-example':
        codeExamples += 1;
        wordCount += (section.explanation || '').split(/\s+/).length;
        break;
      case 'note':
        wordCount += (section.content || '').split(/\s+/).length;
        break;
      case 'table':
        wordCount += (section.headers || []).join(' ').split(/\s+/).length;
        (section.rows || []).forEach(row => {
          wordCount += row.join(' ').split(/\s+/).length;
        });
        break;
      default:
        break;
    }
  });

  // Average reading speed: 200 words per minute
  // Code examples add 2 minutes each for understanding
  const readingTime = Math.ceil(wordCount / 200);
  const codeTime = codeExamples * 2;

  return Math.max(5, readingTime + codeTime); // Minimum 5 minutes
};