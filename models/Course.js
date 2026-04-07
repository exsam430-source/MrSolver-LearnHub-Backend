// models/Course.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Course title is required'],
    trim: true,
    maxLength: [200, 'Title cannot exceed 200 characters']
  },
  slug: {
    type: String,
    unique: true
  },
  description: {
    type: String,
    required: [true, 'Course description is required']
  },
  shortDescription: {
    type: String,
    maxLength: [300, 'Short description cannot exceed 300 characters']
  },
  thumbnail: { 
    type: String, 
    default: 'thumbnails/default-course.png' 
  },
  previewVideo: {
    type: String
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  level: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'all-levels'],
    default: 'all-levels'
  },
  language: {
    type: String,
    default: 'English'
  },
  price: {
    type: Number,
    required: [true, 'Course price is required'],
    min: [0, 'Price cannot be negative']
  },
  discountPrice: {
    type: Number,
    min: [0, 'Discount price cannot be negative']
  },
  duration: {
    type: Number,
    default: 0
  },
  totalLectures: {
    type: Number,
    default: 0
  },
  requirements: [{
    type: String
  }],
  whatYouWillLearn: [{
    type: String
  }],
  targetAudience: [{
    type: String
  }],
  curriculum: [{
    sectionTitle: {
      type: String,
      required: true
    },
    sectionDescription: String,
    lectures: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lecture'
    }],
    order: Number
  }],
  isPublished: {
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isFreeCourse: {
    type: Boolean,
    default: false
  },
  enrollmentCount: {
    type: Number,
    default: 0
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
      default: 0
    }
  },

  // ✅ Certificate Configuration
  completionCertificate: {
    type: Boolean,
    default: true
  },
  certificateTemplate: {
    type: String,
    default: null  // PDF file path
  },
  certificateSettings: {
    autoIssue: { 
      type: Boolean, 
      default: true 
    },
    minimumScore: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100
    },
    requireAllLectures: { 
      type: Boolean, 
      default: true 
    },
    customMessage: { 
      type: String, 
      default: '',
      maxLength: 500
    },
    expiryMonths: {
      type: Number,
      default: 0  // 0 = no expiry
    },
    showInstructorSignature: {
      type: Boolean,
      default: true
    }
  },

  publishedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for lectures
courseSchema.virtual('lectures', {
  ref: 'Lecture',
  localField: '_id',
  foreignField: 'course'
});

// Virtual for reviews
courseSchema.virtual('reviews', {
  ref: 'Review',
  localField: '_id',
  foreignField: 'course'
});

// Virtual for certificates
courseSchema.virtual('certificates', {
  ref: 'Certificate',
  localField: '_id',
  foreignField: 'course'
});

// Generate slug before saving
courseSchema.pre('save', function() {
  if (this.isModified('title') || !this.slug) {
    this.slug = slugify(this.title, { lower: true, strict: true }) + '-' + Date.now();
  }
});

// Index for search
courseSchema.index({ title: 'text', description: 'text', tags: 'text' });
courseSchema.index({ instructor: 1 });
courseSchema.index({ category: 1 });
courseSchema.index({ isPublished: 1 });

const Course = mongoose.model('Course', courseSchema);

export default Course;