const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { adminLimiter } = require('../middleware/rateLimiter');
const { validate, validateQuery, validateParams, addCreditsSchema, objectIdSchema } = require('../utils/validators');
const Joi = require('joi');

const router = express.Router();

// Apply auth and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Apply admin rate limiting
router.use(adminLimiter);

// Validation schemas
const userQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().min(1).max(100).optional(),
  role: Joi.string().valid('user', 'admin').optional(),
  isPremium: Joi.string().valid('true', 'false').optional(),
  isActive: Joi.string().valid('true', 'false').optional(),
  sortBy: Joi.string().valid('createdAt', 'lastLogin', 'credits', 'email', 'username').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const updateUserSchema = Joi.object({
  firstName: Joi.string().min(2).max(50).optional(),
  lastName: Joi.string().min(2).max(50).optional(),
  username: Joi.string().alphanum().min(3).max(20).optional(),
  role: Joi.string().valid('user', 'admin').optional(),
  isPremium: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
});

const toggleUserStatusSchema = Joi.object({
  isActive: Joi.boolean().required().messages({
    'any.required': 'isActive status is required',
  }),
});

const generationQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional(),
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  sortBy: Joi.string().valid('createdAt', 'status', 'creditsUsed', 'processingTimeMs').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const transactionQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  type: Joi.string().valid('credit_purchase', 'ad_watch', 'premium_subscription', 'refund', 'bonus').optional(),
  status: Joi.string().valid('pending', 'completed', 'failed', 'refunded').optional(),
  userId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  sortBy: Joi.string().valid('createdAt', 'amount', 'status', 'type').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const statsQuerySchema = Joi.object({
  days: Joi.number().integer().min(1).max(365).default(30),
});

const revenueStatsQuerySchema = Joi.object({
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional(),
  groupBy: Joi.string().valid('hour', 'day', 'month').default('day'),
});

/**
 * @route   GET /api/admin/stats
 * @desc    Get comprehensive app statistics
 * @access  Admin
 * @query   { days? }
 */
router.get('/stats',
  validateQuery(statsQuerySchema),
  adminController.getAppStats
);

/**
 * @route   GET /api/admin/users
 * @desc    Get paginated list of users with filters
 * @access  Admin
 * @query   { page?, limit?, search?, role?, isPremium?, isActive?, sortBy?, sortOrder? }
 */
router.get('/users',
  validateQuery(userQuerySchema),
  adminController.getUsers
);

/**
 * @route   GET /api/admin/users/:userId
 * @desc    Get detailed user information
 * @access  Admin
 * @params  { userId }
 */
router.get('/users/:userId',
  validateParams(Joi.object({ userId: objectIdSchema })),
  adminController.getUserDetails
);

/**
 * @route   PUT /api/admin/users/:userId
 * @desc    Update user information
 * @access  Admin
 * @params  { userId }
 * @body    { firstName?, lastName?, username?, role?, isPremium?, isActive? }
 */
router.put('/users/:userId',
  validateParams(Joi.object({ userId: objectIdSchema })),
  validate(updateUserSchema),
  adminController.updateUser
);

/**
 * @route   POST /api/admin/users/:userId/credits
 * @desc    Add credits to user account
 * @access  Admin
 * @params  { userId }
 * @body    { credits, reason? }
 */
router.post('/users/:userId/credits',
  validateParams(Joi.object({ userId: objectIdSchema })),
  validate(addCreditsSchema),
  adminController.addCreditsToUser
);

/**
 * @route   PATCH /api/admin/users/:userId/status
 * @desc    Toggle user active status
 * @access  Admin
 * @params  { userId }
 * @body    { isActive }
 */
router.patch('/users/:userId/status',
  validateParams(Joi.object({ userId: objectIdSchema })),
  validate(toggleUserStatusSchema),
  adminController.toggleUserStatus
);

/**
 * @route   GET /api/admin/generations
 * @desc    Get paginated list of generations
 * @access  Admin
 * @query   { page?, limit?, status?, userId?, sortBy?, sortOrder? }
 */
router.get('/generations',
  validateQuery(generationQuerySchema),
  adminController.getGenerations
);

/**
 * @route   DELETE /api/admin/generations/:generationId
 * @desc    Delete a generation
 * @access  Admin
 * @params  { generationId }
 */
router.delete('/generations/:generationId',
  validateParams(Joi.object({ generationId: objectIdSchema })),
  adminController.deleteGeneration
);

/**
 * @route   GET /api/admin/transactions
 * @desc    Get paginated list of transactions
 * @access  Admin
 * @query   { page?, limit?, type?, status?, userId?, sortBy?, sortOrder? }
 */
router.get('/transactions',
  validateQuery(transactionQuerySchema),
  adminController.getTransactions
);

/**
 * @route   GET /api/admin/revenue
 * @desc    Get revenue statistics and analytics
 * @access  Admin
 * @query   { startDate?, endDate?, groupBy? }
 */
router.get('/revenue',
  validateQuery(revenueStatsQuerySchema),
  adminController.getRevenueStats
);

module.exports = router;