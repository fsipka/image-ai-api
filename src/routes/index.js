const express = require('express');
const authRoutes = require('./auth');
const userRoutes = require('./user');
const generateRoutes = require('./generate');
const paymentRoutes = require('./payment');
const adminRoutes = require('./admin');
const ApiResponse = require('../utils/apiResponse');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  return ApiResponse.success(res, {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  }, 'API is healthy');
});

// API version info
router.get('/', (req, res) => {
  return ApiResponse.success(res, {
    name: 'Mobile App API',
    version: '1.0.0',
    description: 'Complete Node.js Express API for mobile app with AI image generation',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      user: '/api/user',
      generate: '/api/generate',
      payment: '/api/payment',
      admin: '/api/admin',
    },
  }, 'Welcome to Mobile App API');
});

// Mount route modules
console.log('Mounting auth routes...');
router.use('/auth', authRoutes);
console.log('Auth routes mounted successfully');
router.use('/user', userRoutes);
router.use('/generate', generateRoutes);
router.use('/payment', paymentRoutes);
router.use('/admin', adminRoutes);

module.exports = router;