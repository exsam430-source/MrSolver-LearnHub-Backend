// models/Category.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    maxLength: [100, 'Category name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  description: {
    type: String,
    maxLength: [500, 'Description cannot exceed 500 characters'],
    trim: true
  },
  icon: {
    type: String,
    default: 'code',
    trim: true,
    maxLength: [50, 'Icon cannot exceed 50 characters']
  },
  color: {
    type: String,
    default: '#3B82F6',
    match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Please provide a valid hex color']
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  order: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =============================================
// INDEXES
// =============================================
categorySchema.index({ name: 1 });
categorySchema.index({ isActive: 1, order: 1 });
categorySchema.index({ createdAt: -1 });

// =============================================
// VIRTUAL
// =============================================
categorySchema.virtual('coursesCount', {
  ref: 'Course',
  localField: '_id',
  foreignField: 'category',
  count: true
});

// =============================================
// PRE-SAVE HOOKS
// =============================================

// ✅ Generate slug from name
categorySchema.pre('save', function () {
  if (this.isModified('name') || !this.slug) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true,
      trim: true
    });
  }
});

// ✅ Generate slug before validation
categorySchema.pre('validate', function () {
  if (this.name && !this.slug) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true,
      trim: true
    });
  }
});

// ✅ Sanitize name - strip HTML tags
categorySchema.pre('save', function () {
  if (this.isModified('name') && this.name) {
    this.name = this.name.replace(/<[^>]*>/g, '').trim();
  }
  if (this.isModified('description') && this.description) {
    this.description = this.description.replace(/<[^>]*>/g, '').trim();
  }
});

const Category = mongoose.model('Category', categorySchema);

export default Category;