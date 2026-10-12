// middleware/courseValidate.js
import Joi from 'joi';
import { validate } from './validate.js';

// ✅ Sanitize string helper
const safeString = (max = 200) =>
  Joi.string()
    .trim()
    .max(max)
    .custom((value, helpers) => {
      // Strip HTML tags from input
      const clean = value.replace(/<[^>]*>/g, '').trim();
      if (!clean) return helpers.error('string.empty');
      return clean;
    });

// ✅ Course create schema
export const createCourseSchema = Joi.object({
  title: safeString(200)
    .min(5)
    .required()
    .messages({
      'string.min': 'Title must be at least 5 characters',
      'string.max': 'Title cannot exceed 200 characters',
      'any.required': 'Course title is required'
    }),

  description: safeString(5000)
    .min(20)
    .required()
    .messages({
      'string.min': 'Description must be at least 20 characters',
      'any.required': 'Description is required'
    }),

  shortDescription: safeString(300)
    .optional()
    .allow(''),

  category: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid category ID',
      'any.required': 'Category is required'
    }),

  level: Joi.string()
    .valid('beginner', 'intermediate', 'advanced', 'all-levels')
    .default('all-levels'),

  language: safeString(50)
    .optional()
    .default('English'),

  // ✅ Pricing type
  pricingType: Joi.string()
    .valid('free', 'one_time', 'subscription')
    .default('one_time'),

  price: Joi.number()
    .min(0)
    .max(1000000)
    .default(0)
    .messages({
      'number.min': 'Price cannot be negative',
      'number.max': 'Price seems too high'
    }),

  discountPrice: Joi.number()
    .min(0)
    .optional()
    .allow(null, ''),

  isFreeCourse: Joi.boolean()
    .default(false),

  // ✅ Subscription plans
  subscriptionPlans: Joi.object({
    monthly: Joi.object({
      enabled: Joi.boolean().default(false),
      price: Joi.number().min(0).default(0),
      permanentUnlockAfterMonths: Joi.number().min(0).max(120).default(0)
    }).optional(),
    registrationFee: Joi.object({
      enabled: Joi.boolean().default(false),
      amount: Joi.number().min(0).default(0)
    }).optional()
  }).optional(),

  requirements: Joi.array()
    .items(safeString(200))
    .max(20)
    .optional()
    .default([]),

  whatYouWillLearn: Joi.array()
    .items(safeString(200))
    .max(30)
    .optional()
    .default([]),

  targetAudience: Joi.array()
    .items(safeString(200))
    .max(10)
    .optional()
    .default([]),

  tags: Joi.array()
    .items(safeString(50))
    .max(20)
    .optional()
    .default([]),

  instructorId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Invalid instructor ID'
    })
});

// ✅ Course update schema (all optional)
export const updateCourseSchema = Joi.object({
  title: safeString(200).min(5).optional(),
  description: safeString(5000).min(20).optional(),
  shortDescription: safeString(300).optional().allow(''),
  category: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  level: Joi.string().valid('beginner', 'intermediate', 'advanced', 'all-levels').optional(),
  language: safeString(50).optional(),

  pricingType: Joi.string()
    .valid('free', 'one_time', 'subscription')
    .optional(),

  price: Joi.number().min(0).max(1000000).optional(),
  discountPrice: Joi.number().min(0).optional().allow(null, ''),
  isFreeCourse: Joi.boolean().optional(),

  subscriptionPlans: Joi.object({
    monthly: Joi.object({
      enabled: Joi.boolean(),
      price: Joi.number().min(0),
      permanentUnlockAfterMonths: Joi.number().min(0).max(120)
    }).optional(),
    registrationFee: Joi.object({
      enabled: Joi.boolean(),
      amount: Joi.number().min(0)
    }).optional()
  }).optional(),

  requirements: Joi.array().items(safeString(200)).max(20).optional(),
  whatYouWillLearn: Joi.array().items(safeString(200)).max(30).optional(),
  targetAudience: Joi.array().items(safeString(200)).max(10).optional(),
  tags: Joi.array().items(safeString(50)).max(20).optional(),
  instructorId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),

  certificateSettings: Joi.object({
    autoIssue: Joi.boolean(),
    minimumScore: Joi.number().min(0).max(100),
    requireAllLectures: Joi.boolean(),
    customMessage: safeString(500).allow(''),
    expiryMonths: Joi.number().min(0),
    showInstructorSignature: Joi.boolean()
  }).optional()
});

// ✅ Section schema
export const addSectionSchema = Joi.object({
  sectionTitle: safeString(200)
    .required()
    .messages({
      'any.required': 'Section title is required'
    }),
  sectionDescription: safeString(500)
    .optional()
    .allow('')
});

// ✅ Course query schema
export const courseQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(12),
  search: Joi.string().trim().max(100).optional().allow(''),
  category: Joi.string().trim().max(100).optional().allow(''),
  level: Joi.string()
    .valid('beginner', 'intermediate', 'advanced', 'all-levels', 'all', '')
    .optional(),
  price: Joi.string().valid('free', 'paid', 'all', '').optional(),
  sort: Joi.string()
    .valid('newest', 'oldest', 'price-low', 'price-high', 'rating', 'popular')
    .default('newest'),
  instructor: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
});

// ✅ Export validate middlewares
export const validateCreateCourse = validate(createCourseSchema);
export const validateUpdateCourse = validate(updateCourseSchema);
export const validateAddSection = validate(addSectionSchema);
export const validateCourseQuery = validate(courseQuerySchema, 'query');