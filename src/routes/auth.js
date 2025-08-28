const express = require('express');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validate, registerSchema, loginSchema } = require('../utils/validators');
const Joi = require('joi');

const router = express.Router();

// Apply auth rate limiter to all routes in this router
router.use(authLimiter);

// Validation schemas for auth-specific endpoints
const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    'any.required': 'Refresh token is required',
  }),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    'any.required': 'Current password is required',
  }),
  newPassword: Joi.string().min(6).max(50).required().messages({
    'string.min': 'New password must be at least 6 characters long',
    'string.max': 'New password cannot exceed 50 characters',
    'any.required': 'New password is required',
  }),
});

const deleteAccountSchema = Joi.object({
  password: Joi.string().required().messages({
    'any.required': 'Password is required to delete account',
  }),
});

const googleSignInSchema = Joi.object({
  idToken: Joi.string().required().messages({
    'any.required': 'Google ID token is required',
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  firstName: Joi.string().required().messages({
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().optional().allow(''),
  googleId: Joi.string().required().messages({
    'any.required': 'Google ID is required',
  }),
  photo: Joi.string().uri().optional().allow(''),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
});

const resetPasswordSchema = Joi.object({
  code: Joi.string().length(6).required().messages({
    'string.length': 'Reset code must be 6 digits',
    'any.required': 'Reset code is required',
  }),
  password: Joi.string().min(6).max(50).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'string.max': 'Password cannot exceed 50 characters',
    'any.required': 'Password is required',
  }),
});

const emailVerificationSchema = Joi.object({
  email: Joi.string().email().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
});

const verifyEmailSchema = Joi.object({
  code: Joi.string().length(6).required().messages({
    'string.length': 'Verification code must be 6 digits',
    'any.required': 'Verification code is required',
  }),
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 * @body    { email, password, username, firstName, lastName, deviceId? }
 */
router.post('/register', validate(registerSchema), authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 * @body    { email, password, deviceId? }
 */
router.post('/login', validate(loginSchema), authController.login);

/**
 * @route   POST /api/auth/google
 * @desc    Sign in/up with Google
 * @access  Public
 * @body    { idToken, email, firstName, lastName, googleId, photo? }
 */
router.post('/google', validate(googleSignInSchema), authController.googleSignIn);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 * @body    { refreshToken }
 */
router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (invalidate refresh token)
 * @access  Private
 * @body    { refreshToken? }
 */
router.post('/logout', authenticateToken, authController.logout);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post('/logout-all', authenticateToken, authController.logoutAll);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticateToken, authController.getProfile);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify access token
 * @access  Private
 */
router.get('/verify', authenticateToken, authController.verifyToken);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 * @body    { currentPassword, newPassword }
 */
router.put('/change-password', 
  authenticateToken, 
  validate(changePasswordSchema), 
  authController.changePassword
);

/**
 * @route   DELETE /api/auth/account
 * @desc    Delete/deactivate user account
 * @access  Private
 * @body    { password }
 */
router.delete('/account', 
  authenticateToken, 
  validate(deleteAccountSchema), 
  authController.deleteAccount
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 * @body    { email }
 */
router.post('/forgot-password', 
  validate(forgotPasswordSchema), 
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 * @body    { token, password }
 */
router.post('/reset-password', 
  validate(resetPasswordSchema), 
  authController.resetPassword
);

/**
 * @route   POST /api/auth/send-verification
 * @desc    Send email verification code
 * @access  Public
 * @body    { email }
 */
router.post('/send-verification', 
  validate(emailVerificationSchema), 
  authController.requestEmailVerificationCode
);

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email with 6-digit code
 * @access  Public
 * @body    { code }
 */
router.post('/verify-email', 
  validate(verifyEmailSchema), 
  authController.verifyEmail
);

/**
 * @route   POST /api/auth/resend-password-reset
 * @desc    Resend password reset code
 * @access  Public
 * @body    { email }
 */
router.post('/resend-password-reset', 
  validate(forgotPasswordSchema), 
  authController.resendPasswordResetCode
);

module.exports = router;