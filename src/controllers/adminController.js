const User = require('../models/User');
const Generation = require('../models/Generation');
const Transaction = require('../models/Transaction');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const getAppStats = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));

  // Run all stat queries in parallel
  const [
    totalUsers,
    activeUsers,
    newUsers,
    premiumUsers,
    totalGenerations,
    completedGenerations,
    totalRevenue,
    recentRevenue,
    topUsers,
    systemHealth,
  ] = await Promise.all([
    // Total users
    User.countDocuments({ isActive: true }),
    
    // Active users (logged in within last 7 days)
    User.countDocuments({
      isActive: true,
      lastLogin: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    }),
    
    // New users in the specified period
    User.countDocuments({
      createdAt: { $gte: startDate },
    }),
    
    // Premium users
    User.countDocuments({
      isPremium: true,
      premiumExpiresAt: { $gt: new Date() },
    }),
    
    // Total generations
    Generation.countDocuments(),
    
    // Completed generations
    Generation.countDocuments({ status: 'completed' }),
    
    // Total revenue
    Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          type: { $in: ['credit_purchase', 'premium_subscription'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    
    // Recent revenue
    Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          type: { $in: ['credit_purchase', 'premium_subscription'] },
          createdAt: { $gte: startDate },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    
    // Top users by generations
    Generation.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          userId: '$_id',
          generationCount: '$count',
          email: '$user.email',
          username: '$user.username',
          createdAt: '$user.createdAt',
        },
      },
    ]),
    
    // System health metrics
    getSystemHealth(),
  ]);

  const stats = {
    users: {
      total: totalUsers,
      active: activeUsers,
      new: newUsers,
      premium: premiumUsers,
      churnRate: totalUsers > 0 ? Math.round(((totalUsers - activeUsers) / totalUsers) * 100) : 0,
    },
    generations: {
      total: totalGenerations,
      completed: completedGenerations,
      successRate: totalGenerations > 0 ? Math.round((completedGenerations / totalGenerations) * 100) : 0,
    },
    revenue: {
      total: totalRevenue[0]?.total || 0,
      recent: recentRevenue[0]?.total || 0,
      totalFormatted: `$${((totalRevenue[0]?.total || 0) / 100).toFixed(2)}`,
      recentFormatted: `$${((recentRevenue[0]?.total || 0) / 100).toFixed(2)}`,
    },
    topUsers,
    systemHealth,
    period: `Last ${days} days`,
  };

  return ApiResponse.success(res, stats, 'App statistics retrieved successfully');
});

const getUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    role,
    isPremium,
    isActive,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  // Build query
  const query = {};
  
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
    ];
  }
  
  if (role) query.role = role;
  if (isPremium !== undefined) query.isPremium = isPremium === 'true';
  if (isActive !== undefined) query.isActive = isActive === 'true';

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(query)
      .select('-password -refreshTokens')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit)),
    User.countDocuments(query),
  ]);

  return ApiResponse.paginated(res, users, {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
  }, 'Users retrieved successfully');
});

const getUserDetails = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const [user, stats] = await Promise.all([
    User.findById(userId).select('-password -refreshTokens'),
    getUserStats(userId),
  ]);

  if (!user) {
    return ApiResponse.notFoundError(res, 'User not found');
  }

  return ApiResponse.success(res, {
    user,
    stats,
  }, 'User details retrieved successfully');
});

const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const updates = req.body;

  // Remove sensitive fields that shouldn't be updated via admin
  delete updates.password;
  delete updates.refreshTokens;

  const user = await User.findByIdAndUpdate(
    userId,
    updates,
    { new: true, runValidators: true }
  ).select('-password -refreshTokens');

  if (!user) {
    return ApiResponse.notFoundError(res, 'User not found');
  }

  logger.info(`User ${userId} updated by admin ${req.user._id}`, { updates });

  return ApiResponse.success(res, { user }, 'User updated successfully');
});

const addCreditsToUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { credits, reason = 'Admin credit adjustment' } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return ApiResponse.notFoundError(res, 'User not found');
  }

  // Add credits
  await user.addCredits(credits);

  // Create transaction record
  await Transaction.create({
    userId: user._id,
    type: 'bonus',
    amount: 0,
    creditsAdded: credits,
    status: 'completed',
    description: reason,
    processedAt: new Date(),
    metadata: {
      addedByAdmin: req.user._id,
      adminReason: reason,
    },
  });

  logger.info(`Admin ${req.user._id} added ${credits} credits to user ${userId}: ${reason}`);

  return ApiResponse.success(res, {
    userId: user._id,
    newCreditBalance: user.credits,
    creditsAdded: credits,
  }, 'Credits added successfully');
});

const toggleUserStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { isActive } = req.body;

  const user = await User.findByIdAndUpdate(
    userId,
    { isActive },
    { new: true }
  ).select('-password -refreshTokens');

  if (!user) {
    return ApiResponse.notFoundError(res, 'User not found');
  }

  const action = isActive ? 'activated' : 'deactivated';
  logger.info(`User ${userId} ${action} by admin ${req.user._id}`);

  return ApiResponse.success(res, { user }, `User ${action} successfully`);
});

const getGenerations = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    userId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  // Build query
  const query = {};
  if (status) query.status = status;
  if (userId) query.userId = userId;

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const skip = (page - 1) * limit;
  const [generations, total] = await Promise.all([
    Generation.find(query)
      .populate('userId', 'email username firstName lastName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit)),
    Generation.countDocuments(query),
  ]);

  return ApiResponse.paginated(res, generations, {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
  }, 'Generations retrieved successfully');
});

const deleteGeneration = asyncHandler(async (req, res) => {
  const { generationId } = req.params;

  const generation = await Generation.findByIdAndDelete(generationId);
  if (!generation) {
    return ApiResponse.notFoundError(res, 'Generation not found');
  }

  logger.info(`Generation ${generationId} deleted by admin ${req.user._id}`);

  return ApiResponse.success(res, null, 'Generation deleted successfully');
});

const getTransactions = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    type,
    status,
    userId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  // Build query
  const query = {};
  if (type) query.type = type;
  if (status) query.status = status;
  if (userId) query.userId = userId;

  // Build sort
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .populate('userId', 'email username firstName lastName')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit)),
    Transaction.countDocuments(query),
  ]);

  return ApiResponse.paginated(res, transactions, {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
  }, 'Transactions retrieved successfully');
});

const getRevenueStats = asyncHandler(async (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;

  let start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let end = endDate ? new Date(endDate) : new Date();

  const stats = await Transaction.getRevenueStats(start, end);

  // Group by period
  let groupFormat;
  switch (groupBy) {
    case 'hour':
      groupFormat = { 
        hour: { $hour: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' },
        month: { $month: '$createdAt' },
        year: { $year: '$createdAt' }
      };
      break;
    case 'day':
      groupFormat = { 
        day: { $dayOfMonth: '$createdAt' },
        month: { $month: '$createdAt' },
        year: { $year: '$createdAt' }
      };
      break;
    case 'month':
      groupFormat = { 
        month: { $month: '$createdAt' },
        year: { $year: '$createdAt' }
      };
      break;
    default:
      groupFormat = { 
        day: { $dayOfMonth: '$createdAt' },
        month: { $month: '$createdAt' },
        year: { $year: '$createdAt' }
      };
  }

  const detailedStats = await Transaction.aggregate([
    {
      $match: {
        status: 'completed',
        type: { $in: ['credit_purchase', 'premium_subscription'] },
        createdAt: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: groupFormat,
        revenue: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } },
  ]);

  return ApiResponse.success(res, {
    summary: stats.total,
    timeline: detailedStats,
    period: { start, end, groupBy },
  }, 'Revenue statistics retrieved successfully');
});

// Helper Functions
const getUserStats = async (userId) => {
  const [
    generationStats,
    transactionStats,
  ] = await Promise.all([
    Generation.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          creditsUsed: { $sum: '$creditsUsed' },
        },
      },
    ]),
    Transaction.getUserStats(userId),
  ]);

  return {
    generations: generationStats,
    transactions: transactionStats,
  };
};

const getSystemHealth = async () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const [
    recentErrors,
    pendingGenerations,
    processingGenerations,
    avgProcessingTime,
  ] = await Promise.all([
    // Count recent failed generations
    Generation.countDocuments({
      status: 'failed',
      createdAt: { $gte: oneHourAgo },
    }),
    
    // Count pending generations
    Generation.countDocuments({ status: 'pending' }),
    
    // Count processing generations
    Generation.countDocuments({ status: 'processing' }),
    
    // Average processing time for completed generations
    Generation.aggregate([
      {
        $match: {
          status: 'completed',
          processingTimeMs: { $exists: true, $gt: 0 },
          createdAt: { $gte: oneHourAgo },
        },
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$processingTimeMs' },
        },
      },
    ]),
  ]);

  return {
    recentErrors,
    pendingGenerations,
    processingGenerations,
    avgProcessingTimeMs: avgProcessingTime[0]?.avgTime || 0,
    avgProcessingTimeSeconds: avgProcessingTime[0]?.avgTime 
      ? Math.round(avgProcessingTime[0].avgTime / 1000) 
      : 0,
    status: recentErrors > 10 ? 'unhealthy' : 'healthy',
    lastChecked: now,
  };
};

module.exports = {
  getAppStats,
  getUsers,
  getUserDetails,
  updateUser,
  addCreditsToUser,
  toggleUserStatus,
  getGenerations,
  deleteGeneration,
  getTransactions,
  getRevenueStats,
};