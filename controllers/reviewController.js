// controllers/reviewController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';  // ADD THIS IMPORT
import Review from '../models/Review.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';

// @desc    Get reviews for a course
// @route   GET /api/reviews/course/:courseId
// @access  Public
export const getCourseReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { sort } = req.query;
  const { courseId } = req.params;

  // Validate courseId
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  let sortOptions = { createdAt: -1 };
  if (sort === 'rating-high') {
    sortOptions = { rating: -1 };
  } else if (sort === 'rating-low') {
    sortOptions = { rating: 1 };
  } else if (sort === 'helpful') {
    sortOptions = { helpfulCount: -1 };
  }

  // Convert to ObjectId for query
  const courseObjectId = new mongoose.Types.ObjectId(courseId);

  const query = { course: courseObjectId, isApproved: true };
  const total = await Review.countDocuments(query);

  const reviews = await Review.find(query)
    .populate('student', 'firstName lastName avatar')
    .populate('response.respondedBy', 'firstName lastName')
    .sort(sortOptions)
    .skip(skip)
    .limit(limit);

  // Calculate rating distribution with ObjectId
  const ratingDistribution = await Review.aggregate([
    { $match: { course: courseObjectId, isApproved: true } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
    { $sort: { _id: -1 } }
  ]);

  res.json({
    success: true,
    data: reviews,
    ratingDistribution,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc    Get review stats for a course
// @route   GET /api/reviews/stats/:courseId
// @access  Public
export const getReviewStats = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  // Validate courseId
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  // Convert to ObjectId for aggregate
  const courseObjectId = new mongoose.Types.ObjectId(courseId);

  const stats = await Review.aggregate([
    { $match: { course: courseObjectId, isApproved: true } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        fiveStars: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        fourStars: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        threeStars: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        twoStars: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
      }
    }
  ]);

  const defaultStats = {
    averageRating: 0,
    totalReviews: 0,
    fiveStars: 0,
    fourStars: 0,
    threeStars: 0,
    twoStars: 0,
    oneStar: 0
  };

  const result = stats[0] || defaultStats;
  
  // Round average rating
  if (result.averageRating) {
    result.averageRating = Math.round(result.averageRating * 10) / 10;
  }

  console.log('📊 Review stats for course', courseId, ':', result);

  res.json({
    success: true,
    data: result
  });
});

// @desc    Get my reviews
// @route   GET /api/reviews/my-reviews
// @access  Private
export const getMyReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ student: req.user._id })
    .populate('course', 'title slug thumbnail')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: reviews
  });
});

// @desc    Get single review
// @route   GET /api/reviews/:id
// @access  Public
export const getReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id)
    .populate('student', 'firstName lastName avatar')
    .populate('course', 'title slug')
    .populate('response.respondedBy', 'firstName lastName');

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  res.json({
    success: true,
    data: review
  });
});

// @desc    Add review
// @route   POST /api/reviews
// @access  Private
export const addReview = asyncHandler(async (req, res) => {
  const { courseId, rating, title, comment } = req.body;

  // Validate courseId
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const courseObjectId = new mongoose.Types.ObjectId(courseId);

  // Check if enrolled
  const enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseObjectId,
    status: { $in: ['active', 'completed'] }
  });

  if (!enrollment) {
    res.status(400);
    throw new Error('You must be enrolled in the course to leave a review');
  }

  // Check for existing review
  const existingReview = await Review.findOne({
    student: req.user._id,
    course: courseObjectId
  });

  if (existingReview) {
    res.status(400);
    throw new Error('You have already reviewed this course');
  }

  const review = await Review.create({
    course: courseObjectId,
    student: req.user._id,
    rating,
    title,
    comment,
    isVerifiedPurchase: true,
    isApproved: true
  });

  // Populate student info for response
  await review.populate('student', 'firstName lastName avatar');

  // Update course rating
  await updateCourseRating(courseObjectId);

  res.status(201).json({
    success: true,
    data: review
  });
});

// @desc    Update review
// @route   PUT /api/reviews/:id
// @access  Private
export const updateReview = asyncHandler(async (req, res) => {
  const { rating, title, comment } = req.body;

  let review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Check ownership
  if (review.student.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to update this review');
  }

  review.rating = rating || review.rating;
  review.title = title !== undefined ? title : review.title;
  review.comment = comment || review.comment;

  await review.save();
  await review.populate('student', 'firstName lastName avatar');

  // Update course rating
  await updateCourseRating(review.course);

  res.json({
    success: true,
    data: review
  });
});

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Private
export const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Check ownership or admin
  if (
    review.student.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized to delete this review');
  }

  const courseId = review.course;
  await review.deleteOne();

  // Update course rating
  await updateCourseRating(courseId);

  res.json({
    success: true,
    message: 'Review deleted successfully'
  });
});

// @desc    Mark review as helpful
// @route   POST /api/reviews/:id/helpful
// @access  Private
export const markHelpful = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Check if already marked
  const alreadyMarked = review.helpfulBy.some(
    id => id.toString() === req.user._id.toString()
  );

  if (alreadyMarked) {
    // Remove mark
    review.helpfulBy = review.helpfulBy.filter(
      id => id.toString() !== req.user._id.toString()
    );
    review.helpfulCount = Math.max(0, review.helpfulCount - 1);
  } else {
    // Add mark
    review.helpfulBy.push(req.user._id);
    review.helpfulCount += 1;
  }

  await review.save();

  res.json({
    success: true,
    data: {
      helpfulCount: review.helpfulCount,
      isMarked: !alreadyMarked
    }
  });
});

// @desc    Add response to review (Instructor)
// @route   POST /api/reviews/:id/respond
// @access  Private/Instructor
export const respondToReview = asyncHandler(async (req, res) => {
  const { content } = req.body;

  const review = await Review.findById(req.params.id)
    .populate('course', 'instructor');

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Check if instructor owns the course or is admin
  if (
    review.course.instructor.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized to respond to this review');
  }

  review.response = {
    content,
    respondedBy: req.user._id,
    respondedAt: new Date()
  };

  await review.save();
  await review.populate('response.respondedBy', 'firstName lastName');

  res.json({
    success: true,
    data: review
  });
});

// @desc    Delete response from review
// @route   DELETE /api/reviews/:id/respond
// @access  Private/Instructor
export const deleteResponse = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id)
    .populate('course', 'instructor');

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Check if instructor owns the course or is admin
  if (
    review.course.instructor.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  review.response = undefined;
  await review.save();

  res.json({
    success: true,
    message: 'Response deleted successfully'
  });
});

// @desc    Get all reviews (Admin)
// @route   GET /api/reviews/admin/all
// @access  Private/Admin
export const getAllReviewsAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status, course, rating } = req.query;

  const query = {};

  if (status === 'approved') {
    query.isApproved = true;
  } else if (status === 'pending') {
    query.isApproved = false;
  }

  if (course && mongoose.Types.ObjectId.isValid(course)) {
    query.course = new mongoose.Types.ObjectId(course);
  }

  if (rating) {
    query.rating = parseInt(rating);
  }

  const total = await Review.countDocuments(query);
  const reviews = await Review.find(query)
    .populate('student', 'firstName lastName email avatar')
    .populate('course', 'title slug')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: reviews,
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc    Approve/Reject review (Admin)
// @route   PATCH /api/reviews/:id/approve
// @access  Private/Admin
export const toggleApproval = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);

  if (!review) {
    res.status(404);
    throw new Error('Review not found');
  }

  review.isApproved = !review.isApproved;
  await review.save();

  // Update course rating
  await updateCourseRating(review.course);

  res.json({
    success: true,
    data: { isApproved: review.isApproved }
  });
});

// Helper function to update course rating
const updateCourseRating = async (courseId) => {
  try {
    const courseObjectId = mongoose.Types.ObjectId.isValid(courseId) 
      ? new mongoose.Types.ObjectId(courseId)
      : courseId;

    const stats = await Review.aggregate([
      { $match: { course: courseObjectId, isApproved: true } },
      {
        $group: {
          _id: '$course',
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    if (stats.length > 0) {
      await Course.findByIdAndUpdate(courseId, {
        'rating.average': Math.round(stats[0].averageRating * 10) / 10,
        'rating.count': stats[0].totalReviews
      });
    } else {
      await Course.findByIdAndUpdate(courseId, {
        'rating.average': 0,
        'rating.count': 0
      });
    }
  } catch (error) {
    console.error('Error updating course rating:', error);
  }
};