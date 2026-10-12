// models/Payment.js
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    unique: true,
    index: true
  },

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

  enrollment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enrollment'
  },

  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0, 'Amount cannot be negative']
  },

  currency: {
    type: String,
    default: 'PKR',
    enum: ['PKR']
  },

  paymentMethod: {
    type: String,
    enum: {
      values: ['easypaisa', 'bank_transfer'],
      message: 'Invalid payment method'
    },
    default: 'easypaisa'
  },

  // ✅ UPDATED: Added 'first_payment' type
  paymentType: {
    type: String,
    enum: {
      values: [
        'one_time',
        'registration_fee',
        'monthly_subscription',
        'first_payment'   // ✅ NEW: monthly + registration fee combined
      ],
      message: 'Invalid payment type'
    },
    default: 'one_time'
  },

  // ✅ For subscription: which month this payment is for
  subscriptionMonth: {
    type: Number,
    min: 1
  },

  screenshot: {
    type: String,
    required: [true, 'Payment screenshot is required']
  },

  additionalScreenshots: [String],

  status: {
    type: String,
    enum: {
      values: ['pending', 'under_review', 'approved', 'rejected', 'refunded'],
      message: 'Invalid payment status'
    },
    default: 'pending',
    index: true
  },

  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  reviewedAt: Date,
  reviewNotes: {
    type: String,
    maxLength: [500, 'Review notes cannot exceed 500 characters']
  },
  rejectionReason: {
    type: String,
    maxLength: [500, 'Rejection reason cannot exceed 500 characters']
  },

  receiptNumber: {
    type: String,
    index: true
  }
}, {
  timestamps: true
});

// =============================================
// INDEXES
// =============================================
paymentSchema.index({ student: 1, status: 1 });
paymentSchema.index({ course: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });
// ✅ Index for first payment check queries
paymentSchema.index({ student: 1, course: 1, status: 1, paymentType: 1 });

// =============================================
// PRE-SAVE HOOK
// =============================================
paymentSchema.pre('save', function() {
  if (!this.paymentId) {
    this.paymentId = `PAY-${uuidv4().split('-')[0].toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  }

  if (this.isModified('status') && this.status === 'approved' && !this.receiptNumber) {
    this.receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
  }
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;