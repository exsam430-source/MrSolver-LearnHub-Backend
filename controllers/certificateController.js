// controllers/certificateController.js
import asyncHandler from 'express-async-handler';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Certificate from '../models/Certificate.js';
import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import User from '../models/User.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import { getFullImageUrl } from '../utils/imageHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to transform certificate
const transformCertificate = (certificate) => {
  if (!certificate) return certificate;
  const obj = certificate.toObject ? certificate.toObject() : certificate;
  return {
    ...obj,
    certificateUrl: getFullImageUrl(obj.certificateUrl),
    student: obj.student ? {
      ...obj.student,
      avatar: getFullImageUrl(obj.student.avatar)
    } : obj.student,
    course: obj.course ? {
      ...obj.course,
      thumbnail: getFullImageUrl(obj.course.thumbnail)
    } : obj.course,
    instructor: obj.instructor ? {
      ...obj.instructor,
      avatar: getFullImageUrl(obj.instructor.avatar)
    } : obj.instructor
  };
};

// ========================================
// TEMPLATE MANAGEMENT
// ========================================

// @desc Upload certificate template (PDF)
// @route PUT /api/certificates/course/:courseId/template
// @access Private/Instructor
export const uploadCertificateTemplate = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

  if (!req.file) {
    res.status(400);
    throw new Error('Please upload a PDF certificate template');
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
    throw new Error('Not authorized to update this course');
  }

  if (course.certificateTemplate) {
    const oldPath = path.join(__dirname, '..', 'uploads', course.certificateTemplate);
    if (fs.existsSync(oldPath)) {
      fs.unlinkSync(oldPath);
    }
  }

  course.certificateTemplate = `certificates/${req.file.filename}`;
  await course.save();

  res.json({
    success: true,
    data: {
      certificateTemplate: getFullImageUrl(course.certificateTemplate)
    },
    message: 'Certificate template uploaded successfully'
  });
});

// @desc Update certificate settings for a course
// @route PUT /api/certificates/course/:courseId/settings
// @access Private/Instructor
export const updateCertificateSettings = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const {
    completionCertificate,
    autoIssue,
    minimumScore,
    requireAllLectures,
    customMessage,
    expiryMonths,
    showInstructorSignature
  } = req.body;

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

  if (completionCertificate !== undefined) {
    course.completionCertificate = completionCertificate;
  }

  course.certificateSettings = {
    ...course.certificateSettings,
    ...(autoIssue !== undefined && { autoIssue }),
    ...(minimumScore !== undefined && { minimumScore: Math.min(100, Math.max(0, minimumScore)) }),
    ...(requireAllLectures !== undefined && { requireAllLectures }),
    ...(customMessage !== undefined && { customMessage }),
    ...(expiryMonths !== undefined && { expiryMonths }),
    ...(showInstructorSignature !== undefined && { showInstructorSignature })
  };

  await course.save();

  res.json({
    success: true,
    data: {
      completionCertificate: course.completionCertificate,
      certificateSettings: course.certificateSettings,
      certificateTemplate: getFullImageUrl(course.certificateTemplate)
    },
    message: 'Certificate settings updated successfully'
  });
});

// ========================================
// CERTIFICATE ISSUANCE
// ========================================

// @desc Issue certificate to a student
// @route POST /api/certificates/issue
// @access Private/Instructor
export const issueCertificate = asyncHandler(async (req, res) => {
  const { studentId, courseId, grade, customMessage } = req.body;

  const course = await Course.findById(courseId)
    .populate('instructor', 'firstName lastName');

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor._id.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized to issue certificates for this course');
  }

  if (!course.completionCertificate) {
    res.status(400);
    throw new Error('Certificates are not enabled for this course');
  }

  if (!course.certificateTemplate) {
    res.status(400);
    throw new Error('Please upload a certificate template first');
  }

  const enrollment = await Enrollment.findOne({
    student: studentId,
    course: courseId
  }).populate('student', 'firstName lastName email');

  if (!enrollment) {
    res.status(404);
    throw new Error('Student is not enrolled in this course');
  }

  const existingCert = await Certificate.findOne({
    student: studentId,
    course: courseId,
    status: 'active'
  });

  if (existingCert) {
    res.status(400);
    throw new Error('Certificate already issued to this student');
  }

  let expiryDate = null;
  if (course.certificateSettings?.expiryMonths > 0) {
    expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + course.certificateSettings.expiryMonths);
  }

  const certificate = await Certificate.create({
    student: studentId,
    course: courseId,
    enrollment: enrollment._id,
    instructor: course.instructor._id,
    certificateUrl: course.certificateTemplate,
    completionPercentage: enrollment.progress?.percentage || 100,
    grade: grade || null,
    expiryDate,
    issuedBy: req.user._id,
    metadata: {
      studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
      studentEmail: enrollment.student.email,
      courseName: course.title,
      courseSlug: course.slug,
      instructorName: `${course.instructor.firstName} ${course.instructor.lastName}`,
      totalHours: Math.round(course.duration / 60) || 0,
      completedLectures: enrollment.progress?.completedLectures?.length || 0,
      totalLectures: course.totalLectures,
      enrollmentDate: enrollment.enrollmentDate,
      completionDate: enrollment.completedAt || new Date(),
      customMessage: customMessage || course.certificateSettings?.customMessage || ''
    }
  });

  enrollment.certificateIssued = true;
  enrollment.certificateId = certificate._id;
  enrollment.certificateUrl = certificate.certificateUrl;
  enrollment.certificateIssuedAt = certificate.issueDate;
  await enrollment.save();

  const populatedCert = await Certificate.findById(certificate._id)
    .populate('student', 'firstName lastName email avatar')
    .populate('course', 'title slug thumbnail')
    .populate('instructor', 'firstName lastName avatar');

  res.status(201).json({
    success: true,
    data: transformCertificate(populatedCert),
    message: 'Certificate issued successfully'
  });
});

// @desc Issue certificates to multiple students (bulk)
// @route POST /api/certificates/issue-bulk
// @access Private/Instructor
export const issueCertificatesBulk = asyncHandler(async (req, res) => {
  const { courseId, studentIds, grade } = req.body;

  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    res.status(400);
    throw new Error('Please provide student IDs');
  }

  const course = await Course.findById(courseId)
    .populate('instructor', 'firstName lastName');

  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  if (
    req.user.role !== 'admin' &&
    course.instructor._id.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (!course.completionCertificate || !course.certificateTemplate) {
    res.status(400);
    throw new Error('Please configure certificate settings and upload template first');
  }

  const results = {
    issued: [],
    failed: [],
    alreadyIssued: []
  };

  for (const studentId of studentIds) {
    try {
      const existingCert = await Certificate.findOne({
        student: studentId,
        course: courseId,
        status: 'active'
      });

      if (existingCert) {
        results.alreadyIssued.push({
          studentId,
          certificateNumber: existingCert.certificateNumber
        });
        continue;
      }

      const enrollment = await Enrollment.findOne({
        student: studentId,
        course: courseId
      }).populate('student', 'firstName lastName email');

      if (!enrollment) {
        results.failed.push({ studentId, reason: 'Not enrolled' });
        continue;
      }

      let expiryDate = null;
      if (course.certificateSettings?.expiryMonths > 0) {
        expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + course.certificateSettings.expiryMonths);
      }

      const certificate = await Certificate.create({
        student: studentId,
        course: courseId,
        enrollment: enrollment._id,
        instructor: course.instructor._id,
        certificateUrl: course.certificateTemplate,
        completionPercentage: enrollment.progress?.percentage || 100,
        grade: grade || null,
        expiryDate,
        issuedBy: req.user._id,
        metadata: {
          studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
          studentEmail: enrollment.student.email,
          courseName: course.title,
          courseSlug: course.slug,
          instructorName: `${course.instructor.firstName} ${course.instructor.lastName}`,
          totalHours: Math.round(course.duration / 60) || 0,
          completedLectures: enrollment.progress?.completedLectures?.length || 0,
          totalLectures: course.totalLectures,
          enrollmentDate: enrollment.enrollmentDate,
          completionDate: enrollment.completedAt || new Date(),
          customMessage: course.certificateSettings?.customMessage || ''
        }
      });

      enrollment.certificateIssued = true;
      enrollment.certificateId = certificate._id;
      enrollment.certificateUrl = certificate.certificateUrl;
      enrollment.certificateIssuedAt = certificate.issueDate;
      await enrollment.save();

      results.issued.push({
        studentId,
        studentName: enrollment.student.firstName + ' ' + enrollment.student.lastName,
        certificateId: certificate._id,
        certificateNumber: certificate.certificateNumber
      });

    } catch (error) {
      results.failed.push({
        studentId,
        reason: error.message
      });
    }
  }

  res.json({
    success: true,
    data: results,
    message: `Successfully issued ${results.issued.length} certificates`
  });
});

// ========================================
// CERTIFICATE RETRIEVAL
// ========================================

// @desc Get certificates issued by instructor
// @route GET /api/certificates/instructor
// @access Private/Instructor
export const getInstructorCertificates = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { courseId, status, search } = req.query;

  const query = { instructor: req.user._id };

  if (courseId) {
    query.course = courseId;
  }

  if (status && status !== 'all') {
    query.status = status;
  }

  const total = await Certificate.countDocuments(query);

  let certificates = await Certificate.find(query)
    .populate('student', 'firstName lastName email avatar')
    .populate('course', 'title slug thumbnail')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  if (search) {
    const searchLower = search.toLowerCase();
    certificates = certificates.filter(cert =>
      cert.metadata?.studentName?.toLowerCase().includes(searchLower) ||
      cert.certificateNumber?.toLowerCase().includes(searchLower) ||
      cert.course?.title?.toLowerCase().includes(searchLower)
    );
  }

  res.json({
    success: true,
    data: certificates.map(transformCertificate),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc Get student's certificates
// @route GET /api/certificates/my-certificates
// @access Private
export const getMyCertificates = asyncHandler(async (req, res) => {
  const certificates = await Certificate.find({
    student: req.user._id,
    status: 'active'
  })
    .populate('course', 'title slug thumbnail instructor')
    .populate('instructor', 'firstName lastName avatar')
    .sort({ issueDate: -1 });

  res.json({
    success: true,
    data: certificates.map(transformCertificate)
  });
});

// @desc Get certificate by ID
// @route GET /api/certificates/:id
// @access Private
export const getCertificate = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findById(req.params.id)
    .populate('student', 'firstName lastName email avatar')
    .populate('course', 'title slug thumbnail')
    .populate('instructor', 'firstName lastName avatar')
    .populate('issuedBy', 'firstName lastName');

  if (!certificate) {
    res.status(404);
    throw new Error('Certificate not found');
  }

  const isStudent = certificate.student._id.toString() === req.user._id.toString();
  const isInstructor = certificate.instructor._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isStudent && !isInstructor && !isAdmin) {
    res.status(403);
    throw new Error('Not authorized to view this certificate');
  }

  res.json({
    success: true,
    data: transformCertificate(certificate)
  });
});

// @desc Download certificate PDF
// @route GET /api/certificates/:id/download
// @access Private
export const downloadCertificate = asyncHandler(async (req, res) => {
  const certificate = await Certificate.findById(req.params.id);

  if (!certificate) {
    res.status(404);
    throw new Error('Certificate not found');
  }

  const isStudent = certificate.student.toString() === req.user._id.toString();
  const isInstructor = certificate.instructor.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isStudent && !isInstructor && !isAdmin) {
    res.status(403);
    throw new Error('Not authorized to download this certificate');
  }

  if (!certificate.isValid()) {
    res.status(400);
    throw new Error('This certificate is no longer valid');
  }

  const filePath = path.join(__dirname, '..', 'uploads', certificate.certificateUrl);

  if (!fs.existsSync(filePath)) {
    res.status(404);
    throw new Error('Certificate file not found');
  }

  await certificate.trackDownload();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Certificate-${certificate.certificateNumber}.pdf"`);

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// ========================================
// VERIFICATION
// ========================================

// @desc Verify certificate
// @route GET /api/certificates/verify/:code
// @access Public
export const verifyCertificate = asyncHandler(async (req, res) => {
  const { code } = req.params;

  const certificate = await Certificate.findOne({
    $or: [
      { certificateNumber: code },
      { verificationCode: code }
    ]
  })
    .populate('student', 'firstName lastName')
    .populate('course', 'title')
    .populate('instructor', 'firstName lastName');

  if (!certificate) {
    res.status(404);
    throw new Error('Certificate not found or invalid verification code');
  }

  const isValid = certificate.isValid();
  const isExpired = certificate.expiryDate && new Date() > certificate.expiryDate;

  res.json({
    success: true,
    data: {
      valid: isValid,
      status: certificate.status,
      certificateNumber: certificate.certificateNumber,
      studentName: certificate.metadata?.studentName,
      courseName: certificate.metadata?.courseName,
      instructorName: certificate.metadata?.instructorName,
      issueDate: certificate.issueDate,
      expiryDate: certificate.expiryDate,
      isExpired,
      grade: certificate.grade,
      completionPercentage: certificate.completionPercentage
    }
  });
});

// ========================================
// CERTIFICATE MANAGEMENT
// ========================================

// @desc Revoke certificate
// @route PUT /api/certificates/:id/revoke
// @access Private/Instructor
export const revokeCertificate = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const certificate = await Certificate.findById(req.params.id);

  if (!certificate) {
    res.status(404);
    throw new Error('Certificate not found');
  }

  if (
    req.user.role !== 'admin' &&
    certificate.instructor.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  certificate.status = 'revoked';
  certificate.revokedBy = req.user._id;
  certificate.revokedAt = new Date();
  certificate.revokeReason = reason || 'No reason provided';
  await certificate.save();

  await Enrollment.findOneAndUpdate(
    { student: certificate.student, course: certificate.course },
    {
      certificateIssued: false,
      certificateId: null,
      certificateUrl: null
    }
  );

  res.json({
    success: true,
    message: 'Certificate revoked successfully'
  });
});

// @desc Reissue certificate
// @route POST /api/certificates/:id/reissue
// @access Private/Instructor
export const reissueCertificate = asyncHandler(async (req, res) => {
  const oldCertificate = await Certificate.findById(req.params.id)
    .populate('student', 'firstName lastName email')
    .populate('course')
    .populate('instructor', 'firstName lastName');

  if (!oldCertificate) {
    res.status(404);
    throw new Error('Certificate not found');
  }

  if (
    req.user.role !== 'admin' &&
    oldCertificate.instructor._id.toString() !== req.user._id.toString()
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  oldCertificate.status = 'revoked';
  oldCertificate.revokedBy = req.user._id;
  oldCertificate.revokedAt = new Date();
  oldCertificate.revokeReason = 'Reissued';
  await oldCertificate.save();

  const newCertificate = await Certificate.create({
    student: oldCertificate.student._id,
    course: oldCertificate.course._id,
    enrollment: oldCertificate.enrollment,
    instructor: oldCertificate.instructor._id,
    certificateUrl: oldCertificate.course.certificateTemplate,
    completionPercentage: oldCertificate.completionPercentage,
    grade: oldCertificate.grade,
    expiryDate: oldCertificate.expiryDate,
    issuedBy: req.user._id,
    metadata: oldCertificate.metadata
  });

  await Enrollment.findOneAndUpdate(
    { student: oldCertificate.student._id, course: oldCertificate.course._id },
    {
      certificateId: newCertificate._id,
      certificateUrl: newCertificate.certificateUrl,
      certificateIssuedAt: newCertificate.issueDate
    }
  );

  const populatedCert = await Certificate.findById(newCertificate._id)
    .populate('student', 'firstName lastName email avatar')
    .populate('course', 'title slug thumbnail')
    .populate('instructor', 'firstName lastName avatar');

  res.status(201).json({
    success: true,
    data: transformCertificate(populatedCert),
    message: 'Certificate reissued successfully'
  });
});

// ========================================
// STATISTICS
// ========================================

// @desc Get course certificate stats
// @route GET /api/certificates/course/:courseId/stats
// @access Private/Instructor
export const getCourseCertificateStats = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

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

  const totalEnrollments = await Enrollment.countDocuments({
    course: courseId,
    status: { $in: ['active', 'completed'] }
  });

  const completedStudents = await Enrollment.countDocuments({
    course: courseId,
    status: 'completed'
  });

  const certificatesIssued = await Certificate.countDocuments({
    course: courseId,
    status: 'active'
  });

  const certificatesRevoked = await Certificate.countDocuments({
    course: courseId,
    status: 'revoked'
  });

  const eligibleForCertificate = await Enrollment.countDocuments({
    course: courseId,
    status: 'completed',
    certificateIssued: { $ne: true }
  });

  res.json({
    success: true,
    data: {
      totalEnrollments,
      completedStudents,
      certificatesIssued,
      certificatesRevoked,
      eligibleForCertificate,
      certificateEnabled: course.completionCertificate,
      hasTemplate: !!course.certificateTemplate,
      settings: course.certificateSettings
    }
  });
});

// @desc Get eligible students for certificate
// @route GET /api/certificates/course/:courseId/eligible
// @access Private/Instructor
export const getEligibleStudents = asyncHandler(async (req, res) => {
  const { courseId } = req.params;

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

  const eligibleEnrollments = await Enrollment.find({
    course: courseId,
    status: 'completed',
    certificateIssued: { $ne: true }
  })
    .populate('student', 'firstName lastName email avatar')
    .select('student progress completedAt enrollmentDate');

  const transformedEnrollments = eligibleEnrollments.map(enrollment => {
    const obj = enrollment.toObject ? enrollment.toObject() : enrollment;
    return {
      ...obj,
      student: obj.student ? {
        ...obj.student,
        avatar: getFullImageUrl(obj.student.avatar)
      } : obj.student
    };
  });

  res.json({
    success: true,
    data: transformedEnrollments
  });
});