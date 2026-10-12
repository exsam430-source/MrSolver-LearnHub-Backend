// models/Service.js
import mongoose from 'mongoose';
import slugify from 'slugify';

// Package sub-schema
const packageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['Basic', 'Standard', 'Premium'],
  },
  tagline: {
    type: String,
    required: true,
    maxLength: 100,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  deliveryDays: {
    type: Number,
    required: true,
    min: 1,
  },
  revisions: {
    type: Number,
    default: 1,
    min: 0,
  },
  features: [{
    type: String,
    required: true,
    maxLength: 200,
  }],
  popular: {
    type: Boolean,
    default: false,
  },
}, { _id: false });

const serviceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Service title is required'],
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
    maxLength: [2000, 'Description too long'],
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

  icon: {
    type: String,
    default: 'Code', // Lucide icon name
  },

  thumbnail: {
    type: String,
    default: 'services/default-service.png',
  },

  coverImage: {
    type: String,
  },

  // What's included in all packages
  whatYouGet: [{
    type: String,
    maxLength: 200,
  }],

  // Technologies used
  technologies: [{
    name: { type: String, required: true, maxLength: 50 },
    icon: { type: String },
  }],

  // FAQ section
  faqs: [{
    question: { type: String, required: true, maxLength: 200 },
    answer: { type: String, required: true, maxLength: 1000 },
  }],

  // Process steps
  process: [{
    step: { type: Number, required: true },
    title: { type: String, required: true, maxLength: 100 },
    description: { type: String, maxLength: 300 },
  }],

  // 3 Packages: Basic, Standard, Premium
  packages: {
    type: [packageSchema],
    validate: {
      validator: function(v) {
        return v && v.length === 3;
      },
      message: 'Service must have exactly 3 packages (Basic, Standard, Premium)',
    },
  },

  // Stats
  totalOrders: {
    type: Number,
    default: 0,
  },

  rating: {
    average: { type: Number, default: 5, min: 0, max: 5 },
    count: { type: Number, default: 0 },
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
serviceSchema.index({ category: 1, isPublished: 1 });
serviceSchema.index({ isFeatured: 1, isPublished: 1 });
serviceSchema.index({ order: 1 });
serviceSchema.index({ createdAt: -1 });

// =============================================
// PRE-SAVE HOOKS
// =============================================

// Auto-generate slug from title
serviceSchema.pre('save', async function (next) {
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
serviceSchema.virtual('startingPrice').get(function () {
  if (!this.packages || this.packages.length === 0) return 0;
  return Math.min(...this.packages.map(p => p.price));
});

serviceSchema.virtual('categoryLabel').get(function () {
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

const Service = mongoose.model('Service', serviceSchema);

export default Service;