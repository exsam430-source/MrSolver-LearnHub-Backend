import mongoose from 'mongoose';

const progressSchema = new mongoose.Schema({
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
  lecture: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lecture',
    required: true
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  watchTime: {
    type: Number,
    default: 0
  },
  lastPosition: {
    type: Number,
    default: 0
  },
  quizScore: {
    score: Number,
    totalQuestions: Number,
    correctAnswers: Number,
    attempts: { type: Number, default: 0 },
    lastAttempt: Date
  },
  assignmentSubmission: {
    submittedAt: Date,
    content: String,
    attachments: [String],
    grade: Number,
    feedback: String,
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    gradedAt: Date
  },
  notes: [{
    content: String,
    timestamp: Number,
    createdAt: { type: Date, default: Date.now }
  }],
  completedAt: Date
}, {
  timestamps: true
});

// Compound index
progressSchema.index({ student: 1, course: 1, lecture: 1 }, { unique: true });

const Progress = mongoose.model('Progress', progressSchema);

export default Progress;