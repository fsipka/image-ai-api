const morgan = require('morgan');
const { logger } = require('../utils/logger');

// Custom token for user ID
morgan.token('user-id', (req) => {
  return req.user ? req.user._id.toString() : 'anonymous';
});

// Custom token for request body (sanitized)
morgan.token('body', (req) => {
  const sanitizedBody = { ...req.body };
  
  // Remove sensitive fields
  delete sanitizedBody.password;
  delete sanitizedBody.confirmPassword;
  delete sanitizedBody.token;
  delete sanitizedBody.refreshToken;
  
  return JSON.stringify(sanitizedBody);
});

// Custom token for response time in seconds
morgan.token('response-time-sec', (req, res) => {
  const responseTime = morgan['response-time'](req, res);
  return responseTime ? `${(parseFloat(responseTime) / 1000).toFixed(3)}s` : '-';
});

// Development logging format
const developmentFormat = ':method :url :status :response-time ms - :res[content-length] bytes - User: :user-id';

// Production logging format
const productionFormat = JSON.stringify({
  timestamp: ':date[iso]',
  method: ':method',
  url: ':url',
  status: ':status',
  responseTime: ':response-time-sec',
  contentLength: ':res[content-length]',
  userAgent: ':user-agent',
  userId: ':user-id',
  ip: ':remote-addr',
});

// Request logging middleware
const requestLogger = morgan(
  process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  {
    stream: {
      write: (message) => {
        logger.info(message.trim());
      },
    },
    skip: (req, res) => {
      // Skip health check endpoints
      return req.url === '/health' || req.url === '/api/health';
    },
  }
);

// Error logging middleware
const errorLogger = morgan(
  process.env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  {
    stream: {
      write: (message) => {
        logger.error(message.trim());
      },
    },
    skip: (req, res) => {
      // Only log errors (4xx and 5xx status codes)
      return res.statusCode < 400;
    },
  }
);

// API Analytics middleware
const analyticsLogger = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    const analyticsData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      endpoint: req.route ? req.route.path : req.url,
      statusCode: res.statusCode,
      duration,
      userId: req.user ? req.user._id.toString() : null,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      credits: req.user ? req.user.credits : null,
      isPremium: req.user ? req.user.isPremiumActive : false,
    };
    
    // Log different levels based on status code
    if (res.statusCode >= 500) {
      logger.error('API Error', analyticsData);
    } else if (res.statusCode >= 400) {
      logger.warn('API Client Error', analyticsData);
    } else {
      logger.info('API Success', analyticsData);
    }
  });
  
  next();
};

// Request ID middleware
const requestId = (req, res, next) => {
  req.requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  res.set('X-Request-ID', req.requestId);
  next();
};

// Security logging middleware
const securityLogger = (req, res, next) => {
  // Log potential security issues
  const securityEvents = [];
  
  // Check for suspicious patterns
  if (req.body && typeof req.body === 'string' && req.body.includes('<script>')) {
    securityEvents.push('Potential XSS attempt');
  }
  
  if (req.query && JSON.stringify(req.query).includes('..')) {
    securityEvents.push('Potential path traversal attempt');
  }
  
  if (req.get('User-Agent') && req.get('User-Agent').includes('bot')) {
    securityEvents.push('Bot user agent detected');
  }
  
  if (securityEvents.length > 0) {
    logger.warn('Security Event Detected', {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      events: securityEvents,
      userId: req.user ? req.user._id.toString() : null,
    });
  }
  
  next();
};

module.exports = {
  requestLogger,
  errorLogger,
  analyticsLogger,
  requestId,
  securityLogger,
};