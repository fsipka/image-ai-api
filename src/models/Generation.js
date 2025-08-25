const mongoose = require('mongoose');

const generationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  originalImageUrl: {
    type: String,
    required: false, // Made optional for text-to-image generations
    default: null,
  },
  generatedImageUrls: [{
    type: String,
  }],
  prompt: {
    type: String,
    required: [true, 'Prompt is required'],
    maxlength: [1000, 'Prompt cannot exceed 1000 characters'],
  },
  modelUsed: {
    type: String,
    required: true,
    enum: ['fal-ai', 'fal-ai/flux-pro/kontext', 'custom-model-1', 'custom-model-2'],
    default: 'fal-ai/flux-pro/kontext',
  },
  parameters: {
    prompt: {
      type: String,
      required: false, // Made optional since we have main prompt field
    },
    negativePrompt: {
      type: String,
      default: '',
    },
    style: {
      type: String,
      default: 'photographic',
    },
    quality: {
      type: Number,
      min: 1,
      max: 4,
      default: 2,
    },
    steps: {
      type: Number,
      min: 10,
      max: 50,
      default: 25,
    },
    guidanceScale: {
      type: Number,
      min: 1,
      max: 20,
      default: 7.5,
    },
    seed: {
      type: Number,
      default: null,
    },
    width: {
      type: Number,
      min: 512,
      max: 2048,
      default: 1024,
    },
    height: {
      type: Number,
      min: 512,
      max: 2048,
      default: 1024,
    },
    imageCount: {
      type: Number,
      min: 1,
      max: 4,
      default: 1,
    },
    num_images: {
      type: Number,
      min: 1,
      max: 4,
      default: 1,
    },
    // Legacy parameters for backward compatibility
    strength: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.8,
    },
    guidance_scale: {
      type: Number,
      min: 1,
      max: 20,
      default: 7.5,
    },
    num_inference_steps: {
      type: Number,
      min: 10,
      max: 100,
      default: 50,
    },
  },
  creditsUsed: {
    type: Number,
    required: true,
    min: [1, 'At least 1 credit must be used'],
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending',
  },
  processingStartedAt: {
    type: Date,
    default: null,
  },
  completedAt: {
    type: Date,
    default: null,
  },
  failureReason: {
    type: String,
    default: null,
  },
  processingTimeMs: {
    type: Number,
    default: null,
  },
  externalJobId: {
    type: String,
    default: null,
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    deviceInfo: String,
  },
}, {
  timestamps: true,
});

// Indexes for performance
generationSchema.index({ userId: 1, createdAt: -1 });
generationSchema.index({ status: 1 });
generationSchema.index({ externalJobId: 1 });
generationSchema.index({ createdAt: -1 });

// Virtual for processing time in seconds
generationSchema.virtual('processingTimeSeconds').get(function() {
  return this.processingTimeMs ? Math.round(this.processingTimeMs / 1000) : null;
});

// Virtual for backward compatibility - single image URL
generationSchema.virtual('imageUrl').get(function() {
  return this.generatedImageUrls && this.generatedImageUrls.length > 0 
    ? this.generatedImageUrls[0] 
    : null;
});

// Virtual for cost (alias for creditsUsed)
generationSchema.virtual('cost').get(function() {
  return this.creditsUsed;
});

// Include virtuals when converting to JSON
generationSchema.set('toJSON', { virtuals: true });
generationSchema.set('toObject', { virtuals: true });

// Method to start processing
generationSchema.methods.startProcessing = async function() {
  this.status = 'processing';
  this.processingStartedAt = new Date();
  return await this.save();
};

// Method to complete generation
generationSchema.methods.complete = async function(imageUrls) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.generatedImageUrls = imageUrls;
  
  if (this.processingStartedAt) {
    this.processingTimeMs = Date.now() - this.processingStartedAt.getTime();
  }
  
  return await this.save();
};

// Method to mark as failed
generationSchema.methods.fail = async function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  this.completedAt = new Date();
  
  if (this.processingStartedAt) {
    this.processingTimeMs = Date.now() - this.processingStartedAt.getTime();
  }
  
  return await this.save();
};

// Pre-save middleware to calculate processing time
generationSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'completed' && this.processingStartedAt && !this.processingTimeMs) {
    this.processingTimeMs = Date.now() - this.processingStartedAt.getTime();
  }
  next();
});

module.exports = mongoose.model('Generation', generationSchema);