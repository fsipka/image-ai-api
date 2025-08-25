const Generation = require('../models/Generation');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const { uploadImage, deleteImage } = require('../utils/upload');
const axios = require('axios');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { fal } = require('@fal-ai/client');
const config = require('../config');

// Configure fal.ai client
if (!config.fal.apiKey || config.fal.apiKey === 'your_fal_ai_api_key_here') {
  logger.warn('FAL AI API key not configured properly. Please set FAL_AI_API_KEY in environment variables.');
}

fal.config({
  credentials: config.fal.apiKey,
});

// Helper function for exponential backoff
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// FAL AI Flux Pro API call with retry mechanism
const callFalAI = async (prompt, imageUrl, parameters = {}, maxRetries = 3) => {
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      logger.info(`Calling fal.ai Flux Pro (attempt ${attempt + 1}/${maxRetries + 1}):`, {
        prompt,
        image_url: imageUrl,
        num_images: parameters.num_images || 1
      });

      const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
        input: {
          prompt: prompt,
          image_url: imageUrl,
          num_images: parameters.num_images || 1,
          // Add other parameters as needed
          guidance_scale: parameters.guidance_scale || 7.5,
          num_inference_steps: parameters.num_inference_steps || 25,
          seed: parameters.seed || null,
          width: parameters.width || 1024,
          height: parameters.height || 1024,
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') {
            update.logs.map((log) => log.message).forEach(message => {
              logger.info(`FAL AI Progress: ${message}`);
            });
          }
        },
      });

      logger.info('FAL AI result:', {
        requestId: result.requestId,
        dataKeys: Object.keys(result.data || {})
      });

      return result.data;
    } catch (error) {
      const isRateLimitError = error.message?.includes('429') || 
                              error.message?.includes('Too many requests') ||
                              error.message?.includes('rate limit');
      
      logger.error(`FAL AI API error (attempt ${attempt + 1}):`, {
        message: error.message,
        isRateLimitError,
        willRetry: attempt < maxRetries && isRateLimitError
      });

      // If it's a rate limit error and we have retries left, wait and retry
      if (isRateLimitError && attempt < maxRetries) {
        const backoffDelay = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // 1-2s, 2-3s, 4-5s
        logger.info(`Rate limit hit, waiting ${Math.round(backoffDelay)}ms before retry...`);
        await sleep(backoffDelay);
        attempt++;
        continue;
      }

      // If it's not a rate limit error or we're out of retries, throw the error
      if (isRateLimitError) {
        throw new Error('AI generation service is temporarily overloaded. Please try again in a few minutes.');
      } else {
        throw new Error('AI generation service unavailable: ' + (error.message || 'Unknown error'));
      }
    }
  }
};

// Download and upload image to S3
const downloadAndUploadToS3 = async (imageUrl, filename) => {
  try {
    if (!imageUrl) return null;
    
    logger.info(`Processing image for S3 upload: ${filename}`, { imageUrl });
    
    // Check if this is a local file path (mobile app sends these)
    if (imageUrl.startsWith('file://')) {
      logger.warn(`Received local file path, cannot download: ${imageUrl}`);
      return null; // Cannot process local file paths
    }
    
    // Download the image
    const axios = require('axios');
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    
    // Create a fake file object for uploadImage function
    const fakeFile = {
      buffer: buffer,
      mimetype: 'image/jpeg',
      originalname: filename
    };
    
    // Upload to S3
    const s3Url = await uploadImage(fakeFile, {
      processOptions: {
        width: 1024,
        height: 1024,
        quality: 90,
        format: 'jpeg',
      },
    });
    
    logger.info(`Image uploaded to S3: ${s3Url}`);
    return s3Url;
  } catch (error) {
    logger.error(`Failed to download and upload image ${filename}:`, error);
    
    // Don't fallback to original URL for local file paths
    if (imageUrl.startsWith('file://')) {
      logger.warn('Returning null for local file path that failed to process');
      return null;
    }
    
    return imageUrl; // Fallback to original URL only for valid URLs
  }
};

const uploadReferenceImage = asyncHandler(async (req, res) => {
  const user = req.user;

  logger.info('🔥 UPLOAD REQUEST RECEIVED:', {
    userId: user?._id,
    url: req.url,
    method: req.method,
    hasFile: !!req.file,
    fileDetails: req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    } : null,
    contentType: req.headers['content-type'],
    userAgent: req.headers['user-agent'],
    bodyKeys: Object.keys(req.body || {}),
  });

  if (!req.file) {
    logger.warn('No file in upload request');
    return ApiResponse.validationError(res, [{
      field: 'image',
      message: 'Reference image is required',
    }]);
  }

  try {
    logger.info('Starting S3 upload...');
    
    // Upload image to cloud storage
    const imageUrl = await uploadImage(req.file, {
      processOptions: {
        width: 1024,
        height: 1024,
        quality: 90,
        format: 'jpeg',
      },
    });

    logger.info(`Reference image uploaded successfully for user ${user._id}: ${imageUrl}`);

    return ApiResponse.success(res, {
      imageUrl,
      fileName: req.file.originalname,
      size: req.file.size,
    }, 'Reference image uploaded successfully');

  } catch (error) {
    logger.error('Reference image upload failed:', error);
    return ApiResponse.serverError(res, 'Failed to upload reference image');
  }
});

const createGeneration = asyncHandler(async (req, res) => {
  const user = req.user;
  const { parameters = {}, inputImageUrl } = req.body;
  
  // Debug logging
  logger.info('Generation request received:', {
    userId: user._id,
    hasParameters: !!parameters,
    parametersKeys: Object.keys(parameters),
    hasInputImageUrl: !!inputImageUrl,
    requestBody: req.body
  });
  
  const { prompt, negativePrompt, style, quality, steps, guidanceScale, seed, width, height, imageCount } = parameters;

  // Validate prompt (required)
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    logger.warn('Generation validation failed: missing or invalid prompt', {
      prompt,
      promptType: typeof prompt,
      parameters
    });
    return ApiResponse.validationError(res, [{
      field: 'parameters.prompt',
      message: 'Prompt is required and cannot be empty',
    }]);
  }

  // Validate inputImageUrl (optional for some generations)
  if (inputImageUrl && typeof inputImageUrl !== 'string') {
    return ApiResponse.validationError(res, [{
      field: 'inputImageUrl',
      message: 'Input image URL must be a valid string',
    }]);
  }

  // Calculate credits required based on number of images
  const numImages = Math.min(Math.max(parseInt(imageCount) || 1, 1), 4); // 1-4 images
  const creditsRequired = numImages; // 1 credit per image

  // Check if user has enough credits (skip for premium users)
  if (!user.isPremiumActive && user.credits < creditsRequired) {
    return ApiResponse.forbiddenError(res, `Insufficient credits. Required: ${creditsRequired}, Available: ${user.credits}`);
  }

  try {
    // Upload input image to S3 if provided
    let s3InputImageUrl = null;
    if (inputImageUrl) {
      s3InputImageUrl = await downloadAndUploadToS3(
        inputImageUrl, 
        `input-${Date.now()}-${user._id}.jpg`
      );
    }

    // Create generation record
    const generationData = {
      userId: user._id,
      originalImageUrl: s3InputImageUrl || null,
      prompt: prompt.trim(),
      modelUsed: 'fal-ai/flux-pro/kontext',
      parameters: {
        prompt: prompt.trim(),
        negativePrompt: negativePrompt || '',
        style: style || 'photographic',
        quality: parseInt(quality) || 2,
        steps: parseInt(steps) || 25,
        guidanceScale: parseFloat(guidanceScale) || 7.5,
        seed: seed ? parseInt(seed) : null,
        width: parseInt(width) || 1024,
        height: parseInt(height) || 1024,
        imageCount: numImages,
        num_images: numImages,
      },
      creditsUsed: creditsRequired,
      status: 'pending',
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        deviceInfo: req.get('X-Device-Info'),
      },
    };

    const generation = await Generation.create(generationData);

    // Don't deduct credits yet - wait for successful completion
    // Credits will be deducted in processGeneration when AI completes successfully

    logger.info(`Generation created: ${generation._id} for user ${user._id}`);

    // Start processing generation asynchronously
    processGeneration(generation._id).catch(error => {
      logger.error(`Generation processing failed: ${generation._id}`, error);
    });

    return ApiResponse.created(res, {
      generationId: generation._id,
      status: generation.status,
      creditsUsed: generation.creditsUsed,
      estimatedCompletionTime: '2-3 minutes',
    }, 'Generation request created successfully');

  } catch (error) {
    logger.error('Generation creation failed:', error);
    return ApiResponse.serverError(res, 'Failed to create generation request');
  }
});

const getGeneration = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const generation = await Generation.findOne({
    _id: id,
    userId: user._id,
  });

  if (!generation) {
    return ApiResponse.notFoundError(res, 'Generation not found');
  }

  return ApiResponse.success(res, { generation }, 'Generation retrieved successfully');
});

const getGenerationHistory = asyncHandler(async (req, res) => {
  const user = req.user;
  const { page = 1, limit = 10, status, modelUsed } = req.query;

  // Build query
  const query = { userId: user._id };
  if (status) query.status = status;
  if (modelUsed) query.modelUsed = modelUsed;

  // Get paginated generations
  const skip = (page - 1) * limit;
  const [generations, total] = await Promise.all([
    Generation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-userId -metadata'),
    Generation.countDocuments(query),
  ]);

  return ApiResponse.paginated(res, generations, {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
  }, 'Generation history retrieved successfully');
});

const retryGeneration = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const generation = await Generation.findOne({
    _id: id,
    userId: user._id,
  });

  if (!generation) {
    return ApiResponse.notFoundError(res, 'Generation not found');
  }

  if (generation.status !== 'failed') {
    return ApiResponse.validationError(res, [{
      field: 'status',
      message: 'Only failed generations can be retried',
    }]);
  }

  // Check credits again for non-premium users
  if (!user.isPremiumActive && user.credits < generation.creditsUsed) {
    return ApiResponse.forbiddenError(res, 'Insufficient credits for retry');
  }

  try {
    // Reset generation status
    generation.status = 'pending';
    generation.processingStartedAt = null;
    generation.completedAt = null;
    generation.failureReason = null;
    generation.processingTimeMs = null;
    generation.generatedImageUrls = [];
    
    // Ensure parameters.prompt exists for validation
    if (!generation.parameters.prompt && generation.prompt) {
      generation.parameters.prompt = generation.prompt;
    }
    
    await generation.save();

    // Don't deduct credits yet for retry - wait for successful completion
    // Credits will be deducted in processGeneration when AI completes successfully

    // Start processing again
    processGeneration(generation._id).catch(error => {
      logger.error(`Generation retry processing failed: ${generation._id}`, error);
    });

    return ApiResponse.success(res, {
      generationId: generation._id,
      status: generation.status,
    }, 'Generation retry started successfully');

  } catch (error) {
    logger.error('Generation retry failed:', error);
    return ApiResponse.serverError(res, 'Failed to retry generation');
  }
});

const cancelGeneration = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const generation = await Generation.findOne({
    _id: id,
    userId: user._id,
  });

  if (!generation) {
    return ApiResponse.notFoundError(res, 'Generation not found');
  }

  if (!['pending', 'processing'].includes(generation.status)) {
    return ApiResponse.validationError(res, [{
      field: 'status',
      message: 'Only pending or processing generations can be cancelled',
    }]);
  }

  try {
    // Update generation status
    await generation.fail('Cancelled by user');

    // No need to refund credits since they weren't deducted yet
    // Credits are only deducted on successful completion

    logger.info(`Generation cancelled: ${generation._id} for user ${user._id}`);

    return ApiResponse.success(res, null, 'Generation cancelled successfully');

  } catch (error) {
    logger.error('Generation cancellation failed:', error);
    return ApiResponse.serverError(res, 'Failed to cancel generation');
  }
});

const getGenerationStats = asyncHandler(async (req, res) => {
  const user = req.user;

  const stats = await Generation.aggregate([
    { $match: { userId: user._id } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalCreditsUsed: { $sum: '$creditsUsed' },
        avgProcessingTime: { $avg: '$processingTimeMs' },
      },
    },
  ]);

  const modelStats = await Generation.aggregate([
    { $match: { userId: user._id, status: 'completed' } },
    {
      $group: {
        _id: '$modelUsed',
        count: { $sum: 1 },
        avgProcessingTime: { $avg: '$processingTimeMs' },
      },
    },
  ]);

  const monthlyStats = await Generation.aggregate([
    { 
      $match: { 
        userId: user._id,
        createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) }, // This year
      },
    },
    {
      $group: {
        _id: {
          month: { $month: '$createdAt' },
          year: { $year: '$createdAt' },
        },
        count: { $sum: 1 },
        creditsUsed: { $sum: '$creditsUsed' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  return ApiResponse.success(res, {
    byStatus: stats,
    byModel: modelStats,
    monthly: monthlyStats,
  }, 'Generation statistics retrieved successfully');
});

const deleteGeneration = asyncHandler(async (req, res) => {
  const user = req.user;
  const { id } = req.params;

  const generation = await Generation.findOne({
    _id: id,
    userId: user._id,
  });

  if (!generation) {
    return ApiResponse.notFoundError(res, 'Generation not found');
  }

  try {
    // Delete images from S3 (optional - clean up storage)
    if (generation.originalImageUrl) {
      await deleteImage(generation.originalImageUrl);
    }
    
    if (generation.generatedImageUrls && generation.generatedImageUrls.length > 0) {
      for (const imageUrl of generation.generatedImageUrls) {
        await deleteImage(imageUrl);
      }
    }

    // Delete generation from database
    await Generation.findByIdAndDelete(id);

    logger.info(`Generation deleted: ${generation._id} by user ${user._id}`);

    return ApiResponse.success(res, null, 'Generation deleted successfully');

  } catch (error) {
    logger.error('Generation deletion failed:', error);
    return ApiResponse.serverError(res, 'Failed to delete generation');
  }
});

// Helper Functions
const calculateCreditsRequired = (numImages, parameters = {}) => {
  // Simple credit calculation: 1 credit per image
  const baseCredits = numImages || 1;
  
  // Future: add premium features that cost more credits
  // const width = parameters.width || 1024;
  // const height = parameters.height || 1024;
  // const steps = parameters.steps || 25;
  
  return Math.max(baseCredits, 1); // Minimum 1 credit
};

const processGeneration = async (generationId) => {
  try {
    const generation = await Generation.findById(generationId);
    if (!generation || generation.status !== 'pending') {
      return;
    }

    // Start processing
    await generation.startProcessing();
    logger.info(`Started processing generation: ${generationId}`);

    // Call FAL AI service
    const result = await callFalAI(
      generation.prompt,
      generation.originalImageUrl,
      generation.parameters
    );

    // Extract generated image URLs from FAL AI response
    let falImageUrls = [];
    if (result.images && Array.isArray(result.images)) {
      falImageUrls = result.images.map(img => img.url || img);
    } else if (result.image_url) {
      // Single image response
      falImageUrls = [result.image_url];
    } else if (result.url) {
      // Alternative single image format
      falImageUrls = [result.url];
    }

    if (falImageUrls.length === 0) {
      throw new Error('No images generated by FAL AI service');
    }

    logger.info(`Generated ${falImageUrls.length} images for generation: ${generationId}`);
    
    // Upload generated images to S3
    const generatedImageUrls = [];
    for (let i = 0; i < falImageUrls.length; i++) {
      const filename = `generated-${generationId}-${i + 1}.jpg`;
      const s3Url = await downloadAndUploadToS3(falImageUrls[i], filename);
      if (s3Url) {
        generatedImageUrls.push(s3Url);
      }
    }
    
    logger.info(`Uploaded ${generatedImageUrls.length} images to S3 for generation: ${generationId}`);

    // Complete generation
    await generation.complete(generatedImageUrls);
    
    // Deduct credits only on successful completion (only for non-premium users)
    const user = await User.findById(generation.userId);
    if (user && !user.isPremiumActive) {
      await user.deductCredits(generation.creditsUsed);
      logger.info(`Credits deducted for successful generation: ${generation.creditsUsed} for user ${user._id}`);
    }
    
    logger.info(`Completed generation: ${generationId}`);

  } catch (error) {
    logger.error(`Generation processing failed: ${generationId}`, error);
    
    try {
      const generation = await Generation.findById(generationId);
      if (generation) {
        await generation.fail(error.message);
        
        // No need to refund credits since they weren't deducted yet
        logger.info(`Generation failed, no credits were deducted: ${generationId}`);
      }
    } catch (updateError) {
      logger.error(`Failed to update generation status: ${generationId}`, updateError);
    }
  }
};

module.exports = {
  uploadReferenceImage,
  createGeneration,
  getGeneration,
  getGenerationHistory,
  retryGeneration,
  cancelGeneration,
  deleteGeneration,
  getGenerationStats,
};