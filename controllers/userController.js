import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import Enrollment from '../models/Enrollment.js';
import { paginate, buildPaginationResponse } from '../utils/helpers.js';
import { getFullImageUrl } from '../utils/imageHelper.js';

// Helper to transform user
const transformUser = (user) => {
  if (!user) return user;
  const obj = user.toObject ? user.toObject() : user;
  return {
    ...obj,
    avatar: getFullImageUrl(obj.avatar)
  };
};

// @desc Get all users (Admin)
// @route GET /api/users
// @access Private/Admin
export const getUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query.page, req.query.limit);
  const { search, role, status } = req.query;

  const query = {};

  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
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

  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: users.map(transformUser),
    pagination: buildPaginationResponse(total, page, limit)
  });
});

// @desc Get single user
// @route GET /api/users/:id
// @access Private/Admin
export const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const enrollments = await Enrollment.find({ student: user._id })
    .populate('course', 'title');

  res.json({
    success: true,
    data: {
      ...transformUser(user),
      enrollments
    }
  });
});

// @desc Create user (Admin)
// @route POST /api/users
// @access Private/Admin
export const createUser = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, phone, role } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error('User already exists with this email');
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    password,
    phone,
    role: role || 'student'
  });

  res.status(201).json({
    success: true,
    data: transformUser(user)
  });
});

// @desc Update user
// @route PUT /api/users/:id
// @access Private/Admin
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const {
    firstName,
    lastName,
    email,
    phone,
    role,
    isActive,
    bio,
    address
  } = req.body;

  if (email && email !== user.email) {
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      res.status(400);
      throw new Error('Email already in use');
    }
  }

  user.firstName = firstName || user.firstName;
  user.lastName = lastName || user.lastName;
  user.email = email || user.email;
  user.phone = phone || user.phone;
  user.role = role || user.role;
  user.isActive = isActive !== undefined ? isActive : user.isActive;
  user.bio = bio || user.bio;
  user.address = address || user.address;

  const updatedUser = await user.save();

  res.json({
    success: true,
    data: transformUser(updatedUser)
  });
});

// @desc Delete user
// @route DELETE /api/users/:id
// @access Private/Admin
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  if (user._id.toString() === req.user._id.toString()) {
    res.status(400);
    throw new Error('Cannot delete your own account');
  }

  await user.deleteOne();

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// @desc Toggle user status
// @route PATCH /api/users/:id/toggle-status
// @access Private/Admin
export const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  user.isActive = !user.isActive;
  await user.save();

  res.json({
    success: true,
    data: {
      isActive: user.isActive
    },
    message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`
  });
});

// @desc Get user stats
// @route GET /api/users/stats
// @access Private/Admin
export const getUserStats = asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ isActive: true });
  const students = await User.countDocuments({ role: 'student' });
  const instructors = await User.countDocuments({ role: 'instructor' });
  const admins = await User.countDocuments({ role: 'admin' });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const newUsersThisMonth = await User.countDocuments({
    createdAt: { $gte: startOfMonth }
  });

  res.json({
    success: true,
    data: {
      total: totalUsers,
      active: activeUsers,
      inactive: totalUsers - activeUsers,
      byRole: {
        students,
        instructors,
        admins
      },
      newThisMonth: newUsersThisMonth
    }
  });
});

// @desc Add course to wishlist
// @route POST /api/users/wishlist/:courseId
// @access Private
export const addToWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const courseId = req.params.courseId;

  if (user.wishlist.includes(courseId)) {
    res.status(400);
    throw new Error('Course already in wishlist');
  }

  user.wishlist.push(courseId);
  await user.save();

  res.json({
    success: true,
    message: 'Course added to wishlist'
  });
});

// @desc Remove course from wishlist
// @route DELETE /api/users/wishlist/:courseId
// @access Private
export const removeFromWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const courseId = req.params.courseId;

  user.wishlist = user.wishlist.filter(id => id.toString() !== courseId);
  await user.save();

  res.json({
    success: true,
    message: 'Course removed from wishlist'
  });
});

// @desc Get wishlist
// @route GET /api/users/wishlist
// @access Private
export const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate({
      path: 'wishlist',
      select: 'title slug thumbnail price discountPrice instructor rating',
      populate: {
        path: 'instructor',
        select: 'firstName lastName avatar'
      }
    });

  const transformedWishlist = user.wishlist.map(course => {
    const obj = course.toObject ? course.toObject() : course;
    return {
      ...obj,
      thumbnail: getFullImageUrl(obj.thumbnail),
      instructor: obj.instructor ? {
        ...obj.instructor,
        avatar: getFullImageUrl(obj.instructor.avatar)
      } : obj.instructor
    };
  });

  res.json({
    success: true,
    data: transformedWishlist
  });
});

// @desc Get all instructors (for dropdowns)
// @route GET /api/users/instructors
// @access Private/Admin
export const getInstructors = asyncHandler(async (req, res) => {
  const instructors = await User.find({
    role: { $in: ['instructor', 'admin'] },
    isActive: true
  }).select('firstName lastName email avatar');

  res.json({
    success: true,
    data: instructors.map(transformUser)
  });
});