// controllers/userController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Enrollment from '../models/Enrollment.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import { getFullImageUrl } from '../utils/imageHelper.js';
import { securityLog } from '../middleware/auditLog.js';

// ✅ Safe user transform
const transformUser = (user) => {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : user;

  // ✅ Remove all sensitive fields
  const {
    password,
    resetPasswordToken,
    resetPasswordExpire,
    refreshToken,
    emailVerificationToken,
    emailVerificationExpire,
    loginAttempts,
    lockUntil,
    googleId,
    lastLoginIp,
    passwordChangedAt,
    ...safeObj
  } = obj;

  return {
    ...safeObj,
    avatar: getFullImageUrl(obj.avatar)
  };
};

// ✅ Validate MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// =============================================
// GET ALL USERS (Admin)
// =============================================
export const getUsers = asyncHandler(async (req, res) => {
  // ✅ Pagination from validated query
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { search, role, status, sort } = req.query;

  const query = {};

  // ✅ Safe search with escaped regex (prevent ReDoS)
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escapedSearch, 'i');
    query.$or = [
      { firstName: searchRegex },
      { lastName: searchRegex },
      { email: searchRegex }
    ];
  }

  if (role && role !== 'all') {
    query.role = role;
  }

  if (status === 'active') {
    query.isActive = true;
  } else if (status === 'inactive') {
    query.isActive = false;
  }

  // ✅ Sort options (whitelist)
  const sortOptions = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name: { firstName: 1, lastName: 1 }
  };
  const sortBy = sortOptions[sort] || sortOptions.newest;

  const [total, users] = await Promise.all([
    User.countDocuments(query),
    User.find(query)
      .select('-password -resetPasswordToken -resetPasswordExpire -refreshToken -emailVerificationToken -googleId -loginAttempts -lockUntil -lastLoginIp -passwordChangedAt')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean() // ✅ Better performance for read-only
  ]);

  res.json({
    success: true,
    data: users.map((u) => ({
      ...u,
      avatar: getFullImageUrl(u.avatar)
    })),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// =============================================
// GET SINGLE USER (Admin)
// =============================================
export const getUser = asyncHandler(async (req, res) => {
  // ✅ Validate ObjectId before DB query
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid user ID format');
  }

  const user = await User.findById(req.params.id)
    .select('-password -resetPasswordToken -resetPasswordExpire -refreshToken -emailVerificationToken -googleId -loginAttempts -lockUntil -lastLoginIp -passwordChangedAt');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // ✅ Get enrollments safely
  const enrollments = await Enrollment.find({ student: user._id })
    .populate('course', 'title slug')
    .select('course enrolledAt completedAt isCompleted')
    .lean();

  res.json({
    success: true,
    data: {
      ...transformUser(user),
      enrollments
    }
  });
});

// =============================================
// CREATE USER (Admin)
// =============================================
export const createUser = asyncHandler(async (req, res) => {
  // ✅ Validation done by middleware
  const { firstName, lastName, email, password, phone, role } = req.body;

  const userExists = await User.findOne({ email: email.toLowerCase() });

  if (userExists) {
    res.status(400);
    throw new Error('A user with this email already exists');
  }

  const user = await User.create({
    firstName,
    lastName,
    email: email.toLowerCase(),
    password,
    phone,
    role: role || 'student',
    isActive: true,
    isEmailVerified: true, // ✅ Admin-created users are pre-verified
    termsAcceptedAt: new Date(),
    termsVersion: '1.0'
  });

  // ✅ Log admin action
  securityLog('ADMIN_USER_CREATED', {
    adminId: req.user._id,
    newUserId: user._id,
    newUserEmail: user.email,
    newUserRole: user.role,
    ip: req.ip
  });

  res.status(201).json({
    success: true,
    message: 'User created successfully',
    data: transformUser(user)
  });
});

// =============================================
// UPDATE USER (Admin)
// =============================================
export const updateUser = asyncHandler(async (req, res) => {
  // ✅ Validate ObjectId
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid user ID format');
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // ✅ Validation done by middleware
  const { firstName, lastName, email, phone, role, isActive, bio, address } = req.body;

  // ✅ Check email uniqueness if changing
  if (email && email.toLowerCase() !== user.email) {
    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      res.status(400);
      throw new Error('Email address is already in use');
    }
  }

  // ✅ Prevent demoting the last admin
  if (role && role !== 'admin' && user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
    if (adminCount <= 1) {
      res.status(400);
      throw new Error('Cannot change role - this is the last admin account');
    }
  }

  // ✅ Track what changed for audit log
  const changes = {};
  if (firstName && firstName !== user.firstName) changes.firstName = true;
  if (lastName && lastName !== user.lastName) changes.lastName = true;
  if (email && email !== user.email) changes.email = true;
  if (role && role !== user.role) changes.role = { from: user.role, to: role };
  if (isActive !== undefined && isActive !== user.isActive) {
    changes.isActive = { from: user.isActive, to: isActive };
  }

  // ✅ Apply updates
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (email !== undefined) user.email = email.toLowerCase();
  if (phone !== undefined) user.phone = phone;
  if (role !== undefined) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;
  if (bio !== undefined) user.bio = bio;
  if (address !== undefined) user.address = { ...user.address, ...address };

  const updatedUser = await user.save();

  // ✅ Audit log changes
  securityLog('ADMIN_USER_UPDATED', {
    adminId: req.user._id,
    targetUserId: user._id,
    changes,
    ip: req.ip
  });

  res.json({
    success: true,
    message: 'User updated successfully',
    data: transformUser(updatedUser)
  });
});

// =============================================
// DELETE USER (Admin)
// =============================================
export const deleteUser = asyncHandler(async (req, res) => {
  // ✅ Validate ObjectId
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid user ID format');
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // ✅ Prevent self-deletion
  if (user._id.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error('You cannot delete your own account');
  }

  // ✅ Prevent deleting last admin
  if (user.role === 'admin') {
    const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
    if (adminCount <= 1) {
      res.status(400);
      throw new Error('Cannot delete the last admin account');
    }
  }

  // ✅ Audit log BEFORE deletion
  securityLog('ADMIN_USER_DELETED', {
    adminId: req.user._id,
    deletedUserId: user._id,
    deletedUserEmail: user.email,
    deletedUserRole: user.role,
    ip: req.ip
  });

  await user.deleteOne();

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// =============================================
// TOGGLE USER STATUS (Admin)
// =============================================
export const toggleUserStatus = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error('Invalid user ID format');
  }

  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // ✅ Prevent deactivating self
  if (user._id.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error('You cannot deactivate your own account');
  }

  // ✅ Prevent deactivating last admin
  if (user.role === 'admin' && user.isActive) {
    const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
    if (activeAdmins <= 1) {
      res.status(400);
      throw new Error('Cannot deactivate the last active admin account');
    }
  }

  user.isActive = !user.isActive;

  // ✅ If deactivating, invalidate their sessions
  if (!user.isActive) {
    user.refreshToken = undefined;
  }

  await user.save({ validateBeforeSave: false });

  securityLog('ADMIN_USER_STATUS_TOGGLED', {
    adminId: req.user._id,
    targetUserId: user._id,
    newStatus: user.isActive ? 'active' : 'inactive',
    ip: req.ip
  });

  res.json({
    success: true,
    data: { isActive: user.isActive },
    message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`
  });
});

// =============================================
// GET USER STATS (Admin)
// =============================================
export const getUserStats = asyncHandler(async (req, res) => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // ✅ Run all queries in parallel
  const [
    totalUsers,
    activeUsers,
    students,
    instructors,
    admins,
    newUsersThisMonth,
    verifiedUsers
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'instructor' }),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ createdAt: { $gte: startOfMonth } }),
    User.countDocuments({ isEmailVerified: true })
  ]);

  res.json({
    success: true,
    data: {
      total: totalUsers,
      active: activeUsers,
      inactive: totalUsers - activeUsers,
      verified: verifiedUsers,
      unverified: totalUsers - verifiedUsers,
      byRole: { students, instructors, admins },
      newThisMonth: newUsersThisMonth
    }
  });
});

// =============================================
// WISHLIST - ADD
// =============================================
export const addToWishlist = asyncHandler(async (req, res) => {
  // ✅ Validate courseId
  if (!isValidObjectId(req.params.courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const user = await User.findById(req.user._id).select('wishlist');
  const courseId = req.params.courseId;

  // ✅ Convert to strings for comparison
  const alreadyInWishlist = user.wishlist.some(
    (id) => id.toString() === courseId
  );

  if (alreadyInWishlist) {
    res.status(400);
    throw new Error('Course is already in your wishlist');
  }

  // ✅ Max wishlist size (prevent abuse)
  if (user.wishlist.length >= 50) {
    res.status(400);
    throw new Error('Wishlist is full. Maximum 50 courses allowed.');
  }

  user.wishlist.push(courseId);
  await user.save({ validateBeforeSave: false });

  res.json({
    success: true,
    message: 'Course added to wishlist'
  });
});

// =============================================
// WISHLIST - REMOVE
// =============================================
export const removeFromWishlist = asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.courseId)) {
    res.status(400);
    throw new Error('Invalid course ID');
  }

  const courseId = req.params.courseId;

  await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { wishlist: courseId } },
    { new: true }
  );

  res.json({
    success: true,
    message: 'Course removed from wishlist'
  });
});

// =============================================
// WISHLIST - GET
// =============================================
export const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate({
      path: 'wishlist',
      select: 'title slug thumbnail price discountPrice instructor rating totalStudents level',
      populate: {
        path: 'instructor',
        select: 'firstName lastName avatar'
      }
    });

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const transformedWishlist = (user.wishlist || []).map((course) => {
    const obj = course.toObject ? course.toObject() : course;
    return {
      ...obj,
      thumbnail: getFullImageUrl(obj.thumbnail),
      instructor: obj.instructor
        ? {
            ...obj.instructor,
            avatar: getFullImageUrl(obj.instructor.avatar)
          }
        : null
    };
  });

  res.json({
    success: true,
    data: transformedWishlist,
    count: transformedWishlist.length
  });
});

// =============================================
// GET INSTRUCTORS (for dropdowns)
// =============================================
export const getInstructors = asyncHandler(async (req, res) => {
  const instructors = await User.find({
    role: { $in: ['instructor', 'admin'] },
    isActive: true
  })
    .select('firstName lastName email avatar')
    .sort({ firstName: 1 })
    .lean();

  res.json({
    success: true,
    data: instructors.map((i) => ({
      ...i,
      avatar: getFullImageUrl(i.avatar)
    }))
  });
});