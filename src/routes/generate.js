const express = require('express');
const generationController = require('../controllers/generationController');
const { authenticateToken, requireCredits } = require('../middleware/auth');
const { generationLimiter } = require('../middleware/rateLimiter');
const { uploadSingle, requireFile } = require('../middleware/upload');
const { validate, validateQuery, validateParams, createGenerationSchema, paginationSchema, objectIdSchema } = require('../utils/validators');
const Joi = require('joi');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Validation schemas - Updated for new mobile app format
const generationBodySchema = Joi.object({
  // Optional reference image URL (for image-to-image generations)
  inputImageUrl: Joi.string().uri().optional().allow(null, '').messages({
    'string.uri': 'Input image URL must be a valid URL',
  }),
  
  // Parameters object containing all generation settings
  parameters: Joi.object({
    prompt: Joi.string().min(5).max(1000).required().messages({
      'string.min': 'Prompt must be at least 5 characters long',
      'string.max': 'Prompt cannot exceed 1000 characters',
      'any.required': 'Prompt is required',
    }),
    imageCount: Joi.number().integer().min(1).max(4).default(1),
  }).required(),
});

const historyQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(10),
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional(),
  modelUsed: Joi.string().valid('fal-ai', 'fal-ai/flux-pro/kontext', 'custom-model-1', 'custom-model-2').optional(),
});

/**
 * @route   POST /api/generate/upload
 * @desc    Upload reference image for generation
 * @access  Private
 * @form    image (file)
 */
router.post('/upload',
  uploadSingle('image'),
  requireFile('image'),
  generationController.uploadReferenceImage
);

/**
 * @route   POST /api/generate/create
 * @desc    Create new AI generation request
 * @access  Private
 * @body    { inputImageUrl?, parameters: { prompt, imageCount?, style?, quality?, ... } }
 */
router.post('/create',
  generationLimiter, // Apply rate limiting only to generation creation
  // Note: Credit requirement is now dynamic based on imageCount, checked in controller
  validate(generationBodySchema),
  generationController.createGeneration
);

/**
 * @route   GET /api/generate/:id
 * @desc    Get specific generation by ID
 * @access  Private
 * @params  { id }
 */
router.get('/:id',
  validateParams(Joi.object({ id: objectIdSchema })),
  generationController.getGeneration
);

/**
 * @route   GET /api/generate
 * @desc    Get user's generation history
 * @access  Private
 * @query   { page?, limit?, status?, modelUsed? }
 */
router.get('/',
  validateQuery(historyQuerySchema),
  generationController.getGenerationHistory
);

/**
 * @route   POST /api/generate/:id/retry
 * @desc    Retry failed generation
 * @access  Private
 * @params  { id }
 */
router.post('/:id/retry',
  generationLimiter, // Apply rate limiting to retry as well since it creates new generation
  validateParams(Joi.object({ id: objectIdSchema })),
  requireCredits(1),
  generationController.retryGeneration
);

/**
 * @route   DELETE /api/generate/:id/cancel
 * @desc    Cancel pending/processing generation
 * @access  Private
 * @params  { id }
 */
router.delete('/:id/cancel',
  validateParams(Joi.object({ id: objectIdSchema })),
  generationController.cancelGeneration
);

/**
 * @route   DELETE /api/generate/:id
 * @desc    Delete generation permanently
 * @access  Private
 * @params  { id }
 */
router.delete('/:id',
  validateParams(Joi.object({ id: objectIdSchema })),
  generationController.deleteGeneration
);

/**
 * @route   GET /api/generate/stats/overview
 * @desc    Get user's generation statistics
 * @access  Private
 */
router.get('/stats/overview', generationController.getGenerationStats);

module.exports = router;