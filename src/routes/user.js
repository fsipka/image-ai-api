const express = require('express');
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const { uploadProfilePicture } = require('../middleware/upload');
const { validate, validateQuery, updateProfileSchema, paginationSchema } = require('../utils/validators');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authenticateToken);

// Apply general rate limiting
router.use(generalLimiter);

/**
 * @route   GET /api/user/profile
 * @desc    Get current user profile with stats
 * @access  Private
 */
router.get('/profile', userController.getProfile);

/**
 * @route   PUT /api/user/profile
 * @desc    Update user profile
 * @access  Private
 * @body    { firstName?, lastName?, username? }
 */
router.put('/profile', validate(updateProfileSchema), userController.updateProfile);

/**
 * @route   POST /api/user/profile-picture
 * @desc    Upload profile picture
 * @access  Private
 * @form    profilePicture (file)
 */
router.post('/profile-picture', uploadProfilePicture(), userController.uploadProfilePicture);

/**
 * @route   DELETE /api/user/profile-picture
 * @desc    Remove profile picture
 * @access  Private
 */
router.delete('/profile-picture', userController.removeProfilePicture);

/**
 * @route   GET /api/user/credits
 * @desc    Get user credits and recent transactions
 * @access  Private
 */
router.get('/credits', userController.getCredits);

/**
 * @route   GET /api/user/generations
 * @desc    Get user's generation history
 * @access  Private
 * @query   { page?, limit?, status? }
 */
router.get('/generations', 
  validateQuery(paginationSchema), 
  userController.getGenerationHistory
);

/**
 * @route   GET /api/user/transactions
 * @desc    Get user's transaction history
 * @access  Private
 * @query   { page?, limit?, type? }
 */
router.get('/transactions', 
  validateQuery(paginationSchema), 
  userController.getTransactionHistory
);

/**
 * @route   GET /api/user/dashboard
 * @desc    Get dashboard statistics
 * @access  Private
 */
router.get('/dashboard', userController.getDashboardStats);

/**
 * @route   GET /api/user/notifications
 * @desc    Get user notifications
 * @access  Private
 */
router.get('/notifications', userController.getNotifications);

module.exports = router;