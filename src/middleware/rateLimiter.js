const rateLimit = require('express-rate-limit');
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
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 attempts per window
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    retryAfter: 5 * 60,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    ApiResponse.tooManyRequestsError(res, 'Too many authentication attempts, please try again in 5 minutes');
  },
});

// Generation rate limiter (more restrictive)
const generationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 generations per minute
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
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 payment attempts per minute
  message: {
    success: false,
    message: 'Too many payment attempts, please try again later',
    retryAfter: 60,
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

// Flexible rate limiter for different user types
const flexibleLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000,
    freeMax: 500,
    premiumMax: 1000,
    adminMax: 5000,
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
  flexibleLimiter,
  createRateLimiter,
};