import Joi from 'joi';

export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data =
      source === 'body'   ? req.body
      : source === 'params' ? req.params
      : req.query;

    const { error, value } = schema.validate(data, {
      abortEarly:   false,
      stripUnknown: true,
      convert:      true,
    });

    if (error) {
      const messages = error.details.map((d) =>
        d.message.replace(/"/g, "'")
      );
      return res.status(400).json({
        success: false,
        message: messages[0],
        errors:  messages,
      });
    }

    if (source === 'body') {
      req.body = value;
    } else if (source === 'params') {
      try { req.params = value; } catch (e) {}
    }

    next();
  };
};

export const registerSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50)
    .pattern(/^[a-zA-Z\s'-]+$/).required()
    .messages({
      'string.pattern.base': 'First name can only contain letters',
      'string.min':   'First name must be at least 2 characters',
      'string.max':   'First name cannot exceed 50 characters',
      'string.empty': 'First name is required',
      'any.required': 'First name is required',
    }),
  lastName: Joi.string().trim().min(2).max(50)
    .pattern(/^[a-zA-Z\s'-]+$/).required()
    .messages({
      'string.pattern.base': 'Last name can only contain letters',
      'string.min':   'Last name must be at least 2 characters',
      'string.max':   'Last name cannot exceed 50 characters',
      'string.empty': 'Last name is required',
      'any.required': 'Last name is required',
    }),
  email: Joi.string().trim().lowercase().max(100)
    .pattern(/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/)
    .required()
    .messages({
      'string.empty':        'Email address is required',
      'string.max':          'Email address is too long',
      'string.pattern.base': 'Please provide a valid email address',
      'any.required':        'Email address is required',
    }),
  password: Joi.string().min(8).max(128).required()
    .messages({
      'string.empty': 'Password is required',
      'string.min':   'Password must be at least 8 characters',
      'string.max':   'Password is too long',
      'any.required': 'Password is required',
    }),
  phone: Joi.string().trim()
    .pattern(/^\+?[\d\s\-()]{7,15}$/)
    .optional().allow('')
    .messages({
      'string.pattern.base': 'Please provide a valid phone number',
    }),
  termsAccepted: Joi.boolean().valid(true).required()
    .messages({
      'any.only':     'You must accept the Terms of Service and Privacy Policy',
      'any.required': 'You must accept the Terms of Service and Privacy Policy',
      'boolean.base': 'Terms acceptance is required',
    }),
});

export const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().max(100).required()
    .messages({
      'string.empty': 'Email is required',
      'any.required': 'Email is required',
    }),
  password: Joi.string().min(1).max(128).required()
    .messages({
      'string.empty': 'Password is required',
      'any.required': 'Password is required',
    }),
  rememberMe: Joi.boolean().optional().default(false),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().lowercase().max(100)
    .pattern(/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/)
    .required()
    .messages({
      'string.empty':        'Email address is required',
      'string.pattern.base': 'Please provide a valid email address',
      'any.required':        'Email address is required',
    }),
});

export const resetPasswordSchema = Joi.object({
  password: Joi.string().min(8).max(128).required()
    .messages({
      'string.empty': 'Password is required',
      'string.min':   'Password must be at least 8 characters',
      'any.required': 'Password is required',
    }),
});

export const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50)
    .pattern(/^[a-zA-Z\s'-]+$/).optional()
    .messages({
      'string.min':          'First name must be at least 2 characters',
      'string.pattern.base': 'First name can only contain letters',
    }),
  lastName: Joi.string().trim().min(2).max(50)
    .pattern(/^[a-zA-Z\s'-]+$/).optional()
    .messages({
      'string.min':          'Last name must be at least 2 characters',
      'string.pattern.base': 'Last name can only contain letters',
    }),
  phone: Joi.string().trim()
    .pattern(/^\+?[\d\s\-()]{7,15}$/)
    .optional().allow('')
    .messages({
      'string.pattern.base': 'Please provide a valid phone number',
    }),
  bio: Joi.string().trim().max(500).optional().allow(''),
  address: Joi.object({
    street:  Joi.string().trim().max(100).optional().allow(''),
    city:    Joi.string().trim().max(50).optional().allow(''),
    state:   Joi.string().trim().max(50).optional().allow(''),
    country: Joi.string().trim().max(50).optional().allow(''),
    zipCode: Joi.string().trim().max(10).optional().allow(''),
  }).optional(),
  socialLinks: Joi.object({
    website:  Joi.string().uri().max(200).optional().allow(''),
    linkedin: Joi.string().uri().max(200).optional().allow(''),
    twitter:  Joi.string().uri().max(200).optional().allow(''),
    github:   Joi.string().uri().max(200).optional().allow(''),
  }).optional(),
  education: Joi.array().items(Joi.object({
    degree:      Joi.string().trim().max(100).optional().allow(''),
    institution: Joi.string().trim().max(100).optional().allow(''),
    year:        Joi.string().pattern(/^\d{4}$/).optional().allow(''),
  })).max(10).optional(),
});

export const updatePasswordSchema = Joi.object({
  currentPassword: Joi.string().max(128).optional().allow(''),
  newPassword: Joi.string().min(8).max(128).required()
    .messages({
      'string.empty': 'New password is required',
      'string.min':   'New password must be at least 8 characters',
      'any.required': 'New password is required',
    }),
});

// =============================================
// CREATE USER SCHEMA
// ✅ developer role HARDCODED - no variables
// =============================================
export const createUserSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).required()
    .messages({
      'string.empty': 'First name is required',
      'string.min':   'First name must be at least 2 characters',
      'any.required': 'First name is required',
    }),
  lastName: Joi.string().trim().min(2).max(50).required()
    .messages({
      'string.empty': 'Last name is required',
      'any.required': 'Last name is required',
    }),
  email: Joi.string().trim().lowercase().max(100)
    .pattern(/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/)
    .required()
    .messages({
      'string.empty':        'Email is required',
      'string.pattern.base': 'Please provide a valid email address',
      'any.required':        'Email is required',
    }),
  password: Joi.string().min(8).max(128).required()
    .messages({
      'string.empty': 'Password is required',
      'string.min':   'Password must be at least 8 characters',
      'any.required': 'Password is required',
    }),
  phone: Joi.string().trim()
    .pattern(/^\+?[\d\s\-()]{7,15}$/)
    .optional().allow(''),
  role: Joi.string()
    .valid('student', 'instructor', 'admin', 'developer')
    .default('student'),
});

// =============================================
// UPDATE USER SCHEMA
// ✅ developer role HARDCODED - no variables
// =============================================
export const updateUserSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).optional(),
  lastName:  Joi.string().trim().min(2).max(50).optional(),
  email: Joi.string().trim().lowercase().max(100)
    .pattern(/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Please provide a valid email address',
    }),
  phone: Joi.string().trim()
    .pattern(/^\+?[\d\s\-()]{7,15}$/)
    .optional().allow(''),
  role: Joi.string()
    .valid('student', 'instructor', 'admin', 'developer')
    .optional(),
  isActive: Joi.boolean().optional(),
  bio:      Joi.string().trim().max(500).optional().allow(''),
  address: Joi.object({
    street:  Joi.string().trim().max(100).optional().allow(''),
    city:    Joi.string().trim().max(50).optional().allow(''),
    state:   Joi.string().trim().max(50).optional().allow(''),
    country: Joi.string().trim().max(50).optional().allow(''),
    zipCode: Joi.string().trim().max(10).optional().allow(''),
  }).optional(),
});

// =============================================
// PAGINATION SCHEMA
// ✅ developer role HARDCODED - no variables
// =============================================
export const paginationSchema = Joi.object({
  page:   Joi.number().integer().min(1).default(1),
  limit:  Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).optional().allow(''),
  role:   Joi.string()
    .valid('all', 'student', 'instructor', 'admin', 'developer')
    .optional(),
  status: Joi.string().valid('all', 'active', 'inactive').optional(),
  sort:   Joi.string().valid('newest', 'oldest', 'name').optional(),
});
