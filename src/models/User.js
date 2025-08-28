const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password required only if not Google user
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false,
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    maxlength: [50, 'First name cannot exceed 50 characters'],
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    maxlength: [50, 'Last name cannot exceed 50 characters'],
  },
  credits: {
    type: Number,
    default: 1,
    min: [0, 'Credits cannot be negative'],
  },
  profilePicture: {
    type: String,
    default: null,
  },
  deviceId: {
    type: String,
    default: null,
  },
  googleId: {
    type: String,
    default: null,
    sparse: true, // This allows multiple null values
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isEmailVerified: {
    type: Boolean,
    default: false,
  },
  emailVerificationCode: {
    type: String,
    default: null,
  },
  emailVerificationExpires: {
    type: Date,
    default: null,
  },
  emailVerificationLastSent: {
    type: Date,
    default: null,
  },
  passwordResetCode: {
    type: String,
    default: null,
  },
  passwordResetExpires: {
    type: Date,
    default: null,
  },
  passwordResetLastSent: {
    type: Date,
    default: null,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  },
  refreshTokens: [{
    token: String,
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000, // 30 days
    },
  }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ deviceId: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});


// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to deduct credits
userSchema.methods.deductCredits = async function(amount) {
  if (this.credits < amount) {
    throw new Error('Insufficient credits');
  }
  this.credits -= amount;
  return await this.save();
};

// Method to add credits
userSchema.methods.addCredits = async function(amount) {
  this.credits += amount;
  return await this.save();
};

// Method to generate 6-digit email verification code
userSchema.methods.generateEmailVerificationCode = function() {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  this.emailVerificationCode = code;
  this.emailVerificationExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  this.emailVerificationLastSent = Date.now();
  
  return code;
};

// Method to generate 6-digit password reset code
userSchema.methods.generatePasswordResetCode = function() {
  // Generate 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  this.passwordResetCode = code;
  this.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  this.passwordResetLastSent = Date.now();
  
  return code;
};

// Method to verify email verification code
userSchema.methods.verifyEmailCode = function(code) {
  return this.emailVerificationCode === code && 
         this.emailVerificationExpires > Date.now();
};

// Method to verify password reset code
userSchema.methods.verifyPasswordResetCode = function(code) {
  return this.passwordResetCode === code && 
         this.passwordResetExpires > Date.now();
};

// Method to check if can resend email verification (3 minutes limit)
userSchema.methods.canResendEmailVerification = function() {
  if (!this.emailVerificationLastSent) return true;
  const timeDiff = Date.now() - this.emailVerificationLastSent.getTime();
  return timeDiff >= 3 * 60 * 1000; // 3 minutes
};

// Method to check if can resend password reset (3 minutes limit)
userSchema.methods.canResendPasswordReset = function() {
  if (!this.passwordResetLastSent) return true;
  const timeDiff = Date.now() - this.passwordResetLastSent.getTime();
  return timeDiff >= 3 * 60 * 1000; // 3 minutes
};


module.exports = mongoose.model('User', userSchema);