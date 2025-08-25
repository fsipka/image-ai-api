const Joi = require('joi');

// User validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().min(6).max(50).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'string.max': 'Password cannot exceed 50 characters',
    'any.required': 'Password is required',
  }),
  username: Joi.string().alphanum().min(3).max(20).required().messages({
    'string.alphanum': 'Username can only contain alphanumeric characters',
    'string.min': 'Username must be at least 3 characters long',
    'string.max': 'Username cannot exceed 20 characters',
    'any.required': 'Username is required',
  }),
  firstName: Joi.string().min(2).max(50).required().messages({
    'string.min': 'First name must be at least 2 characters long',
    'string.max': 'First name cannot exceed 50 characters',
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().min(2).max(50).required().messages({
    'string.min': 'Last name must be at least 2 characters long',
    'string.max': 'Last name cannot exceed 50 characters',
    'any.required': 'Last name is required',
  }),
  deviceId: Joi.string().optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
  deviceId: Joi.string().optional(),
});

const updateProfileSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).optional(),
  lastName: Joi.string().min(2).max(50).optional(),
  username: Joi.string().alphanum().min(3).max(20).optional(),
});

// Generation validation schemas
const createGenerationSchema = Joi.object({
  prompt: Joi.string().min(5).max(1000).required().messages({
    'string.min': 'Prompt must be at least 5 characters long',
    'string.max': 'Prompt cannot exceed 1000 characters',
    'any.required': 'Prompt is required',
  }),
  modelUsed: Joi.string().valid('fal-ai', 'custom-model-1', 'custom-model-2').default('fal-ai'),
  parameters: Joi.object({
    strength: Joi.number().min(0).max(1).default(0.8),
    guidance_scale: Joi.number().min(1).max(20).default(7.5),
    num_inference_steps: Joi.number().integer().min(10).max(100).default(50),
    seed: Joi.number().integer().optional(),
    width: Joi.number().integer().min(256).max(2048).default(512),
    height: Joi.number().integer().min(256).max(2048).default(512),
  }).default({}),
});

// Payment validation schemas
const createPaymentIntentSchema = Joi.object({
  packageId: Joi.string().required().messages({
    'any.required': 'Package ID is required',
  }),
  paymentMethodId: Joi.string().optional(),
});

// Ad watch validation schemas
const adWatchCompletedSchema = Joi.object({
  adId: Joi.string().required().messages({
    'any.required': 'Ad ID is required',
  }),
  watchDurationMs: Joi.number().integer().min(0).required().messages({
    'number.min': 'Watch duration must be non-negative',
    'any.required': 'Watch duration is required',
  }),
  adProvider: Joi.string().valid('admob', 'facebook', 'unity', 'custom').default('admob'),
});

// Admin validation schemas
const addCreditsSchema = Joi.object({
  credits: Joi.number().integer().min(1).max(1000).required().messages({
    'number.min': 'Credits must be at least 1',
    'number.max': 'Cannot add more than 1000 credits at once',
    'any.required': 'Credits amount is required',
  }),
  reason: Joi.string().max(200).optional(),
});

// Common validation schemas
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
});

const objectIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
  'string.pattern.base': 'Invalid ID format',
  'any.required': 'ID is required',
});

// Validation middleware
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages,
      });
    }

    req.body = value;
    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Query validation failed',
        errors: errorMessages,
      });
    }

    req.query = value;
    next();
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      return res.status(400).json({
        success: false,
        message: 'Parameter validation failed',
        errors: errorMessages,
      });
    }

    req.params = value;
    next();
  };
};

module.exports = {
  // Schemas
  registerSchema,
  loginSchema,
  updateProfileSchema,
  createGenerationSchema,
  createPaymentIntentSchema,
  adWatchCompletedSchema,
  addCreditsSchema,
  paginationSchema,
  objectIdSchema,
  
  // Middleware
  validate,
  validateQuery,
  validateParams,
};