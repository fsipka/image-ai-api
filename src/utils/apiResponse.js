class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    const response = {
      success: true,
      message,
      timestamp: new Date().toISOString(),
    };

    if (data !== null) {
      response.data = data;
    }

    return res.status(statusCode).json(response);
  }

  static error(res, message = 'An error occurred', statusCode = 500, errors = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  static validationError(res, errors, message = 'Validation failed') {
    return this.error(res, message, 400, errors);
  }

  static unauthorizedError(res, message = 'Unauthorized access') {
    return this.error(res, message, 401);
  }

  static forbiddenError(res, message = 'Access forbidden') {
    return this.error(res, message, 403);
  }

  static notFoundError(res, message = 'Resource not found') {
    return this.error(res, message, 404);
  }

  static conflictError(res, message = 'Resource conflict') {
    return this.error(res, message, 409);
  }

  static tooManyRequestsError(res, message = 'Too many requests') {
    return this.error(res, message, 429);
  }

  static serverError(res, message = 'Internal server error') {
    return this.error(res, message, 500);
  }

  static created(res, data = null, message = 'Resource created successfully') {
    return this.success(res, data, message, 201);
  }

  static updated(res, data = null, message = 'Resource updated successfully') {
    return this.success(res, data, message, 200);
  }

  static deleted(res, message = 'Resource deleted successfully') {
    return this.success(res, null, message, 200);
  }

  static paginated(res, data, pagination, message = 'Success') {
    const response = {
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        pages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrev: pagination.page > 1,
      },
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json(response);
  }
}

module.exports = ApiResponse;