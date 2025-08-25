const { logger } = require('../utils/logger');
const ApiResponse = require('../utils/apiResponse');
const config = require('../config');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error(err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    return ApiResponse.notFoundError(res, message);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    return ApiResponse.conflictError(res, message);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(val => ({
      field: val.path,
      message: val.message,
    }));
    return ApiResponse.validationError(res, errors);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.unauthorizedError(res, 'Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    return ApiResponse.unauthorizedError(res, 'Token expired');
  }

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return ApiResponse.validationError(res, [{ 
      field: 'file', 
      message: 'File size too large' 
    }]);
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return ApiResponse.validationError(res, [{ 
      field: 'file', 
      message: 'Unexpected file field' 
    }]);
  }

  // Stripe errors
  if (err.type && err.type.includes('Stripe')) {
    return ApiResponse.error(res, 'Payment processing error', 400);
  }

  // Rate limiting errors
  if (err.status === 429) {
    return ApiResponse.tooManyRequestsError(res, 'Too many requests, please try again later');
  }

  // Default to server error
  const message = config.nodeEnv === 'production' 
    ? 'Internal server error' 
    : error.message;

  return ApiResponse.serverError(res, message);
};

const notFound = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.status = 404;
  next(error);
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  errorHandler,
  notFound,
  asyncHandler,
};