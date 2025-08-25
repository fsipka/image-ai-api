require('express-async-errors');
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');

// Import configurations and utilities
const config = require('./config');
const connectDB = require('./config/database');
const { logger } = require('./utils/logger');

// Import middleware
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { requestLogger, requestId, securityLogger } = require('./middleware/logging');
const { generalLimiter } = require('./middleware/rateLimiter');

// Import routes
const routes = require('./routes');

const app = express();

// Trust proxy (for accurate IP addresses behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://yourapp.com',
      'https://www.yourapp.com',
    ];
    
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID', 'X-Device-Info'],
}));

// Compression middleware
app.use(compression());

// Request ID middleware (add unique ID to each request)
app.use(requestId);

// Security logging
app.use(securityLogger);

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Store raw body for Stripe webhook verification
    if (req.path === '/api/payment/webhook') {
      req.rawBody = buf;
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize user input against NoSQL injection attacks
app.use(mongoSanitize());

// Request logging  
app.use(requestLogger);

// Debug middleware - log all requests
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.url} from ${req.ip}`);
  next();
});

// Rate limiting
app.use(generalLimiter);

// Debug routes loading
console.log('Loading routes...');

// API routes
app.use('/api', routes);

console.log('Routes loaded successfully');

// Health check endpoint (without rate limiting)
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API documentation placeholder
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'API Documentation',
    endpoints: {
      'POST /api/auth/register': 'Register a new user',
      'POST /api/auth/login': 'Login user',
      'POST /api/auth/refresh': 'Refresh access token',
      'POST /api/auth/logout': 'Logout user',
      'GET /api/user/profile': 'Get user profile',
      'PUT /api/user/profile': 'Update user profile',
      'POST /api/generate/upload': 'Upload reference image',
      'POST /api/generate/create': 'Create AI generation',
      'GET /api/generate/:id': 'Get generation by ID',
      'POST /api/payment/create-payment-intent': 'Create payment intent',
      'GET /api/admin/stats': 'Get app statistics (admin only)',
      'GET /api/admin/users': 'Get users list (admin only)',
    },
    authentication: 'Bearer token required for most endpoints',
    rateLimit: 'Global rate limit applied to all endpoints',
  });
});

// 404 handler for undefined routes
app.use(notFound);

// Global error handler
app.use(errorHandler);

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database connection
    mongoose.connection.close(false, () => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    const PORT = config.port || 3000;
    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} in ${config.nodeEnv} mode`);
      logger.info(`API Health Check: http://localhost:${PORT}/health`);
      logger.info(`API Documentation: http://localhost:${PORT}/api/docs`);
    });

    // Store server reference for graceful shutdown
    global.server = server;
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;