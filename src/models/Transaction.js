const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  type: {
    type: String,
    enum: ['credit_purchase', 'credit_usage', 'signup_bonus', 'premium_subscription', 'refund', 'bonus'],
    required: [true, 'Transaction type is required'],
  },
  amount: {
    type: Number,
    required: [true, 'Transaction amount is required'],
    min: [0, 'Amount cannot be negative'],
  },
  creditsAdded: {
    type: Number,
    required: [true, 'Credits added is required'],
    // Allow negative values for credit usage (deduction)
  },
  paymentId: {
    type: String,
    default: null,
  },
  stripePaymentIntentId: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending',
  },
  description: {
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters'],
  },
  metadata: {
    packageName: String,
    originalPrice: Number,
    discount: Number,
    promotionCode: String,
    ipAddress: String,
    userAgent: String,
  },
  processedAt: {
    type: Date,
    default: null,
  },
  failureReason: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes for performance
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ paymentId: 1 });
transactionSchema.index({ stripePaymentIntentId: 1 });
transactionSchema.index({ createdAt: -1 });

// Method to complete transaction
transactionSchema.methods.complete = async function() {
  this.status = 'completed';
  this.processedAt = new Date();
  return await this.save();
};

// Method to fail transaction
transactionSchema.methods.fail = async function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  this.processedAt = new Date();
  return await this.save();
};

// Method to refund transaction
transactionSchema.methods.refund = async function() {
  this.status = 'refunded';
  this.processedAt = new Date();
  return await this.save();
};

// Static method to get user transaction stats
transactionSchema.statics.getUserStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), status: 'completed' } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        totalCredits: { $sum: '$creditsAdded' },
      },
    },
  ]);
  
  const totalStats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), status: 'completed' } },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalSpent: { $sum: '$amount' },
        totalCreditsEarned: { $sum: '$creditsAdded' },
      },
    },
  ]);
  
  return {
    byType: stats,
    totals: totalStats[0] || { totalTransactions: 0, totalSpent: 0, totalCreditsEarned: 0 },
  };
};

// Static method to get revenue stats (admin)
transactionSchema.statics.getRevenueStats = async function(startDate, endDate) {
  const matchStage = {
    status: 'completed',
    type: { $in: ['credit_purchase'] },
  };
  
  if (startDate && endDate) {
    matchStage.createdAt = { $gte: startDate, $lte: endDate };
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          type: '$type',
        },
        count: { $sum: 1 },
        revenue: { $sum: '$amount' },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);
  
  const totalRevenue = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalTransactions: { $sum: 1 },
      },
    },
  ]);
  
  return {
    monthly: stats,
    total: totalRevenue[0] || { totalRevenue: 0, totalTransactions: 0 },
  };
};

module.exports = mongoose.model('Transaction', transactionSchema);