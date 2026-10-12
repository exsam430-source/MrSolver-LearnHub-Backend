// models/Course.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Course title is required'],
    trim: true,
    minLength: [5, 'Title must be at least 5 characters'],
    maxLength: [200, 'Title cannot exceed 200 characters']
  },

  slug: {
    type: String,
    unique: true,
    index: true
  },

  description: {
    type: String,
    required: [true, 'Course description is required'],
    minLength: [20, 'Description must be at least 20 characters']
  },

  shortDescription: {
    type: String,
    maxLength: [300, 'Short description cannot exceed 300 characters'],
    trim: true
  },

  thumbnail: {
    type: String,
    default: 'thumbnails/default-course.png'
  },

  previewVideo: {
    type: String,
    trim: true
  },

  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Instructor is required'],
    index: true
  },

  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required'],
    index: true
  },

  tags: [{
    type: String,
    trim: true,
    maxLength: [50, 'Tag cannot exceed 50 characters']
  }],

  level: {
    type: String,
    enum: {
      values: ['beginner', 'intermediate', 'advanced', 'all-levels'],
      message: 'Level must be beginner, intermediate, advanced, or all-levels'
    },
    default: 'all-levels'
  },

  language: {
    type: String,
    default: 'English',
    trim: true,
    maxLength: [50, 'Language cannot exceed 50 characters']
  },

  // =============================================
  // ✅ PRICING SYSTEM
  // =============================================
  pricingType: {
    type: String,
    enum: {
      values: ['free', 'one_time', 'subscription'],
      message: 'Pricing type must be free, one_time, or subscription'
    },
    default: 'one_time'
  },

  price: {
    type: Number,
    required: [true, 'Course price is required'],
    min: [0, 'Price cannot be negative'],
    default: 0
  },

  discountPrice: {
    type: Number,
    min: [0, 'Discount price cannot be negative'],
    validate: {
      validator: function(val) {
        return !val || val < this.price;
      },
      message: 'Discount price must be less than regular price'
    }
  },

  isFreeCourse: {
    type: Boolean,
    default: false
  },

  // ✅ Subscription pricing
  subscriptionPlans: {
    // Monthly subscription
    monthly: {
      enabled: { type: Boolean, default: false },
      price: { type: Number, min: 0, default: 0 },
      // After how many months course is permanently unlocked
      permanentUnlockAfterMonths: { type: Number, default: 0 }
    },
    // Registration fee (one-time fee before subscription)
    registrationFee: {
      enabled: { type: Boolean, default: false },
      amount: { type: Number, min: 0, default: 0 }
    }
  },

  duration: {
    type: Number,
    default: 0,
    min: 0
  },

  totalLectures: {
    type: Number,
    default: 0,
    min: 0
  },

  requirements: [{
    type: String,
    trim: true,
    maxLength: [200, 'Requirement cannot exceed 200 characters']
  }],

  whatYouWillLearn: [{
    type: String,
    trim: true,
    maxLength: [200, 'Learning outcome cannot exceed 200 characters']
  }],

  targetAudience: [{
    type: String,
    trim: true,
    maxLength: [200, 'Target audience cannot exceed 200 characters']
  }],

  curriculum: [{
    sectionTitle: {
      type: String,
      required: [true, 'Section title is required'],
      trim: true,
      maxLength: [200, 'Section title cannot exceed 200 characters']
    },
    sectionDescription: {
      type: String,
      trim: true,
      maxLength: [500, 'Section description cannot exceed 500 characters']
    },
    lectures: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lecture'
    }],
    order: {
      type: Number,
      default: 0
    }
  }],

  isPublished: {
    type: Boolean,
    default: false,
    index: true
  },

  isFeatured: {
    type: Boolean,
    default: false,
    index: true
  },

  enrollmentCount: {
    type: Number,
    default: 0,
    min: 0
  },

  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0,
      min: 0
    }
  },

  // ✅ Certificate Configuration
  completionCertificate: {
    type: Boolean,
    default: true
  },

  certificateTemplate: {
    type: String,
    default: null
  },

  certificateSettings: {
    autoIssue: { type: Boolean, default: true },
    minimumScore: { type: Number, default: 0, min: 0, max: 100 },
    requireAllLectures: { type: Boolean, default: true },
    customMessage: { type: String, default: '', maxLength: 500 },
    expiryMonths: { type: Number, default: 0 },
    showInstructorSignature: { type: Boolean, default: true }
  },

  publishedAt: Date

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =============================================
// INDEXES
// =============================================
courseSchema.index({ title: 'text', description: 'text', tags: 'text' });
courseSchema.index({ instructor: 1, isPublished: 1 });
courseSchema.index({ category: 1, isPublished: 1 });
courseSchema.index({ isFeatured: 1, isPublished: 1 });
courseSchema.index({ createdAt: -1 });
courseSchema.index({ enrollmentCount: -1 });
courseSchema.index({ 'rating.average': -1 });

// =============================================
// VIRTUALS
// =============================================
courseSchema.virtual('lectures', {
  ref: 'Lecture',
  localField: '_id',
  foreignField: 'course'
});

courseSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'course'
});

courseSchema.virtual('certificates', {
  ref: 'Certificate',
  localField: '_id',
  foreignField: 'course'
});

// ✅ Virtual: effective price (discount or regular)
courseSchema.virtual('effectivePrice').get(function() {
  if (this.isFreeCourse || this.pricingType === 'free') return 0;
  return this.discountPrice || this.price;
});

// ✅ Virtual: discount percentage
courseSchema.virtual('discountPercentage').get(function() {
  if (!this.discountPrice || !this.price) return 0;
  return Math.round(((this.price - this.discountPrice) / this.price) * 100);
});

// =============================================
// PRE-SAVE HOOKS
// =============================================

// ✅ Generate slug
courseSchema.pre('save', function() {
  if (this.isModified('title') || !this.slug) {
    this.slug = slugify(this.title, {
      lower: true,
      strict: true,
      trim: true
    }) + '-' + Date.now();
  }
});

// ✅ Sanitize tags - prevent XSS in tags
courseSchema.pre('save', function() {
  if (this.isModified('tags') && this.tags) {
    this.tags = this.tags
      .map(tag => tag.replace(/<[^>]*>/g, '').trim())
      .filter(tag => tag.length > 0)
      .slice(0, 20); // max 20 tags
  }
});

// ✅ Sync isFreeCourse with pricingType
courseSchema.pre('save', function() {
  if (this.pricingType === 'free') {
    this.isFreeCourse = true;
    this.price = 0;
  } else if (this.isFreeCourse) {
    this.pricingType = 'free';
    this.price = 0;
  }
});

// =============================================
// METHODS
// =============================================

// ✅ Check if subscription plan is active
courseSchema.methods.isSubscriptionActive = function() {
  return this.pricingType === 'subscription' &&
    this.subscriptionPlans?.monthly?.enabled;
};

// ✅ Get pricing summary
courseSchema.methods.getPricingSummary = function() {
  if (this.isFreeCourse || this.pricingType === 'free') {
    return { type: 'free', display: 'Free' };
  }

  if (this.pricingType === 'subscription') {
    const plan = this.subscriptionPlans?.monthly;
    const regFee = this.subscriptionPlans?.registrationFee;
    return {
      type: 'subscription',
      monthlyPrice: plan?.price || 0,
      registrationFee: regFee?.enabled ? regFee.amount : 0,
      permanentUnlockAfterMonths: plan?.permanentUnlockAfterMonths || 0
    };
  }

  return {
    type: 'one_time',
    price: this.price,
    discountPrice: this.discountPrice,
    effectivePrice: this.effectivePrice
  };
};

const Course = mongoose.model('Course', courseSchema);

export default Course;