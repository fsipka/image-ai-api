const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const { validateImageFile } = require('../utils/upload');
const ApiResponse = require('../utils/apiResponse');

// Memory storage for processing before cloud upload
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  if (!config.upload.allowedTypes.includes(file.mimetype)) {
    const error = new Error(`File type ${file.mimetype} not allowed. Allowed types: ${config.upload.allowedTypes.join(', ')}`);
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }

  cb(null, true);
};

// Basic multer configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize,
    files: 1, // Only allow 1 file at a time
  },
});

// Single file upload middleware
const uploadSingle = (fieldName = 'image') => {
  return (req, res, next) => {
    const uploadMiddleware = upload.single(fieldName);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return ApiResponse.validationError(res, [{
            field: fieldName,
            message: `File size exceeds limit of ${Math.round(config.upload.maxFileSize / (1024 * 1024))}MB`,
          }]);
        }

        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return ApiResponse.validationError(res, [{
            field: fieldName,
            message: 'Unexpected file field',
          }]);
        }

        if (err.code === 'INVALID_FILE_TYPE') {
          return ApiResponse.validationError(res, [{
            field: fieldName,
            message: err.message,
          }]);
        }

        return ApiResponse.serverError(res, 'File upload failed');
      }

      // Validate the uploaded file
      if (req.file) {
        const validation = validateImageFile(req.file);
        if (!validation.isValid) {
          return ApiResponse.validationError(res, validation.errors.map(error => ({
            field: fieldName,
            message: error,
          })));
        }
      }

      next();
    });
  };
};

// Multiple files upload middleware
const uploadMultiple = (fieldName = 'images', maxCount = 5) => {
  return (req, res, next) => {
    const uploadMiddleware = upload.array(fieldName, maxCount);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return ApiResponse.validationError(res, [{
            field: fieldName,
            message: `File size exceeds limit of ${Math.round(config.upload.maxFileSize / (1024 * 1024))}MB`,
          }]);
        }

        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return ApiResponse.validationError(res, [{
            field: fieldName,
            message: `Too many files. Maximum ${maxCount} files allowed`,
          }]);
        }

        if (err.code === 'INVALID_FILE_TYPE') {
          return ApiResponse.validationError(res, [{
            field: fieldName,
            message: err.message,
          }]);
        }

        return ApiResponse.serverError(res, 'File upload failed');
      }

      // Validate all uploaded files
      if (req.files && req.files.length > 0) {
        const errors = [];
        
        req.files.forEach((file, index) => {
          const validation = validateImageFile(file);
          if (!validation.isValid) {
            validation.errors.forEach(error => {
              errors.push({
                field: `${fieldName}[${index}]`,
                message: error,
              });
            });
          }
        });

        if (errors.length > 0) {
          return ApiResponse.validationError(res, errors);
        }
      }

      next();
    });
  };
};

// Middleware to require file upload
const requireFile = (fieldName = 'image') => {
  return (req, res, next) => {
    if (!req.file) {
      return ApiResponse.validationError(res, [{
        field: fieldName,
        message: 'File is required',
      }]);
    }
    next();
  };
};

// Middleware to require multiple files
const requireFiles = (fieldName = 'images', minCount = 1) => {
  return (req, res, next) => {
    if (!req.files || req.files.length < minCount) {
      return ApiResponse.validationError(res, [{
        field: fieldName,
        message: `At least ${minCount} file(s) required`,
      }]);
    }
    next();
  };
};

// Profile picture upload middleware with specific constraints
const uploadProfilePicture = () => {
  const profileStorage = multer.memoryStorage();
  
  const profileUpload = multer({
    storage: profileStorage,
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        return cb(new Error('Only JPEG, PNG, and WebP images are allowed for profile pictures'), false);
      }
      cb(null, true);
    },
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit for profile pictures
      files: 1,
    },
  });

  return (req, res, next) => {
    const uploadMiddleware = profileUpload.single('profilePicture');
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return ApiResponse.validationError(res, [{
            field: 'profilePicture',
            message: 'Profile picture size exceeds 5MB limit',
          }]);
        }

        return ApiResponse.validationError(res, [{
          field: 'profilePicture',
          message: err.message,
        }]);
      }

      next();
    });
  };
};

// Error handling for multer errors
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return ApiResponse.validationError(res, [{
        field: 'file',
        message: 'File size too large',
      }]);
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return ApiResponse.validationError(res, [{
        field: 'files',
        message: 'Too many files uploaded',
      }]);
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return ApiResponse.validationError(res, [{
        field: 'file',
        message: 'Unexpected file field',
      }]);
    }

    return ApiResponse.validationError(res, [{
      field: 'file',
      message: err.message,
    }]);
  }

  next(err);
};

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  requireFile,
  requireFiles,
  uploadProfilePicture,
  handleUploadErrors,
};