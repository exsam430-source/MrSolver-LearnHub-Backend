// models/Enrollment.js
import mongoose from 'mongoose';

// ✅ Sub-schema for lecture progress
const lectureProgressSchema = new mongoose.Schema({
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true
  },
  watchCount: { type: Number, default: 0, min: 0 },
  totalWatchTime: { type: Number, default: 0, min: 0 },
  lastPosition: { type: Number, default: 0, min: 0 },
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
  personalNotes: {
    type: String,
    maxLength: [5000, 'Notes cannot exceed 5000 characters']
  }
}, { _id: false });

// ✅ Code submission schema
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

// ✅ Zoom attendance schema
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

// ✅ Bookmark schema
const bookmarkSchema = new mongoose.Schema({
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture'
  },
  timestamp: { type: Number, min: 0 },
  note: {
    type: String,
    maxLength: [500, 'Bookmark note cannot exceed 500 characters']
  },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const enrollmentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  enrollmentDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'active', 'completed', 'expired', 'cancelled'],
      message: 'Invalid enrollment status'
    },
    default: 'pending',
    index: true
  },
  paymentStatus: {
    type: String,
    enum: {
      values: ['pending', 'paid', 'failed', 'refunded'],
      message: 'Invalid payment status'
    },
    default: 'pending'
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },

  // ✅ Progress tracking
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
      default: 0,
      min: 0,
      max: 100
    },
    lastAccessed: Date
  },

  lectureProgress: [lectureProgressSchema],
  codeSubmissions: [codeSubmissionSchema],
  zoomAttendance: [zoomAttendanceSchema],
  bookmarks: [bookmarkSchema],

  // ✅ Stats
  stats: {
    totalWatchTime: { type: Number, default: 0, min: 0 },
    totalTimeSpent: { type: Number, default: 0, min: 0 },
    averageQuizScore: { type: Number, default: 0 },
    lastActivityAt: Date,
    streakDays: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 }
  },

  // ✅ Certificate fields
  certificateIssued: {
    type: Boolean,
    default: false
  },
  certificateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Certificate'
  },
  certificateUrl: String,
  certificateIssuedAt: Date,

  // ✅ Subscription tracking (NEW)
  subscriptionExpiry: {
    type: Date,
    index: true
  },
  subscriptionMonthsPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  isPermanentlyUnlocked: {
    type: Boolean,
    default: false
  },
  lastSubscriptionPayment: Date,

  completedAt: Date,
  expiresAt: Date,
  notes: {
    type: String,
    maxLength: [1000, 'Notes cannot exceed 1000 characters']
  }
}, {
  timestamps: true
});

// =============================================
// INDEXES
// =============================================
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ course: 1, status: 1 });
enrollmentSchema.index({ student: 1, status: 1 });
enrollmentSchema.index({ certificateId: 1 });
enrollmentSchema.index({ subscriptionExpiry: 1, status: 1 });
enrollmentSchema.index({ createdAt: -1 });

// =============================================
// METHODS
// =============================================

enrollmentSchema.methods.getLectureProgress = function(lectureId) {
  return this.lectureProgress.find(
    p => p.lecture.toString() === lectureId.toString()
  );
};

enrollmentSchema.methods.isLectureCompleted = function(lectureId) {
  const progress = this.getLectureProgress(lectureId);
  return progress?.isCompleted ||
    this.progress.completedLectures.some(
      id => id.toString() === lectureId.toString()
    );
};

enrollmentSchema.methods.calculateProgress = function(totalLectures) {
  if (!totalLectures || totalLectures <= 0) return 0;
  const fromDetailed = this.lectureProgress.filter(p => p.isCompleted).length;
  const fromLegacy = this.progress.completedLectures.length;
  const completed = Math.max(fromDetailed, fromLegacy);
  return Math.round((completed / totalLectures) * 100);
};

enrollmentSchema.methods.updateStreak = function() {
  const now = new Date();
  const lastActivity = this.stats?.lastActivityAt;

  if (!lastActivity) {
    this.stats.streakDays = 1;
  } else {
    const diffDays = Math.floor(
      (now - lastActivity) / (1000 * 60 * 60 * 24)
    );
    if (diffDays === 0) {
      // Same day - no change
    } else if (diffDays === 1) {
      this.stats.streakDays = (this.stats.streakDays || 0) + 1;
      if (this.stats.streakDays > (this.stats.longestStreak || 0)) {
        this.stats.longestStreak = this.stats.streakDays;
      }
    } else {
      this.stats.streakDays = 1;
    }
  }
  this.stats.lastActivityAt = now;
};

// ✅ Check if subscription is still active
enrollmentSchema.methods.isSubscriptionActive = function() {
  if (this.isPermanentlyUnlocked) return true;
  if (!this.subscriptionExpiry) return false;
  return new Date(this.subscriptionExpiry) > new Date();
};

// =============================================
// PRE-SAVE HOOKS
// =============================================
enrollmentSchema.pre('save', function() {
  if (this.isModified('lectureProgress')) {
    const completedIds = this.lectureProgress
      .filter(p => p.isCompleted)
      .map(p => p.lecture);

    const existingIds = this.progress.completedLectures.map(
      id => id.toString()
    );

    completedIds.forEach(id => {
      if (!existingIds.includes(id.toString())) {
        this.progress.completedLectures.push(id);
      }
    });
  }
});

const Enrollment = mongoose.model('Enrollment', enrollmentSchema);

export default Enrollment;