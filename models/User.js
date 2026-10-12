// models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    minLength: [2, 'First name must be at least 2 characters'],
    maxLength: [50, 'First name cannot exceed 50 characters'],
    // ✅ Sanitize - only letters, spaces, hyphens, apostrophes
    match: [/^[a-zA-Z\s'-]+$/, 'First name can only contain letters']
  },

  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    minLength: [2, 'Last name must be at least 2 characters'],
    maxLength: [50, 'Last name cannot exceed 50 characters'],
    match: [/^[a-zA-Z\s'-]+$/, 'Last name can only contain letters']
  },

  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    maxLength: [100, 'Email cannot exceed 100 characters'],
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },

  password: {
    type: String,
    minLength: [8, 'Password must be at least 8 characters'],
    select: false
  },

  phone: {
    type: String,
    trim: true,
    match: [/^\+?[\d\s\-()]{7,15}$/, 'Please provide a valid phone number'],
    maxLength: [20, 'Phone number too long']
  },

  avatar: {
    type: String,
    default: 'avatars/default-avatar.png',
    maxLength: [500, 'Avatar URL too long']
  },

  role: {
    type: String,
    enum: {
      values: ['student', 'instructor', 'admin', 'developer'],
      message: 'Role must be student, instructor, admin, or developer'
    },
    default: 'student'
  },

  isActive: {
    type: Boolean,
    default: true
  },

  // ✅ Email verification
  isEmailVerified: {
    type: Boolean,
    default: false
  },

  emailVerificationToken: {
    type: String,
    select: false
  },

  emailVerificationExpire: {
    type: Date,
    select: false
  },

  authProvider: {
    type: String,
    enum: ['local', 'google'],
    default: 'local'
  },

  googleId: {
    type: String,
    select: false
  },

  // ✅ Password reset (existing)
  resetPasswordToken: {
    type: String,
    select: false
  },

  resetPasswordExpire: {
    type: Date,
    select: false
  },

  // ✅ Refresh token (NEW - for token rotation)
  refreshToken: {
    type: String,
    select: false
  },

  // ✅ Track when password was changed (for token invalidation)
  passwordChangedAt: {
    type: Date,
    select: false
  },

  // ✅ Brute force protection
  loginAttempts: {
    type: Number,
    default: 0,
    select: false
  },

  lockUntil: {
    type: Date,
    select: false
  },

  // ✅ Terms acceptance (GDPR compliance)
  termsAcceptedAt: {
    type: Date
  },

  termsVersion: {
    type: String,
    default: '1.0'
  },

  bio: {
    type: String,
    maxLength: [500, 'Bio cannot exceed 500 characters'],
    trim: true
  },

  address: {
    street: { type: String, trim: true, maxLength: 100 },
    city: { type: String, trim: true, maxLength: 50 },
    state: { type: String, trim: true, maxLength: 50 },
    country: { type: String, trim: true, maxLength: 50 },
    zipCode: { type: String, trim: true, maxLength: 10 }
  },

  socialLinks: {
    website: { type: String, maxLength: 200 },
    linkedin: { type: String, maxLength: 200 },
    twitter: { type: String, maxLength: 200 },
    github: { type: String, maxLength: 200 }
  },

  education: [{
    degree: { type: String, trim: true, maxLength: 100 },
    institution: { type: String, trim: true, maxLength: 100 },
    year: { type: String, match: /^\d{4}$/ }
  }],

  enrolledCourses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],

  wishlist: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course'
  }],

  lastLogin: Date,

  // ✅ Track last IP for security monitoring
  lastLoginIp: {
    type: String,
    select: false
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =============================================
// INDEXES
// =============================================

userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// =============================================
// VIRTUALS
// =============================================
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ✅ Virtual to check if account is locked
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// =============================================
// PRE-SAVE HOOKS
// =============================================

// ✅ Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;

  // ✅ Salt rounds: 12 (good balance of security/performance)
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);

  // ✅ Track when password changed (for token invalidation)
  if (!this.isNew) {
    this.passwordChangedAt = new Date(Date.now() - 1000); // 1s back to ensure token issued after
  }
});

// =============================================
// METHODS
// =============================================

// ✅ Compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// ✅ Increment login attempts (brute force protection)
userSchema.methods.incrementLoginAttempts = async function () {
  const MAX_ATTEMPTS = 5;
  const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

  // ✅ Reset if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return await this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // ✅ Lock account if max attempts reached
  if (this.loginAttempts + 1 >= MAX_ATTEMPTS) {
    updates.$set = { lockUntil: new Date(Date.now() + LOCK_TIME) };
  }

  return await this.updateOne(updates);
};

// ✅ Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = async function () {
  return await this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

// ✅ Get safe public profile (no sensitive fields)
userSchema.methods.getPublicProfile = function () {
  return {
    _id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    email: this.email,
    avatar: this.avatar,
    role: this.role,
    bio: this.bio,
    socialLinks: this.socialLinks,
    authProvider: this.authProvider,
    isEmailVerified: this.isEmailVerified,
    createdAt: this.createdAt
  };
};

const User = mongoose.model('User', userSchema);

export default User;