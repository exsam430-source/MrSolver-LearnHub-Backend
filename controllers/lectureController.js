// controllers/lectureController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import DOMPurify from 'isomorphic-dompurify';
import Lecture from '../models/Lecture.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { extractYouTubeId } from '../utils/helpers.js';
import { getFullImageUrl } from '../utils/imageHelper.js';
import { securityLog } from '../middleware/auditLog.js';

// ============================================
// SECURITY HELPERS
// ============================================

// ✅ Validate MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ✅ Sanitize HTML content (for articles/lessons)
const sanitizeHtml = (html) => {
  if (!html || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p','br','strong','em','u','h1','h2','h3','h4',
      'ul','ol','li','code','pre','blockquote','a',
      'table','thead','tbody','tr','th','td','img',
      'div','span','hr'
    ],
    ALLOWED_ATTR: [
      'href','src','alt','class','target','rel',
      'style','data-language'
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_SCRIPTS: true,
    FORBID_TAGS: ['script','iframe','object','embed','form'],
  });
};

// ✅ Sanitize plain text (no HTML allowed)
const sanitizeText = (text, maxLength = 200) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/[<>'"]/g, '')
    .trim()
    .substring(0, maxLength);
};

// ✅ Sanitize URL (only allow safe URLs)
const sanitizeUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed.substring(0, 2000);
  }
  return '';
};

// ✅ Validate YouTube URL
const isValidYouTubeUrl = (url) => {
  if (!url) return false;
  const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return pattern.test(url);
};

// ✅ Validate Zoom URL
const isValidZoomUrl = (url) => {
  if (!url) return false;
  const pattern = /^https:\/\/([\w-]+\.)?zoom\.us\/.+/;
  return pattern.test(url);
};

// ✅ Whitelist allowed content types
const ALLOWED_CONTENT_TYPES = [
  'video','youtube','article','quiz',
  'assignment','file','zoom','interactive','lesson'
];

// ✅ Whitelist allowed code types
const ALLOWED_CODE_TYPES = [
  'html','css','javascript','htmlcss','htmljs','fullstack',
  'python','php','java','cpp','csharp','ruby','go','rust',
  'sql','bash','nodejs','typescript','c','swift','kotlin'
];

// ✅ Whitelist allowed section types for lessons
const ALLOWED_SECTION_TYPES = [
  'heading','paragraph','list','code-example',
  'note','table','divider','html-structure','image','video-embed'
];

// ✅ Merge overlapping watch segments
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

// ✅ Transform lecture (add full URLs)
const transformLecture = (lecture) => {
  if (!lecture) return lecture;
  const obj = lecture.toObject ? lecture.toObject() : { ...lecture };

  if (obj.content?.videoUrl) {
    obj.content.videoUrl = getFullImageUrl(obj.content.videoUrl);
  }

  if (obj.resources) {
    obj.resources = obj.resources.map((r) => ({
      ...r,
      url: getFullImageUrl(r.url),
    }));
  }

  return obj;
};

// ✅ Sanitize lesson sections recursively
const sanitizeLessonSections = (sections) => {
  if (!Array.isArray(sections)) return [];

  return sections
    .filter((s) => s && typeof s === 'object')
    .slice(0, 100) // max 100 sections
    .map((section) => {
      // Validate section type
      const type = ALLOWED_SECTION_TYPES.includes(section.type)
        ? section.type
        : 'paragraph';

      const sanitized = { type };

      switch (type) {
        case 'heading':
          sanitized.content = sanitizeText(section.content, 200);
          sanitized.level = Math.min(Math.max(parseInt(section.level) || 2, 1), 6);
          break;

        case 'paragraph':
          sanitized.content = sanitizeHtml(section.content);
          break;

        case 'list':
          sanitized.listType = ['ordered','unordered'].includes(section.listType)
            ? section.listType : 'unordered';
          sanitized.items = Array.isArray(section.items)
            ? section.items
                .slice(0, 50)
                .map((i) => sanitizeText(String(i || ''), 500))
            : [];
          break;

        case 'code-example':
          sanitized.title = sanitizeText(section.title, 200);
          sanitized.codeType = ALLOWED_CODE_TYPES.includes(section.codeType)
            ? section.codeType : 'html';
          sanitized.explanation = sanitizeText(section.explanation, 1000);
          sanitized.isTryIt = !!section.isTryIt;

          // Sanitize code object
          if (section.code && typeof section.code === 'object') {
            sanitized.code = {};
            ALLOWED_CODE_TYPES.forEach((lang) => {
              if (section.code[lang]) {
                sanitized.code[lang] = String(section.code[lang])
                  .substring(0, 50000);
              }
            });
          }

          if (section.solution && typeof section.solution === 'object') {
            sanitized.solution = {};
            ALLOWED_CODE_TYPES.forEach((lang) => {
              if (section.solution[lang]) {
                sanitized.solution[lang] = String(section.solution[lang])
                  .substring(0, 50000);
              }
            });
          }
          break;

        case 'note':
          sanitized.noteType = ['note','tip','warning','info'].includes(section.noteType)
            ? section.noteType : 'note';
          sanitized.content = sanitizeText(section.content, 1000);
          break;

        case 'table':
          sanitized.headers = Array.isArray(section.headers)
            ? section.headers.slice(0, 20).map((h) => sanitizeText(String(h || ''), 100))
            : [];
          sanitized.rows = Array.isArray(section.rows)
            ? section.rows.slice(0, 100).map((row) =>
                Array.isArray(row)
                  ? row.slice(0, 20).map((cell) => sanitizeText(String(cell || ''), 200))
                  : []
              )
            : [];
          break;

        case 'image':
          sanitized.imageUrl = sanitizeUrl(section.imageUrl);
          sanitized.imageAlt = sanitizeText(section.imageAlt, 200);
          break;

        case 'divider':
          break;

        default:
          sanitized.content = sanitizeText(section.content, 1000);
      }

      return sanitized;
    });
};

// ============================================
// CONTROLLERS
// ============================================

// @desc    Get lecture by ID
// @route   GET /api/lectures/:id
// @access  Private
export const getLecture = asyncHandler(async (req, res) => {
  // ✅ Validate ObjectId
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'title instructor'
  );

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  const courseId = lecture.course?._id || lecture.course;
  const instructorId =
    lecture.course?.instructor?._id || lecture.course?.instructor;

  // ✅ ADMIN - full access
  if (req.user.role === 'admin') {
    return res.json({ success: true, data: transformLecture(lecture) });
  }

  // ✅ INSTRUCTOR - only their own courses
  if (req.user.role === 'instructor') {
    if (instructorId?.toString() !== req.user._id.toString()) {
      securityLog('LECTURE_UNAUTHORIZED_ACCESS', {
        userId: req.user._id,
        lectureId: req.params.id,
        ip: req.ip,
      });
      res.status(403);
      throw new Error('Not authorized to access this lecture');
    }
    return res.json({ success: true, data: transformLecture(lecture) });
  }

  // ✅ STUDENT access logic
  if (req.user.role === 'student') {

    // ✅ Preview lectures - always accessible
    if (lecture.isPreview) {
      return res.json({ success: true, data: transformLecture(lecture) });
    }

    // ✅ Check enrollment - without status filter first
    const enrollment = await Enrollment.findOne({
      student: req.user._id,
      course:  courseId,
    });

    // ✅ Not enrolled at all
    if (!enrollment) {
      res.status(403);
      throw new Error('You are not enrolled in this course');
    }

    // ✅ Enrollment exists but cancelled/expired
    if (
      enrollment.status &&
      !['active', 'completed'].includes(enrollment.status)
    ) {
      res.status(403);
      throw new Error('Your enrollment is not active');
    }

    // ✅ Lecture not published - only block if truly not published
    // AND not a preview
    if (!lecture.isPublished) {
      res.status(403);
      throw new Error('This lecture is not published yet');
    }

    return res.json({ success: true, data: transformLecture(lecture) });
  }

  // ✅ Any other role - deny
  res.status(403);
  throw new Error('Access denied');
});

// @desc    Create lecture
// @route   POST /api/lectures
// @access  Private/Instructor
export const createLecture = asyncHandler(async (req, res) => {
  // ✅ Destructure only what we need (never spread req.body directly)
  const {
    title,
    description,
    courseId,
    sectionIndex,
    contentType,
    isPreview,
    isPublished,
    duration,
  } = req.body;

  // ✅ Validate required fields
  if (!title || typeof title !== 'string' || title.trim().length < 1) {
    res.status(400);
    throw new Error('Lecture title is required');
  }

  if (!courseId || !isValidObjectId(courseId)) {
    res.status(400);
    throw new Error('Valid course ID is required');
  }

  if (sectionIndex === undefined || sectionIndex === null) {
    res.status(400);
    throw new Error('Section index is required');
  }

  if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
    res.status(400);
    throw new Error('Invalid content type');
  }

  // ✅ Sanitize inputs
  const sanitizedTitle = sanitizeText(title, 200);
  const sanitizedDescription = sanitizeText(description || '', 1000);
  const sanitizedSectionIndex = parseInt(sectionIndex, 10);

  if (isNaN(sanitizedSectionIndex) || sanitizedSectionIndex < 0) {
    res.status(400);
    throw new Error('Invalid section index');
  }

  const sanitizedDuration = duration
    ? Math.max(0, Math.min(parseInt(duration, 10) || 0, 99999))
    : 0;

  // ✅ Verify course exists and user owns it
  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor.toString() !== req.user._id.toString()
  ) {
    securityLog('LECTURE_CREATE_UNAUTHORIZED', {
      userId: req.user._id,
      courseId,
      ip: req.ip,
    });
    res.status(403);
    throw new Error('Not authorized to add lectures to this course');
  }

  if (!course.curriculum[sanitizedSectionIndex]) {
    res.status(400);
    throw new Error(`Section at index ${sanitizedSectionIndex} does not exist`);
  }

  const sectionLectures =
    course.curriculum[sanitizedSectionIndex]?.lectures || [];
  const order = sectionLectures.length;

  // ✅ Create with only sanitized values
  const lecture = await Lecture.create({
    title: sanitizedTitle,
    description: sanitizedDescription,
    course: courseId,
    sectionIndex: sanitizedSectionIndex,
    order,
    contentType,
    isPreview: !!isPreview,
    isPublished: !!isPublished,
    duration: sanitizedDuration,
  });

  course.curriculum[sanitizedSectionIndex].lectures.push(lecture._id);
  course.totalLectures = await Lecture.countDocuments({ course: courseId });
  await course.save();

  res.status(201).json({ success: true, data: transformLecture(lecture) });
});

// @desc    Update lecture
// @route   PUT /api/lectures/:id
// @access  Private/Instructor
export const updateLecture = asyncHandler(async (req, res) => {
  // ✅ Validate ObjectId
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    securityLog('LECTURE_UPDATE_UNAUTHORIZED', {
      userId: req.user._id,
      lectureId: req.params.id,
      ip: req.ip,
    });
    res.status(403);
    throw new Error('Not authorized');
  }

  // ✅ NEVER use req.body directly - whitelist allowed fields only
  const allowedUpdates = {};

  if (req.body.title !== undefined) {
    allowedUpdates.title = sanitizeText(req.body.title, 200);
  }
  if (req.body.description !== undefined) {
    allowedUpdates.description = sanitizeText(req.body.description, 1000);
  }
  if (req.body.isPreview !== undefined) {
    allowedUpdates.isPreview = !!req.body.isPreview;
  }
  if (req.body.isPublished !== undefined) {
    allowedUpdates.isPublished = !!req.body.isPublished;
  }
  if (req.body.duration !== undefined) {
    allowedUpdates.duration = Math.max(
      0,
      Math.min(parseInt(req.body.duration, 10) || 0, 99999)
    );
  }
  if (req.body.order !== undefined) {
    allowedUpdates.order = Math.max(
      0,
      parseInt(req.body.order, 10) || 0
    );
  }

  const updated = await Lecture.findByIdAndUpdate(
    req.params.id,
    allowedUpdates,
    { new: true, runValidators: true }
  );

  res.json({ success: true, data: transformLecture(updated) });
});

// @desc    Upload video to lecture
// @route   PUT /api/lectures/:id/video
// @access  Private/Instructor
// @desc    Upload video to lecture
// @route   PUT /api/lectures/:id/video
// @access  Private/Instructor
export const uploadLectureVideo = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

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

  // ✅ Check file exists
  if (!req.file) {
    res.status(400);
    throw new Error('Please upload a video file');
  }

  // ✅ Debug in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Video upload received:', {
      fieldname: req.file.fieldname,
      mimetype:  req.file.mimetype,
      size:      req.file.size,
      filename:  req.file.filename,
    });
  }

  // ✅ Validate mime type
  const allowedMimeTypes = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/mpeg',
    'video/ogg',
  ];

  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    res.status(400);
    throw new Error(
      `Invalid video file type: ${req.file.mimetype}. ` +
      'Allowed: MP4, WebM, MOV, AVI, MKV'
    );
  }

  // ✅ Save video path
  lecture.content         = lecture.content || {};
  lecture.content.videoUrl = `lectures/${req.file.filename}`;
  lecture.contentType     = 'video';

  await lecture.save();

  // ✅ Update course total duration
  try {
    const lectures    = await Lecture.find({ course: lecture.course._id });
    const totalDuration = lectures.reduce(
      (acc, l) => acc + (l.duration || 0), 0
    );
    await Course.findByIdAndUpdate(lecture.course._id, {
      duration: totalDuration,
    });
  } catch (e) {
    // Non-critical
    console.warn('Duration update failed:', e.message);
  }

  res.json({
    success: true,
    message: 'Video uploaded successfully',
    data: {
      videoUrl: getFullImageUrl(lecture.content.videoUrl),
    },
  });
});

export const addYouTubeVideo = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  // ✅ Accept both field names for safety
  const youtubeUrl =
    req.body.youtubeUrl ||
    req.body.url        ||
    req.body.youtube_url;

  if (!youtubeUrl || typeof youtubeUrl !== 'string') {
    res.status(400);
    throw new Error('YouTube URL is required');
  }

  const trimmedUrl = youtubeUrl.trim();

  if (!trimmedUrl) {
    res.status(400);
    throw new Error('YouTube URL cannot be empty');
  }

  // ✅ More lenient YouTube URL validation
  const isYouTube = (url) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === 'youtube.com'       ||
        parsed.hostname === 'www.youtube.com'   ||
        parsed.hostname === 'youtu.be'          ||
        parsed.hostname === 'm.youtube.com'     ||
        parsed.hostname === 'www.youtu.be'
      );
    } catch {
      return false;
    }
  };

  if (!isYouTube(trimmedUrl)) {
    res.status(400);
    throw new Error(
      'Invalid YouTube URL. Must be from youtube.com or youtu.be'
    );
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

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

  // ✅ Extract YouTube ID
  const youtubeId = extractYouTubeId(trimmedUrl);

  if (!youtubeId) {
    res.status(400);
    throw new Error(
      'Could not extract YouTube video ID from URL. ' +
      'Please use a standard YouTube URL format.'
    );
  }

  lecture.content = lecture.content || {};
  lecture.content.youtubeUrl = sanitizeUrl(trimmedUrl);
  lecture.content.youtubeId  = sanitizeText(youtubeId, 20);
  lecture.contentType        = 'youtube';
  await lecture.save();

  res.json({
    success: true,
    message: 'YouTube video added successfully',
    data: {
      youtubeUrl: lecture.content.youtubeUrl,
      youtubeId:  lecture.content.youtubeId,
    },
  });
});
// @desc    Add article content
// @route   PUT /api/lectures/:id/article
// @access  Private/Instructor
export const addArticleContent = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { articleContent } = req.body;

  if (!articleContent) {
    res.status(400);
    throw new Error('Article content is required');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

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

  // ✅ Sanitize HTML content
  lecture.content = lecture.content || {};
  lecture.content.articleContent = sanitizeHtml(articleContent);
  lecture.contentType = 'article';
  await lecture.save();

  res.json({ success: true, data: transformLecture(lecture) });
});

// @desc    Add quiz
// @route   PUT /api/lectures/:id/quiz
// @access  Private/Instructor
export const addQuiz = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { questions, passingScore, timeLimit } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400);
    throw new Error('Quiz must have at least one question');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

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

  // ✅ Sanitize quiz questions
  const sanitizedQuestions = questions
    .slice(0, 100) // max 100 questions
    .map((q) => ({
      question: sanitizeText(q.question, 500),
      options: Array.isArray(q.options)
        ? q.options.slice(0, 6).map((o) => sanitizeText(String(o), 200))
        : [],
      correctAnswer: Math.max(
        0,
        Math.min(parseInt(q.correctAnswer) || 0, 5)
      ),
      explanation: sanitizeText(q.explanation || '', 500),
      points: Math.max(1, Math.min(parseInt(q.points) || 1, 100)),
    }));

  lecture.content = lecture.content || {};
  lecture.content.quiz = {
    questions: sanitizedQuestions,
    passingScore: Math.max(
      0, Math.min(parseInt(passingScore) || 70, 100)
    ),
    timeLimit: timeLimit
      ? Math.max(1, Math.min(parseInt(timeLimit), 300))
      : undefined,
  };
  lecture.contentType = 'quiz';
  await lecture.save();

  res.json({ success: true, data: transformLecture(lecture) });
});

// @desc    Delete lecture
// @route   DELETE /api/lectures/:id
// @access  Private/Instructor
export const deleteLecture = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    securityLog('LECTURE_DELETE_UNAUTHORIZED', {
      userId: req.user._id,
      lectureId: req.params.id,
      ip: req.ip,
    });
    res.status(403);
    throw new Error('Not authorized');
  }

  const course = await Course.findById(lecture.course._id);
  if (course?.curriculum[lecture.sectionIndex]) {
    course.curriculum[lecture.sectionIndex].lectures =
      course.curriculum[lecture.sectionIndex].lectures.filter(
        (id) => id.toString() !== lecture._id.toString()
      );
    course.totalLectures =
      (await Lecture.countDocuments({ course: course._id })) - 1;
    await course.save();
  }

  await lecture.deleteOne();

  res.json({ success: true, message: 'Lecture deleted successfully' });
});

// @desc    Reorder lectures
// @route   PUT /api/lectures/reorder
// @access  Private/Instructor
export const reorderLectures = asyncHandler(async (req, res) => {
  const { courseId, sectionIndex, lectureOrders } = req.body;

  if (!courseId || !isValidObjectId(courseId)) {
    res.status(400);
    throw new Error('Valid course ID is required');
  }

  if (!Array.isArray(lectureOrders) || lectureOrders.length === 0) {
    res.status(400);
    throw new Error('Lecture orders array is required');
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
    throw new Error('Not authorized');
  }

  // ✅ Validate each lecture order item
  const sanitizedOrders = lectureOrders
    .filter(
      (item) =>
        item &&
        isValidObjectId(item.lectureId) &&
        typeof item.order === 'number'
    )
    .map((item) => ({
      lectureId: item.lectureId,
      order: Math.max(0, parseInt(item.order, 10) || 0),
    }));

  for (const item of sanitizedOrders) {
    await Lecture.findByIdAndUpdate(item.lectureId, {
      order: item.order,
    });
  }

  const sanitizedSectionIndex = Math.max(
    0,
    parseInt(sectionIndex, 10) || 0
  );

  if (course.curriculum[sanitizedSectionIndex]) {
    course.curriculum[sanitizedSectionIndex].lectures = sanitizedOrders
      .sort((a, b) => a.order - b.order)
      .map((item) => item.lectureId);
    await course.save();
  }

  res.json({ success: true, message: 'Lectures reordered successfully' });
});

// @desc    Toggle lecture publish
// @route   PATCH /api/lectures/:id/publish
// @access  Private/Instructor
export const toggleLecturePublish = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

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

  res.json({ success: true, data: { isPublished: lecture.isPublished } });
});

// @desc    Add resources to lecture
// @route   POST /api/lectures/:id/resources
// @access  Private/Instructor
export const addResources = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

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

  // ✅ Validate each file
  const allowedResourceTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  const newResources = req.files
    .filter((file) => allowedResourceTypes.includes(file.mimetype))
    .map((file) => ({
      title: sanitizeText(file.originalname, 200),
      type: file.mimetype,
      url: `resources/${file.filename}`,
    }));

  if (newResources.length === 0) {
    res.status(400);
    throw new Error('No valid files uploaded');
  }

  lecture.resources = lecture.resources || [];
  lecture.resources.push(...newResources);
  await lecture.save();

  const resourcesWithFullUrls = lecture.resources.map((r) => ({
    ...(r.toObject ? r.toObject() : r),
    url: getFullImageUrl(r.url),
  }));

  res.json({ success: true, data: resourcesWithFullUrls });
});

// @desc    Add Zoom meeting
// @route   PUT /api/lectures/:id/zoom
// @access  Private/Instructor
export const addZoomMeeting = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  // ✅ Accept multiple field names
  const meetingUrl =
    req.body.meetingUrl ||
    req.body.zoomUrl   ||
    req.body.url       ||
    '';

  // ✅ Debug log in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('Zoom body received:', JSON.stringify(req.body));
  }

  if (!meetingUrl || typeof meetingUrl !== 'string' || !meetingUrl.trim()) {
    res.status(400);
    throw new Error('Zoom meeting URL is required');
  }

  const trimmedUrl = meetingUrl.trim();

  // ✅ Validate Zoom URL - more lenient
  const isValidZoom = (url) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === 'zoom.us'       ||
        parsed.hostname === 'www.zoom.us'   ||
        parsed.hostname.endsWith('.zoom.us')
      );
    } catch {
      return false;
    }
  };

  if (!isValidZoom(trimmedUrl)) {
    res.status(400);
    throw new Error('Invalid Zoom URL. Must be a valid zoom.us URL (e.g. https://zoom.us/j/...)');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

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

  // ✅ Sanitize all zoom fields safely
  const {
    meetingId,
    password,
    scheduledAt,
    duration,
    topic,
    isRecurring,
    recurringSchedule,
  } = req.body;

  lecture.content        = lecture.content || {};
  lecture.content.zoom   = {
    meetingUrl:        sanitizeUrl(trimmedUrl),
    meetingId:         sanitizeText(meetingId         || '', 50),
    password:          sanitizeText(password          || '', 50),
    hostEmail:         sanitizeText(req.user.email    || '', 100),
    scheduledAt:       scheduledAt ? new Date(scheduledAt) : null,
    duration:          Math.max(15, Math.min(parseInt(duration, 10) || 60, 480)),
    topic:             sanitizeText(topic             || lecture.title, 200),
    isRecurring:       !!isRecurring,
    recurringSchedule: sanitizeText(recurringSchedule || '', 200),
  };
  lecture.contentType = 'zoom';

  await lecture.save();

  res.json({
    success: true,
    message: 'Zoom meeting added successfully',
    data:    transformLecture(lecture),
  });
});

// @desc    Add interactive code content
// @route   PUT /api/lectures/:id/interactive
// @access  Private/Instructor
export const addInteractiveContent = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { instructions, initialCode, solution, codeType } = req.body;

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

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

  // ✅ Validate code type
  const sanitizedCodeType = ALLOWED_CODE_TYPES.includes(codeType)
    ? codeType
    : 'html';

  // ✅ Sanitize code content (limit size)
  const sanitizeCodeObject = (codeObj) => {
    if (!codeObj || typeof codeObj !== 'object') return {};
    const result = {};
    ALLOWED_CODE_TYPES.forEach((lang) => {
      if (codeObj[lang] && typeof codeObj[lang] === 'string') {
        result[lang] = codeObj[lang].substring(0, 50000);
      } else {
        result[lang] = '';
      }
    });
    return result;
  };

  lecture.content = lecture.content || {};
  lecture.content.interactive = {
    instructions: sanitizeHtml(instructions || ''),
    initialCode: sanitizeCodeObject(initialCode),
    solution: sanitizeCodeObject(solution),
    codeType: sanitizedCodeType,
  };
  lecture.contentType = 'interactive';
  await lecture.save();

  res.json({ success: true, data: transformLecture(lecture) });
});

// @desc    Update watch settings
// @route   PUT /api/lectures/:id/watch-settings
// @access  Private/Instructor
export const updateWatchSettings = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const {
    maxWatches,
    allowRewind,
    allowSpeedChange,
    trackWatchTime,
  } = req.body;

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

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

  // ✅ Sanitize and validate watch settings
  lecture.watchSettings = {
    maxWatches: Math.max(
      0,
      Math.min(parseInt(maxWatches, 10) || 0, 9999)
    ),
    allowRewind: allowRewind !== undefined ? !!allowRewind : true,
    allowSpeedChange:
      allowSpeedChange !== undefined ? !!allowSpeedChange : true,
    trackWatchTime:
      trackWatchTime !== undefined ? !!trackWatchTime : true,
  };
  await lecture.save();

  res.json({ success: true, data: lecture.watchSettings });
});

// @desc    Add lesson content
// @route   PUT /api/lectures/:id/lesson
// @access  Private/Instructor
export const addLessonContent = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid lecture ID');
  }

  const { sections } = req.body;

  if (!Array.isArray(sections)) {
    res.status(400);
    throw new Error('Sections must be an array');
  }

  const lecture = await Lecture.findById(req.params.id).populate(
    'course',
    'instructor'
  );

  if (!lecture) {
    res.status(404);
    throw new Error('Lecture not found');
  }

  if (
    req.user.role !== 'admin' &&
    lecture.course.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized to update this lecture');
  }

  // ✅ Sanitize all lesson sections
  const sanitizedSections = sanitizeLessonSections(sections);

  lecture.content = lecture.content || {};
  lecture.content.lesson = { sections: sanitizedSections };

  // ✅ Auto-calculate duration
  if (!lecture.duration || lecture.duration === 0) {
    lecture.duration = calculateLessonDuration(sanitizedSections);
  }

  await lecture.save();

  res.status(200).json({
    success: true,
    message: 'Lesson content added successfully',
    data: transformLecture(lecture),
  });
});

// ✅ Calculate lesson reading duration
const calculateLessonDuration = (sections) => {
  if (!sections || !Array.isArray(sections)) return 5;
  let wordCount = 0;
  let codeExamples = 0;

  sections.forEach((section) => {
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
        (section.rows || []).forEach((row) => {
          wordCount += row.join(' ').split(/\s+/).length;
        });
        break;
      default:
        break;
    }
  });

  const readingTime = Math.ceil(wordCount / 200);
  const codeTime = codeExamples * 2;
  return Math.max(5, readingTime + codeTime);
};