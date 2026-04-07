// controllers/paymentController.js
import asyncHandler from 'express-async-handler';
import Payment from '../models/Payment.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import { sendPaymentStatusEmail, sendEnrollmentConfirmation } from '../utils/emailService.js';
import { getFullImageUrl } from '../utils/imageHelper.js';

// Helper to transform payment
const transformPayment = (payment) => {
  if (!payment) return payment;
  const obj = payment.toObject ? payment.toObject() : payment;
  return {
    ...obj,
    screenshot: getFullImageUrl(obj.screenshot),
    additionalScreenshots: obj.additionalScreenshots?.map(getFullImageUrl) || [],
    course: obj.course ? {
      ...obj.course,
      thumbnail: getFullImageUrl(obj.course.thumbnail)
    } : obj.course,
    student: obj.student ? {
      ...obj.student,
      avatar: getFullImageUrl(obj.student.avatar)
    } : obj.student
  };
};

// @desc Submit payment proof
// @route POST /api/payments
// @access Private
export const submitPayment = asyncHandler(async (req, res) => {
  const { courseId } = req.body;

  if (!req.files || !req.files.screenshot) {
    res.status(400);
    throw new Error('Payment screenshot is required');
  }

  const course = await Course.findById(courseId);

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (!course.isPublished) {
    res.status(400);
    throw new Error('Course is not available');
  }

  const existingEnrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    status: { $in: ['pending', 'active'] }
  });

  if (existingEnrollment) {
    if (existingEnrollment.status === 'active') {
      res.status(400);
      throw new Error('You are already enrolled in this course');
    } else {
      res.status(400);
      throw new Error('You already have a pending enrollment for this course');
    }
  }

  const enrollment = await Enrollment.create({
    student: req.user._id,
    course: courseId,
    status: 'pending',
    paymentStatus: 'pending'
  });

  const screenshotPath = `payments/${req.files.screenshot[0].filename}`;
  const additionalScreenshotPaths = req.files.additionalScreenshots
    ? req.files.additionalScreenshots.map(f => `payments/${f.filename}`)
    : [];

  const payment = await Payment.create({
    student: req.user._id,
    course: courseId,
    enrollment: enrollment._id,
    amount: course.discountPrice || course.price,
    paymentMethod: 'easypaisa',
    screenshot: screenshotPath,
    additionalScreenshots: additionalScreenshotPaths,
    status: 'pending'
  });

  enrollment.payment = payment._id;
  await enrollment.save();

  res.status(201).json({
    success: true,
    data: {
      payment: transformPayment(payment),
      enrollment
    },
    message: 'Payment submitted successfully. Please wait for verification.'
  });
});

// @desc Get my payments
// @route GET /api/payments/my-payments
// @access Private
export const getMyPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status } = req.query;

  const query = { student: req.user._id };

  if (status && status !== 'all') {
    query.status = status;
  }

  const total = await Payment.countDocuments(query);
  const payments = await Payment.find(query)
    .populate('course', 'title slug thumbnail')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: payments.map(transformPayment),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc Get payment details
// @route GET /api/payments/:id
// @access Private
export const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('student', 'firstName lastName email phone avatar')
    .populate('course', 'title slug price thumbnail')
    .populate('enrollment')
    .populate('reviewedBy', 'firstName lastName');

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  if (
    payment.student._id.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  res.json({
    success: true,
    data: transformPayment(payment)
  });
});

// @desc Get all payments (Admin)
// @route GET /api/payments/admin/all
// @access Private/Admin
export const getAllPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status, startDate, endDate, search } = req.query;

  const query = {};

  if (status && status !== 'all') {
    query.status = status;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const total = await Payment.countDocuments(query);
  let payments = await Payment.find(query)
    .populate('student', 'firstName lastName email phone avatar')
    .populate('course', 'title slug price thumbnail')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  if (search) {
    const s = search.toLowerCase();
    payments = payments.filter(p =>
      p.paymentId.toLowerCase().includes(s) ||
      p.student?.firstName?.toLowerCase().includes(s) ||
      p.student?.lastName?.toLowerCase().includes(s) ||
      p.student?.email?.toLowerCase().includes(s) ||
      p.course?.title?.toLowerCase().includes(s)
    );
  }

  res.json({
    success: true,
    data: payments.map(transformPayment),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc Review payment (Approve/Reject)
// @route PUT /api/payments/:id/review
// @access Private/Admin
export const reviewPayment = asyncHandler(async (req, res) => {
  const { status, reviewNotes, rejectionReason } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    res.status(400);
    throw new Error('Invalid status. Must be approved or rejected.');
  }

  const payment = await Payment.findById(req.params.id)
    .populate('student')
    .populate('course');

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  if (payment.status !== 'pending' && payment.status !== 'under_review') {
    res.status(400);
    throw new Error('Payment has already been processed');
  }

  payment.status = status;
  payment.reviewedBy = req.user._id;
  payment.reviewedAt = new Date();
  payment.reviewNotes = reviewNotes;

  if (status === 'rejected') {
    payment.rejectionReason = rejectionReason;
  }

  await payment.save();

  const enrollment = await Enrollment.findById(payment.enrollment);

  if (status === 'approved') {
    enrollment.status = 'active';
    enrollment.paymentStatus = 'paid';
    await enrollment.save();

    await Course.findByIdAndUpdate(payment.course._id, {
      $inc: { enrollmentCount: 1 }
    });

    await User.findByIdAndUpdate(payment.student._id, {
      $addToSet: { enrolledCourses: payment.course._id }
    });

    try {
      await sendEnrollmentConfirmation(payment.student, payment.course);
    } catch (error) {
      console.error('Failed to send enrollment email:', error);
    }
  } else {
    enrollment.status = 'cancelled';
    enrollment.paymentStatus = 'failed';
    await enrollment.save();
  }

  try {
    await sendPaymentStatusEmail(payment.student, payment, status);
  } catch (error) {
    console.error('Failed to send payment status email:', error);
  }

  res.json({
    success: true,
    data: transformPayment(payment),
    message: `Payment ${status} successfully`
  });
});

// @desc Get payment statistics (Admin)
// @route GET /api/payments/stats
// @access Private/Admin
export const getPaymentStats = asyncHandler(async (req, res) => {
  const totalPayments = await Payment.countDocuments();
  const pendingPayments = await Payment.countDocuments({ status: 'pending' });
  const approvedPayments = await Payment.countDocuments({ status: 'approved' });
  const rejectedPayments = await Payment.countDocuments({ status: 'rejected' });

  const revenueResult = await Payment.aggregate([
    { $match: { status: 'approved' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalRevenue = revenueResult[0]?.total || 0;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthRevenueResult = await Payment.aggregate([
    {
      $match: {
        status: 'approved',
        createdAt: { $gte: startOfMonth }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const monthlyRevenue = monthRevenueResult[0]?.total || 0;

  res.json({
    success: true,
    data: {
      total: totalPayments,
      pending: pendingPayments,
      approved: approvedPayments,
      rejected: rejectedPayments,
      totalRevenue,
      monthlyRevenue
    }
  });
});

// @desc Mark payment as under review
// @route PATCH /api/payments/:id/under-review
// @access Private/Admin
export const markUnderReview = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  if (payment.status !== 'pending') {
    res.status(400);
    throw new Error('Only pending payments can be marked as under review');
  }

  payment.status = 'under_review';
  await payment.save();

  res.json({
    success: true,
    data: transformPayment(payment)
  });
});