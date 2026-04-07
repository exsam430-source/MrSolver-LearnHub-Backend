// models/Payment.js
import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    unique: true
  },
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
  enrollment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enrollment'
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'PKR'
  },
  paymentMethod: {
    type: String,
    enum: ['easypaisa'],
    default: 'easypaisa'
  },
  screenshot: {
    type: String,
    required: [true, 'Payment screenshot is required']
  },
  additionalScreenshots: [String],
  status: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected', 'refunded'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNotes: String,
  rejectionReason: String,
  receiptNumber: String
}, {
  timestamps: true
});

// Generate paymentId and receiptNumber
paymentSchema.pre('save', function () {
  if (!this.paymentId) {
    this.paymentId = `PAY-${uuidv4().split('-')[0].toUpperCase()}`;
  }

  if (this.isModified('status') && this.status === 'approved' && !this.receiptNumber) {
    this.receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
});

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;