// models/Certificate.js
import mongoose from 'mongoose';
import crypto from 'crypto';

const certificateSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  enrollment: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' },
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ✅ generated automatically, so NOT required:true
  certificateNumber: { type: String, unique: true },
  verificationCode: { type: String, unique: true },

  // PDF path
  certificateUrl: { type: String, required: true },

  issueDate: { type: Date, default: Date.now },
  expiryDate: { type: Date },

  completionPercentage: { type: Number, default: 100, min: 0, max: 100 },

  grade: {
    type: String,
    enum: ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'Pass', 'Distinction', 'Merit', null],
    default: null
  },

  status: { type: String, enum: ['active', 'revoked', 'expired'], default: 'active' },

  metadata: {
    studentName: String,
    studentEmail: String,
    courseName: String,
    courseSlug: String,
    instructorName: String,
    totalHours: Number,
    completedLectures: Number,
    totalLectures: Number,
    enrollmentDate: Date,
    completionDate: Date,
    customMessage: String
  },

  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revokedAt: Date,
  revokeReason: String,

  downloadCount: { type: Number, default: 0 },
  lastDownloadedAt: Date
}, { timestamps: true });

// ✅ Generate BEFORE validation (so it exists when mongoose validates)
certificateSchema.pre('validate', function () {
  if (!this.certificateNumber) {
    const prefix = 'CERT';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    this.certificateNumber = `${prefix}-${timestamp}-${random}`;
  }

  if (!this.verificationCode) {
    const verifyHash = crypto.randomBytes(16).toString('hex').toUpperCase();
    this.verificationCode = `${this.certificateNumber}-${verifyHash}`;
  }
});

// ✅ keep only non-duplicate indexes (do NOT re-index certificateNumber/verificationCode)
certificateSchema.index({ student: 1, course: 1 });
certificateSchema.index({ course: 1, status: 1 });
certificateSchema.index({ status: 1 });

certificateSchema.methods.isValid = function () {
  if (this.status === 'revoked') return false;
  if (this.status === 'expired') return false;
  if (this.expiryDate && new Date() > this.expiryDate) {
    this.status = 'expired';
    return false;
  }
  return true;
};

certificateSchema.methods.trackDownload = async function () {
  this.downloadCount += 1;
  this.lastDownloadedAt = new Date();
  await this.save();
};

const Certificate = mongoose.model('Certificate', certificateSchema);
export default Certificate;