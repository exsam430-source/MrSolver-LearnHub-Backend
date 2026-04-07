// models/Enrollment.js
import mongoose from 'mongoose';

// Sub-schema for detailed watch progress per lecture
const lectureProgressSchema = new mongoose.Schema({
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true
  },
  watchCount: { type: Number, default: 0 },
  totalWatchTime: { type: Number, default: 0 },
  lastPosition: { type: Number, default: 0 },
  lastWatchedAt: Date,
  isCompleted: { type: Boolean, default: false },
  completedAt: Date,
  watchedSegments: [{
    start: Number,
    end: Number,
    _id: false
  }],
  quizAttempts: [{
    score: Number,
    answers: [mongoose.Schema.Types.Mixed],
    attemptedAt: { type: Date, default: Date.now },
    timeTaken: Number,
    passed: Boolean
  }],
  personalNotes: { type: String, maxLength: 5000 }
}, { _id: false });

// Sub-schema for code submissions
const codeSubmissionSchema = new mongoose.Schema({
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true
  },
  code: {
    html: { type: String, default: '' },
    css: { type: String, default: '' },
    js: { type: String, default: '' }
  },
  submittedAt: { type: Date, default: Date.now },
  feedback: {
    comment: String,
    score: Number,
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }
}, { _id: true });

// Sub-schema for Zoom attendance
const zoomAttendanceSchema = new mongoose.Schema({
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true
  },
  joinedAt: Date,
  leftAt: Date,
  duration: Number,
  attended: { type: Boolean, default: false }
}, { _id: false });

// Sub-schema for bookmarks
const bookmarkSchema = new mongoose.Schema({
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture'
  },
  timestamp: Number,
  note: String,
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const enrollmentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  enrollmentDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'expired', 'cancelled'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },

  // Legacy progress (keep for backward compatibility)
  progress: {
    completedLectures: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lecture'
    }],
    currentLecture: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lecture'
    },
    percentage: {
      type: Number,
      default: 0
    },
    lastAccessed: Date
  },

  // Detailed lecture progress with watch tracking
  lectureProgress: [lectureProgressSchema],

  // Code submissions for interactive lectures
  codeSubmissions: [codeSubmissionSchema],

  // Zoom meeting attendance
  zoomAttendance: [zoomAttendanceSchema],

  // Video bookmarks
  bookmarks: [bookmarkSchema],

  // Overall statistics
  stats: {
    totalWatchTime: { type: Number, default: 0 },
    totalTimeSpent: { type: Number, default: 0 },
    averageQuizScore: { type: Number, default: 0 },
    lastActivityAt: Date,
    streakDays: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 }
  },

  // ✅ NEW: Certificate fields
  certificateIssued: {
    type: Boolean,
    default: false
  },
  certificateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Certificate'
  },
  certificateUrl: {
    type: String
  },
  certificateIssuedAt: {
    type: Date
  },

  completedAt: Date,
  expiresAt: Date,
  notes: String
}, {
  timestamps: true
});

// Indexes
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ course: 1, status: 1 });
enrollmentSchema.index({ student: 1, status: 1 });
enrollmentSchema.index({ 'lectureProgress.lecture': 1 });
enrollmentSchema.index({ certificateId: 1 });

// Methods
enrollmentSchema.methods.getLectureProgress = function(lectureId) {
  return this.lectureProgress.find(
    p => p.lecture.toString() === lectureId.toString()
  );
};

enrollmentSchema.methods.isLectureCompleted = function(lectureId) {
  const progress = this.getLectureProgress(lectureId);
  return progress?.isCompleted || this.progress.completedLectures.some(
    id => id.toString() === lectureId.toString()
  );
};

enrollmentSchema.methods.calculateProgress = function(totalLectures) {
  if (!totalLectures || totalLectures <= 0) return 0;
  const completedFromLectureProgress = this.lectureProgress.filter(p => p.isCompleted).length;
  const completedFromLegacy = this.progress.completedLectures.length;
  const completed = Math.max(completedFromLectureProgress, completedFromLegacy);
  return Math.round((completed / totalLectures) * 100);
};

enrollmentSchema.methods.updateStreak = function() {
  const now = new Date();
  const lastActivity = this.stats?.lastActivityAt;

  if (!lastActivity) {
    this.stats.streakDays = 1;
  } else {
    const diffDays = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      // Same day
    } else if (diffDays === 1) {
      this.stats.streakDays = (this.stats.streakDays || 0) + 1;
      if (this.stats.streakDays > this.stats.longestStreak) {
        this.stats.longestStreak = this.stats.streakDays;
      }
    } else {
      this.stats.streakDays = 1;
    }
  }
  this.stats.lastActivityAt = now;
};

// Pre-save middleware to sync progress
enrollmentSchema.pre('save', function() {
  if (this.isModified('lectureProgress')) {
    const completedLectureIds = this.lectureProgress
      .filter(p => p.isCompleted)
      .map(p => p.lecture);

    // Merge with existing completed lectures
    const existingIds = this.progress.completedLectures.map(id => id.toString());
    completedLectureIds.forEach(id => {
      if (!existingIds.includes(id.toString())) {
        this.progress.completedLectures.push(id);
      }
    });
  }
});

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

export default Enrollment;