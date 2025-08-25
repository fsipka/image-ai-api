const jwt = require('../utils/jwt');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return ApiResponse.unauthorizedError(res, 'Access token required');
    }

    const decoded = jwt.verifyAccessToken(token);
    const user = await User.findById(decoded.id).select('-password -refreshTokens');

    if (!user) {
      return ApiResponse.unauthorizedError(res, 'User not found');
    }

    if (!user.isActive) {
      return ApiResponse.unauthorizedError(res, 'Account is deactivated');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return ApiResponse.unauthorizedError(res, 'Invalid access token');
    } else if (error.name === 'TokenExpiredError') {
      return ApiResponse.unauthorizedError(res, 'Access token expired');
    }
    return ApiResponse.serverError(res, 'Authentication failed');
  }
};

const requirePremium = (req, res, next) => {
  if (!req.user) {
    return ApiResponse.unauthorizedError(res, 'Authentication required');
  }

  if (!req.user.isPremiumActive) {
    return ApiResponse.forbiddenError(res, 'Premium subscription required');
  }

  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return ApiResponse.unauthorizedError(res, 'Authentication required');
  }

  if (req.user.role !== 'admin') {
    return ApiResponse.forbiddenError(res, 'Admin access required');
  }

  next();
};

const requireCredits = (minimumCredits = 1) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.unauthorizedError(res, 'Authentication required');
    }

    // Premium users skip credit checks
    if (req.user.isPremiumActive) {
      return next();
    }

    if (req.user.credits < minimumCredits) {
      return ApiResponse.forbiddenError(res, 'Insufficient credits');
    }

    next();
  };
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verifyAccessToken(token);
      const user = await User.findById(decoded.id).select('-password -refreshTokens');
      
      if (user && user.isActive) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // For optional auth, we continue even if token is invalid
    next();
  }
};

module.exports = {
  authenticateToken,
  requirePremium,
  requireAdmin,
  requireCredits,
  optionalAuth,
};