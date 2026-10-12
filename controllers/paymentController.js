// controllers/paymentController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Enrollment from '../models/Enrollment.js';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import {
  sendPaymentStatusEmail,
  sendEnrollmentConfirmation
} from '../utils/emailService.js';
import { getFullImageUrl } from '../utils/imageHelper.js';
import { securityLog } from '../middleware/auditLog.js';
import PDFDocument from 'pdfkit';

// =============================================
// HELPERS
// =============================================

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const transformPayment = (payment) => {
  if (!payment) return null;
  const obj = payment.toObject ? payment.toObject() : payment;
  return {
    ...obj,
    screenshot: getFullImageUrl(obj.screenshot),
    additionalScreenshots: (obj.additionalScreenshots || []).map(getFullImageUrl),
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

const sendEmailAsync = (emailFn, ...args) => {
  setImmediate(async () => {
    try {
      await emailFn(...args);
    } catch (err) {
      console.error('Background email failed:', err.message);
    }
  });
};

// =============================================
// SUBMIT PAYMENT PROOF
// =============================================
export const submitPayment = asyncHandler(async (req, res) => {
  const { courseId } = req.body;

  if (!courseId || !isValidId(courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  if (!req.files || !req.files.screenshot) {
    res.status(400);
    throw new Error('Payment screenshot is required');
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

  // ✅ Don't accept payment for free courses
  if (course.isFreeCourse || course.pricingType === 'free') {
    res.status(400);
    throw new Error('This is a free course. You can enroll directly without payment.');
  }

  // ✅ Check existing active enrollment
  const existingEnrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    status: { $in: ['active', 'completed'] }
  }).lean();

  if (existingEnrollment) {
    res.status(400);
    throw new Error('You are already enrolled in this course');
  }

  // ✅ Check pending payment (prevent duplicate submissions)
  const existingPendingPayment = await Payment.findOne({
    student: req.user._id,
    course: courseId,
    status: { $in: ['pending', 'under_review'] }
  }).lean();

  if (existingPendingPayment) {
    res.status(400);
    throw new Error('You already have a pending payment for this course. Please wait for verification.');
  }

  // =============================================
  // ✅ FIXED: Calculate amount based on pricing type
  // =============================================
  let amount;
  let finalPaymentType = 'one_time';

  if (course.pricingType === 'subscription') {
    const plans = course.subscriptionPlans;

    if (!plans?.monthly?.price || plans.monthly.price <= 0) {
      res.status(400);
      throw new Error('Subscription plan is not properly configured. Contact support.');
    }

    const monthlyPrice = plans.monthly.price;
    const regFeeEnabled = plans?.registrationFee?.enabled;
    const regFeeAmount = plans?.registrationFee?.amount || 0;

    // ✅ Check if this student has ANY previous approved payment for this course
    const previousApprovedPayment = await Payment.findOne({
      student: req.user._id,
      course: courseId,
      status: 'approved',
      paymentType: { $in: ['monthly_subscription', 'first_payment'] }
    }).lean();

    if (!previousApprovedPayment) {
      // ✅ FIRST PAYMENT: monthly + registration fee (if enabled)
      if (regFeeEnabled && regFeeAmount > 0) {
        amount = monthlyPrice + regFeeAmount;
        finalPaymentType = 'first_payment'; // combined first payment
      } else {
        amount = monthlyPrice;
        finalPaymentType = 'monthly_subscription';
      }
    } else {
      // ✅ RENEWAL: monthly only
      amount = monthlyPrice;
      finalPaymentType = 'monthly_subscription';
    }

  } else {
    // ✅ One-time payment
    amount = course.discountPrice || course.price;
    finalPaymentType = 'one_time';
  }

  if (!amount || amount <= 0) {
    res.status(400);
    throw new Error('Invalid payment amount. Please contact support.');
  }

  // ✅ Create or find pending enrollment
  let enrollment = await Enrollment.findOne({
    student: req.user._id,
    course: courseId,
    status: 'pending'
  });

  if (!enrollment) {
    enrollment = await Enrollment.create({
      student: req.user._id,
      course: courseId,
      status: 'pending',
      paymentStatus: 'pending'
    });
  }

  // ✅ Save screenshot paths
  const screenshotPath = `payments/${req.files.screenshot[0].filename}`;
  const additionalPaths = req.files.additionalScreenshots
    ? req.files.additionalScreenshots.map(f => `payments/${f.filename}`)
    : [];

  // ✅ Create payment record
  const payment = await Payment.create({
    student: req.user._id,
    course: courseId,
    enrollment: enrollment._id,
    amount,
    paymentMethod: 'easypaisa',
    paymentType: finalPaymentType,
    screenshot: screenshotPath,
    additionalScreenshots: additionalPaths,
    status: 'pending'
  });

  enrollment.payment = payment._id;
  await enrollment.save({ validateBeforeSave: false });

  securityLog('PAYMENT_SUBMITTED', {
    userId: req.user._id,
    courseId,
    paymentId: payment.paymentId,
    amount,
    paymentType: finalPaymentType,
    ip: req.ip
  });

  res.status(201).json({
    success: true,
    data: {
      payment: transformPayment(payment),
      enrollment
    },
    message: 'Payment submitted successfully. We will verify and activate your enrollment within 24 hours.'
  });
});

// =============================================
// GET MY PAYMENTS
// =============================================
export const getMyPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status } = req.query;

  const query = { student: req.user._id };

  const validStatuses = ['pending', 'under_review', 'approved', 'rejected', 'refunded'];
  if (status && status !== 'all' && validStatuses.includes(status)) {
    query.status = status;
  }

  const [total, payments] = await Promise.all([
    Payment.countDocuments(query),
    Payment.find(query)
      .populate('course', 'title slug thumbnail price pricingType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({
    success: true,
    data: payments.map(p => ({
      ...p,
      screenshot: getFullImageUrl(p.screenshot),
      course: p.course ? {
        ...p.course,
        thumbnail: getFullImageUrl(p.course.thumbnail)
      } : null
    })),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// =============================================
// GET SINGLE PAYMENT
// =============================================
export const getPayment = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid payment ID');
  }

  const payment = await Payment.findById(req.params.id)
    .populate('student', 'firstName lastName email phone avatar')
    .populate('course', 'title slug price discountPrice thumbnail pricingType subscriptionPlans')
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
    throw new Error('Not authorized to view this payment');
  }

  res.json({
    success: true,
    data: transformPayment(payment)
  });
});

// =============================================
// ADMIN: GET ALL PAYMENTS
// =============================================
export const getAllPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { status, startDate, endDate, search, paymentType } = req.query;

  const query = {};

  const validStatuses = ['pending', 'under_review', 'approved', 'rejected', 'refunded'];
  if (status && status !== 'all' && validStatuses.includes(status)) {
    query.status = status;
  }

  // ✅ Updated valid types to include first_payment
  const validTypes = ['one_time', 'registration_fee', 'monthly_subscription', 'first_payment'];
  if (paymentType && paymentType !== 'all' && validTypes.includes(paymentType)) {
    query.paymentType = paymentType;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) query.createdAt.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
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

    const paymentIdConditions = [
      { paymentId: searchRegex },
      ...(userIds.length > 0 ? [{ student: { $in: userIds } }] : []),
      ...(courseIds.length > 0 ? [{ course: { $in: courseIds } }] : [])
    ];

    if (paymentIdConditions.length > 0) {
      query.$or = paymentIdConditions;
    } else {
      return res.json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(0, page, limit)
      });
    }
  }

  const [total, payments] = await Promise.all([
    Payment.countDocuments(query),
    Payment.find(query)
      .populate('student', 'firstName lastName email phone avatar')
      .populate('course', 'title slug price discountPrice thumbnail pricingType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({
    success: true,
    data: payments.map(p => ({
      ...p,
      screenshot: getFullImageUrl(p.screenshot),
      additionalScreenshots: (p.additionalScreenshots || []).map(getFullImageUrl),
      course: p.course ? {
        ...p.course,
        thumbnail: getFullImageUrl(p.course.thumbnail)
      } : null,
      student: p.student ? {
        ...p.student,
        avatar: getFullImageUrl(p.student.avatar)
      } : null
    })),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// =============================================
// ADMIN: REVIEW PAYMENT (Approve/Reject)
// =============================================
export const reviewPayment = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid payment ID');
  }

  const { status, reviewNotes, rejectionReason } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    res.status(400);
    throw new Error("Status must be 'approved' or 'rejected'");
  }

  if (status === 'rejected' && !rejectionReason?.trim()) {
    res.status(400);
    throw new Error('Rejection reason is required when rejecting a payment');
  }

  const payment = await Payment.findById(req.params.id)
    .populate('student')
    .populate('course');

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  if (!['pending', 'under_review'].includes(payment.status)) {
    res.status(400);
    throw new Error(`Payment has already been ${payment.status}`);
  }

  payment.status = status;
  payment.reviewedBy = req.user._id;
  payment.reviewedAt = new Date();

  if (reviewNotes) {
    payment.reviewNotes = String(reviewNotes).substring(0, 500);
  }

  if (status === 'rejected') {
    payment.rejectionReason = String(rejectionReason).substring(0, 500);
  }

  await payment.save();

  const enrollment = await Enrollment.findById(payment.enrollment);

  if (!enrollment) {
    securityLog('PAYMENT_MISSING_ENROLLMENT', {
      paymentId: payment._id,
      adminId: req.user._id
    });
  }

  if (status === 'approved') {
    if (enrollment) {
      enrollment.status = 'active';
      enrollment.paymentStatus = 'paid';

      // ✅ FIXED: Handle first_payment (monthly + reg fee combined)
      if (
        payment.paymentType === 'monthly_subscription' ||
        payment.paymentType === 'first_payment'
      ) {
        enrollment.subscriptionMonthsPaid = (enrollment.subscriptionMonthsPaid || 0) + 1;
        enrollment.lastSubscriptionPayment = new Date();

        // ✅ Set subscription expiry (1 month from now)
        const expiry = new Date();
        expiry.setMonth(expiry.getMonth() + 1);
        enrollment.subscriptionExpiry = expiry;

        // ✅ Check if permanently unlocked
        const courseDoc = await Course.findById(payment.course._id)
          .select('subscriptionPlans').lean();

        const unlockAfter =
          courseDoc?.subscriptionPlans?.monthly?.permanentUnlockAfterMonths || 0;

        if (
          unlockAfter > 0 &&
          enrollment.subscriptionMonthsPaid >= unlockAfter
        ) {
          enrollment.isPermanentlyUnlocked = true;
          enrollment.subscriptionExpiry = undefined;

          securityLog('SUBSCRIPTION_PERMANENTLY_UNLOCKED', {
            enrollmentId: enrollment._id,
            userId: payment.student._id,
            courseId: payment.course._id,
            monthsPaid: enrollment.subscriptionMonthsPaid
          });
        }

      } else if (payment.paymentType === 'registration_fee') {
        // Registration fee only - keep pending until monthly payment
        enrollment.status = 'pending';
        enrollment.paymentStatus = 'pending';
      }
      // ✅ one_time - full access granted immediately

      await enrollment.save();
    }

    // ✅ Only increment enrollment count for first payment
    if (
      payment.paymentType === 'one_time' ||
      payment.paymentType === 'first_payment' ||
      (payment.paymentType === 'monthly_subscription' &&
        enrollment?.subscriptionMonthsPaid === 1)
    ) {
      await Course.findByIdAndUpdate(payment.course._id, {
        $inc: { enrollmentCount: 1 }
      });

      await User.findByIdAndUpdate(payment.student._id, {
        $addToSet: { enrolledCourses: payment.course._id }
      });
    }

    sendEmailAsync(sendEnrollmentConfirmation, payment.student, payment.course);

  } else if (status === 'rejected' && enrollment) {
    enrollment.status = 'cancelled';
    enrollment.paymentStatus = 'failed';
    await enrollment.save();
  }

  sendEmailAsync(sendPaymentStatusEmail, payment.student, payment, status);

  securityLog('PAYMENT_REVIEWED', {
    adminId: req.user._id,
    paymentId: payment._id,
    paymentUserId: payment.student._id,
    status,
    ip: req.ip
  });

  res.json({
    success: true,
    data: transformPayment(payment),
    message: `Payment ${status} successfully`
  });
});

// =============================================
// ADMIN: GET PAYMENT STATS
// =============================================
export const getPaymentStats = asyncHandler(async (req, res) => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    totalPayments,
    pendingPayments,
    approvedPayments,
    rejectedPayments,
    revenueResult,
    monthRevenueResult,
    underReviewPayments
  ] = await Promise.all([
    Payment.countDocuments(),
    Payment.countDocuments({ status: 'pending' }),
    Payment.countDocuments({ status: 'approved' }),
    Payment.countDocuments({ status: 'rejected' }),
    Payment.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      {
        $match: {
          status: 'approved',
          createdAt: { $gte: startOfMonth }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Payment.countDocuments({ status: 'under_review' })
  ]);

  res.json({
    success: true,
    data: {
      total: totalPayments,
      pending: pendingPayments,
      underReview: underReviewPayments,
      approved: approvedPayments,
      rejected: rejectedPayments,
      totalRevenue: revenueResult[0]?.total || 0,
      monthlyRevenue: monthRevenueResult[0]?.total || 0
    }
  });
});

// =============================================
// ADMIN: MARK UNDER REVIEW
// =============================================
export const markUnderReview = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid payment ID');
  }

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
    data: transformPayment(payment),
    message: 'Payment marked as under review'
  });
});

// =============================================
// ✅ NEW: CHECK IF FIRST PAYMENT (for frontend)
// =============================================
export const checkPaymentStatus = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  if (!isValidId(courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const course = await Course.findById(courseId)
    .select('pricingType subscriptionPlans price discountPrice isFreeCourse')
    .lean();

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // ✅ Check previous approved payments
  const previousApprovedPayment = await Payment.findOne({
    student: req.user._id,
    course: courseId,
    status: 'approved',
    paymentType: { $in: ['monthly_subscription', 'first_payment'] }
  }).lean();

  const isFirstPayment = !previousApprovedPayment;

  let amountDue = 0;
  let paymentDescription = '';

  if (course.pricingType === 'subscription') {
    const monthlyPrice = course.subscriptionPlans?.monthly?.price || 0;
    const regFeeEnabled = course.subscriptionPlans?.registrationFee?.enabled;
    const regFeeAmount = course.subscriptionPlans?.registrationFee?.amount || 0;

    if (isFirstPayment && regFeeEnabled && regFeeAmount > 0) {
      amountDue = monthlyPrice + regFeeAmount;
      paymentDescription = `Monthly (${formatAmountPKR(monthlyPrice)}) + Registration (${formatAmountPKR(regFeeAmount)})`;
    } else {
      amountDue = monthlyPrice;
      paymentDescription = `Monthly subscription`;
    }
  } else {
    amountDue = course.discountPrice || course.price || 0;
    paymentDescription = 'One-time payment';
  }

  res.json({
    success: true,
    data: {
      isFirstPayment,
      amountDue,
      paymentDescription,
      course: {
        pricingType: course.pricingType,
        monthlyPrice: course.subscriptionPlans?.monthly?.price || 0,
        registrationFee: course.subscriptionPlans?.registrationFee?.enabled
          ? course.subscriptionPlans.registrationFee.amount
          : 0,
        registrationFeeEnabled: course.subscriptionPlans?.registrationFee?.enabled || false
      }
    }
  });
});

export const getPaymentReceipt = asyncHandler(async (req, res) => {
  if (!isValidId(req.params.paymentId)) {
    res.status(400);
    throw new Error('Invalid payment ID');
  }

  const payment = await Payment.findById(req.params.paymentId)
    .populate('student', 'firstName lastName email phone')
    .populate('course', 'title price discountPrice pricingType subscriptionPlans')
    .populate('reviewedBy', 'firstName lastName');

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  // ✅ Only student or admin can view receipt
  if (
    payment.student._id.toString() !== req.user._id.toString() &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized to view this receipt');
  }

  // ✅ Only approved payments get receipts
  if (payment.status !== 'approved') {
    res.status(400);
    throw new Error('Receipt is only available for approved payments');
  }

  // =============================================
  // ✅ Generate PDF
  // =============================================
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: `Payment Receipt - ${payment.paymentId}`,
      Author: 'LearnHub',
      Subject: 'Course Payment Receipt'
    }
  });

  // ✅ Set response headers
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="receipt-${payment.paymentId}.pdf"`
  );

  doc.pipe(res);

  // =============================================
  // ✅ PDF DESIGN
  // =============================================

  // --- Header Background ---
  doc.rect(0, 0, 595, 120).fill('#1d4ed8');

  // --- Logo / Brand ---
  doc
    .fillColor('#ffffff')
    .fontSize(28)
    .font('Helvetica-Bold')
    .text('LearnHub', 50, 35);

  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#bfdbfe')
    .text('Online Learning Platform', 50, 68);

  // --- Receipt Title (right side) ---
  doc
    .fontSize(22)
    .font('Helvetica-Bold')
    .fillColor('#ffffff')
    .text('PAYMENT RECEIPT', 350, 35, { align: 'right' });

  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor('#bfdbfe')
    .text(
      `Receipt #: ${payment.paymentId}`,
      350, 68,
      { align: 'right' }
    );

  // --- Approved Badge ---
  doc
    .rect(440, 80, 100, 22)
    .fill('#16a34a');

  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor('#ffffff')
    .text('✓  APPROVED', 448, 85);

  // =============================================
  // BODY START
  // =============================================
  let y = 145;

  // --- Two column info ---
  // Left: Student Info
  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .fillColor('#6b7280')
    .text('BILLED TO', 50, y)
    .moveDown(0.3);

  y += 14;
  doc
    .fontSize(12)
    .font('Helvetica-Bold')
    .fillColor('#111827')
    .text(
      `${payment.student.firstName} ${payment.student.lastName}`,
      50, y
    );

  y += 18;
  doc
    .fontSize(10)
    .font('Helvetica')
    .fillColor('#374151')
    .text(payment.student.email, 50, y);

  if (payment.student.phone) {
    y += 15;
    doc.text(payment.student.phone, 50, y);
  }

  // Right: Payment Info
  const rightCol = 350;
  let infoY = 145;

  const infoRows = [
    ['Receipt Date:', new Date(payment.reviewedAt || payment.createdAt)
      .toLocaleDateString('en-PK', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    ],
    ['Payment Date:', new Date(payment.createdAt)
      .toLocaleDateString('en-PK', {
        year: 'numeric', month: 'long', day: 'numeric'
      })
    ],
    ['Payment Method:', payment.paymentMethod?.toUpperCase() || 'EASYPAISA'],
    ['Payment Type:', payment.paymentType?.replace(/_/g, ' ').toUpperCase() || 'ONE TIME'],
  ];

  infoRows.forEach(([label, value]) => {
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#6b7280')
      .text(label, rightCol, infoY);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#111827')
      .text(value, rightCol + 90, infoY);

    infoY += 16;
  });

  // --- Divider ---
  y = Math.max(y, infoY) + 25;
  doc
    .moveTo(50, y)
    .lineTo(545, y)
    .strokeColor('#e5e7eb')
    .lineWidth(1)
    .stroke();

  y += 20;

  // =============================================
  // COURSE TABLE
  // =============================================

  // Table Header
  doc.rect(50, y, 495, 30).fill('#f3f4f6');

  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor('#374151')
    .text('DESCRIPTION', 65, y + 10)
    .text('TYPE', 300, y + 10)
    .text('AMOUNT', 460, y + 10, { width: 80, align: 'right' });

  y += 30;

  // Table Row - Course
  doc.rect(50, y, 495, 45).fill('#ffffff').stroke('#f3f4f6');

  doc
    .fontSize(11)
    .font('Helvetica-Bold')
    .fillColor('#111827')
    .text(payment.course.title, 65, y + 8, { width: 220 });

  // Pricing type badge color
  const typeColor = payment.paymentType === 'one_time' ? '#7c3aed'
    : payment.paymentType === 'first_payment' ? '#0369a1'
    : '#065f46';

  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .fillColor(typeColor)
    .text(
      payment.paymentType?.replace(/_/g, ' ').toUpperCase() || 'ONE TIME',
      300, y + 15
    );

  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .fillColor('#111827')
    .text(
      `PKR ${payment.amount.toLocaleString()}`,
      460, y + 12,
      { width: 80, align: 'right' }
    );

  y += 45;

  // =============================================
  // SUBSCRIPTION BREAKDOWN (if applicable)
  // =============================================
  if (
    payment.paymentType === 'first_payment' &&
    payment.course.pricingType === 'subscription'
  ) {
    const monthly = payment.course.subscriptionPlans?.monthly?.price || 0;
    const regFee = payment.course.subscriptionPlans?.registrationFee?.amount || 0;

    if (regFee > 0) {
      // Sub-row background
      doc.rect(50, y, 495, 60).fill('#fefce8').stroke('#fef08a');

      doc
        .fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#92400e')
        .text('PAYMENT BREAKDOWN', 65, y + 8);

      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#374151')
        .text(`Monthly Subscription:`, 65, y + 22)
        .text(`PKR ${monthly.toLocaleString()}`, 300, y + 22);

      doc
        .text(`Registration Fee (one-time):`, 65, y + 38)
        .text(`PKR ${regFee.toLocaleString()}`, 300, y + 38);

      y += 60;
    }
  }

  // =============================================
  // TOTALS
  // =============================================
  y += 10;

  // Total box
  doc.rect(350, y, 195, 45).fill('#1d4ed8');

  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .fillColor('#bfdbfe')
    .text('TOTAL PAID', 365, y + 8);

  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .fillColor('#ffffff')
    .text(
      `PKR ${payment.amount.toLocaleString()}`,
      365, y + 22,
      { width: 165, align: 'right' }
    );

  // Status box
  doc.rect(50, y, 180, 45).fill('#f0fdf4').stroke('#bbf7d0');

  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor('#15803d')
    .text('PAYMENT STATUS', 65, y + 8);

  doc
    .fontSize(14)
    .font('Helvetica-Bold')
    .fillColor('#16a34a')
    .text('✓ PAID & VERIFIED', 65, y + 22);

  y += 65;

  // =============================================
  // SUBSCRIPTION INFO (if applicable)
  // =============================================
  if (payment.course.pricingType === 'subscription') {
    y += 15;
    doc.rect(50, y, 495, 50).fill('#f0f9ff').stroke('#bae6fd');

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#0369a1')
      .text('📅 SUBSCRIPTION INFORMATION', 65, y + 10);

    const renewal = payment.course.subscriptionPlans?.monthly?.price || 0;
    const unlock = payment.course.subscriptionPlans?.monthly?.permanentUnlockAfterMonths || 0;

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#374151')
      .text(
        `Monthly renewal: PKR ${renewal.toLocaleString()}/month  |  ` +
        (unlock > 0 ? `Permanent unlock after ${unlock} months` : 'No permanent unlock'),
        65, y + 26
      );

    y += 50;
  }

  // =============================================
  // APPROVED BY
  // =============================================
  if (payment.reviewedBy) {
    y += 20;
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#6b7280')
      .text(
        `Verified by: ${payment.reviewedBy.firstName} ${payment.reviewedBy.lastName}  ` +
        `on ${new Date(payment.reviewedAt).toLocaleDateString('en-PK')}`,
        50, y,
        { align: 'center', width: 495 }
      );
  }

  // =============================================
  // FOOTER
  // =============================================
  const footerY = 760;
  doc.rect(0, footerY, 595, 82).fill('#f9fafb');

  doc
    .moveTo(50, footerY)
    .lineTo(545, footerY)
    .strokeColor('#e5e7eb')
    .lineWidth(1)
    .stroke();

  doc
    .fontSize(8)
    .font('Helvetica')
    .fillColor('#6b7280')
    .text(
      'This is an official payment receipt from LearnHub.',
      50, footerY + 12,
      { align: 'center', width: 495 }
    );

  doc
    .text(
      `Receipt ID: ${payment.paymentId}  |  Generated: ${new Date().toLocaleString('en-PK')}`,
      50, footerY + 26,
      { align: 'center', width: 495 }
    );

  doc
    .fontSize(8)
    .fillColor('#9ca3af')
    .text(
      'For support: support@learnhub.com  |  WhatsApp: 03478932237',
      50, footerY + 42,
      { align: 'center', width: 495 }
    );

  doc.end();
});

// Helper for description
const formatAmountPKR = (amount) => `PKR ${amount.toLocaleString()}`;