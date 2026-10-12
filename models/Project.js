// models/Project.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true,
    maxLength: [100, 'Title cannot exceed 100 characters'],
  },

  slug: {
    type: String,
    unique: true,
    lowercase: true,
  },

  shortDescription: {
    type: String,
    required: [true, 'Short description is required'],
    maxLength: [200, 'Short description cannot exceed 200 characters'],
  },

  fullDescription: {
    type: String,
    required: [true, 'Full description is required'],
    maxLength: [3000, 'Description too long'],
  },

  category: {
    type: String,
    required: true,
    enum: [
      'web-development',
      'mobile-development',
      'software-development',
      'ui-ux-design',
      'digital-marketing',
      'seo-services',
    ],
  },

  // Main thumbnail
  thumbnail: {
    type: String,
    required: true,
  },

  // Multiple screenshots
  screenshots: [{
    url: { type: String, required: true },
    caption: { type: String, maxLength: 200 },
  }],

  // Client info
  clientName: {
    type: String,
    maxLength: 100,
  },

  clientLogo: {
    type: String,
  },

  clientLocation: {
    type: String,
    maxLength: 100,
  },

  // Project URLs
  liveUrl: {
    type: String,
    maxLength: 500,
  },

  // Tech stack used
  technologies: [{
    name: { type: String, required: true, maxLength: 50 },
    icon: { type: String },
  }],

  // Project highlights
  features: [{
    type: String,
    maxLength: 200,
  }],

  // Challenges & solutions
  challenges: {
    type: String,
    maxLength: 1500,
  },

  solution: {
    type: String,
    maxLength: 1500,
  },

  // Results / metrics
  results: [{
    label: { type: String, required: true, maxLength: 100 },
    value: { type: String, required: true, maxLength: 50 },
  }],

  // Duration
  duration: {
    type: String,
    maxLength: 50, // e.g., "3 months"
  },

  completedDate: {
    type: Date,
  },

  // Testimonial from client
  testimonial: {
    text: { type: String, maxLength: 1000 },
    author: { type: String, maxLength: 100 },
    position: { type: String, maxLength: 100 },
    rating: { type: Number, min: 1, max: 5 },
  },

  // Status
  status: {
    type: String,
    enum: ['completed', 'in-progress', 'archived'],
    default: 'completed',
  },

  // Visibility
  isPublished: {
    type: Boolean,
    default: false,
  },

  isFeatured: {
    type: Boolean,
    default: false,
  },

  order: {
    type: Number,
    default: 0,
  },

  views: {
    type: Number,
    default: 0,
  },

  // Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // SEO
  metaTitle: {
    type: String,
    maxLength: 70,
  },
  metaDescription: {
    type: String,
    maxLength: 160,
  },
  metaKeywords: [{ type: String }],

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// =============================================
// INDEXES
// =============================================
projectSchema.index({ category: 1, isPublished: 1 });
projectSchema.index({ isFeatured: 1, isPublished: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ order: 1 });
projectSchema.index({ createdAt: -1 });

// =============================================
// PRE-SAVE HOOKS
// =============================================

// Auto-generate slug
projectSchema.pre('save', async function (next) {
  if (this.isModified('title') || !this.slug) {
    let baseSlug = slugify(this.title, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;

    while (await this.constructor.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = slug;
  }
  next();
});

// =============================================
// VIRTUALS
// =============================================
projectSchema.virtual('categoryLabel').get(function () {
  const labels = {
    'web-development': 'Web Development',
    'mobile-development': 'Mobile App Development',
    'software-development': 'Custom Software',
    'ui-ux-design': 'UI/UX Design',
    'digital-marketing': 'Digital Marketing',
    'seo-services': 'SEO Services',
  };
  return labels[this.category] || this.category;
});

const Project = mongoose.model('Project', projectSchema);

export default Project;