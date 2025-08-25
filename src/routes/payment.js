const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');
const { paymentLimiter, generalLimiter } = require('../middleware/rateLimiter');
const { validate, validateQuery, createPaymentIntentSchema, paginationSchema } = require('../utils/validators');
const Joi = require('joi');

const router = express.Router();

// Validation schemas
const confirmPaymentSchema = Joi.object({
  paymentIntentId: Joi.string().required().messages({
    'any.required': 'Payment intent ID is required',
  }),
});

const refundRequestSchema = Joi.object({
  transactionId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    'string.pattern.base': 'Invalid transaction ID format',
    'any.required': 'Transaction ID is required',
  }),
  reason: Joi.string().max(500).optional().messages({
    'string.max': 'Reason cannot exceed 500 characters',
  }),
});

/**
 * @route   GET /api/payment/packages
 * @desc    Get available credit packages
 * @access  Public
 */
router.get('/packages', generalLimiter, paymentController.getCreditPackages);

/**
 * @route   POST /api/payment/create-payment-intent
 * @desc    Create Stripe payment intent
 * @access  Private
 * @body    { packageId, paymentMethodId? }
 */
router.post('/create-payment-intent',
  authenticateToken,
  paymentLimiter,
  validate(createPaymentIntentSchema),
  paymentController.createPaymentIntent
);

/**
 * @route   POST /api/payment/confirm
 * @desc    Confirm payment completion
 * @access  Private
 * @body    { paymentIntentId }
 */
router.post('/confirm',
  authenticateToken,
  paymentLimiter,
  validate(confirmPaymentSchema),
  paymentController.confirmPayment
);

/**
 * @route   POST /api/payment/webhook
 * @desc    Stripe webhook endpoint
 * @access  Public (Stripe)
 */
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  paymentController.handleStripeWebhook
);

/**
 * @route   GET /api/payment/history
 * @desc    Get user's payment history
 * @access  Private
 * @query   { page?, limit? }
 */
router.get('/history',
  authenticateToken,
  generalLimiter,
  validateQuery(paginationSchema),
  paymentController.getPaymentHistory
);

/**
 * @route   POST /api/payment/refund
 * @desc    Request payment refund
 * @access  Private
 * @body    { transactionId, reason? }
 */
router.post('/refund',
  authenticateToken,
  paymentLimiter,
  validate(refundRequestSchema),
  paymentController.refundPayment
);

module.exports = router;