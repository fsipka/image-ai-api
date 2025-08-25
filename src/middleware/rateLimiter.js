const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const config = require('../config');
const { logger } = require('../utils/logger');
const ApiResponse = require('../utils/apiResponse');

// General rate limiter
const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    ApiResponse.tooManyRequestsError(res, 'Too many requests, please try again later');
  },
});

// Strict limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    ApiResponse.tooManyRequestsError(res, 'Too many authentication attempts, please try again in 15 minutes');
  },
});

// Generation rate limiter (more restrictive)
const generationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 5 generations per minute
  message: {
    success: false,
    message: 'Too many generation requests, please slow down',
    retryAfter: 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    return req.user ? req.user._id.toString() : req.ip;
  },
  handler: (req, res) => {
    logger.warn(`Generation rate limit exceeded for ${req.user ? `user: ${req.user._id}` : `IP: ${req.ip}`}`);
    ApiResponse.tooManyRequestsError(res, 'Too many generation requests, please wait before trying again');
  },
});

// Payment rate limiter
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 payment attempts per 5 minutes
  message: {
    success: false,
    message: 'Too many payment attempts, please try again later',
    retryAfter: 5 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user._id.toString() : req.ip;
  },
  handler: (req, res) => {
    logger.warn(`Payment rate limit exceeded for ${req.user ? `user: ${req.user._id}` : `IP: ${req.ip}`}`);
    ApiResponse.tooManyRequestsError(res, 'Too many payment attempts, please try again later');
  },
});

// Admin endpoints rate limiter
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes for admin
  message: {
    success: false,
    message: 'Too many admin requests, please try again later',
    retryAfter: 15 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user ? req.user._id.toString() : req.ip;
  },
  handler: (req, res) => {
    logger.warn(`Admin rate limit exceeded for ${req.user ? `user: ${req.user._id}` : `IP: ${req.ip}`}`);
    ApiResponse.tooManyRequestsError(res, 'Too many admin requests, please try again later');
  },
});

// Speed limiter (progressively slow down requests)
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 10, // Allow 10 requests per window at full speed
  delayMs: 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
  onLimitReached: (req, res) => {
    logger.warn(`Speed limit reached for IP: ${req.ip}`);
  },
});

// Flexible rate limiter for different user types
const flexibleLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000,
    freeMax: 10,
    premiumMax: 100,
    adminMax: 1000,
  };

  const settings = { ...defaultOptions, ...options };

  return rateLimit({
    windowMs: settings.windowMs,
    max: (req) => {
      if (!req.user) return settings.freeMax;
      
      if (req.user.role === 'admin') return settings.adminMax;
      if (req.user.isPremiumActive) return settings.premiumMax;
      
      return settings.freeMax;
    },
    message: {
      success: false,
      message: 'Rate limit exceeded for your account type',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user ? req.user._id.toString() : req.ip;
    },
    handler: (req, res) => {
      const userType = req.user ? 
        (req.user.role === 'admin' ? 'admin' : req.user.isPremiumActive ? 'premium' : 'free') 
        : 'anonymous';
      
      logger.warn(`Flexible rate limit exceeded for ${userType} user: ${req.user ? req.user._id : req.ip}`);
      ApiResponse.tooManyRequestsError(res, `Rate limit exceeded for ${userType} account`);
    },
  });
};

// Create rate limiter for different endpoints
const createRateLimiter = (type, customOptions = {}) => {
  const limiters = {
    general: generalLimiter,
    auth: authLimiter,
    generation: generationLimiter,
    payment: paymentLimiter,
    admin: adminLimiter,
    flexible: flexibleLimiter(customOptions),
  };

  return limiters[type] || generalLimiter;
};

module.exports = {
  generalLimiter,
  authLimiter,
  generationLimiter,
  paymentLimiter,
  adminLimiter,
  speedLimiter,
  flexibleLimiter,
  createRateLimiter,
};