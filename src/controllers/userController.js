const User = require('../models/User');
const Generation = require('../models/Generation');
const Transaction = require('../models/Transaction');
const ApiResponse = require('../utils/apiResponse');
const { uploadImage } = require('../utils/upload');
const { asyncHandler } = require('../middleware/errorHandler');

const getProfile = asyncHandler(async (req, res) => {
  const user = req.user;

  // Get additional stats
  const [generationStats, transactionStats] = await Promise.all([
    Generation.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          creditsUsed: { $sum: '$creditsUsed' },
        },
      },
    ]),
    Transaction.aggregate([
      { $match: { userId: user._id, status: 'completed' } },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$amount' },
          totalCreditsEarned: { $sum: '$creditsAdded' },
        },
      },
    ]),
  ]);

  const userResponse = {
    id: user._id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    credits: user.credits,
    isPremium: user.isPremium,
    isPremiumActive: user.isPremiumActive,
    premiumExpiresAt: user.premiumExpiresAt,
    profilePicture: user.profilePicture,
    role: user.role,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    stats: {
      generations: generationStats,
      totalSpent: transactionStats[0]?.totalSpent || 0,
      totalCreditsEarned: transactionStats[0]?.totalCreditsEarned || 0,
    },
  };

  return ApiResponse.success(res, { user: userResponse }, 'Profile retrieved successfully');
});

const updateProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, username } = req.body;
  const user = req.user;

  // Check if username is being changed and if it's already taken
  if (username && username !== user.username) {
    const existingUser = await User.findOne({ 
      username, 
      _id: { $ne: user._id } 
    });
    
    if (existingUser) {
      return ApiResponse.conflictError(res, 'Username is already taken');
    }
  }

  // Update user
  const updateData = {};
  if (firstName) updateData.firstName = firstName;
  if (lastName) updateData.lastName = lastName;
  if (username) updateData.username = username;

  const updatedUser = await User.findByIdAndUpdate(
    user._id,
    updateData,
    { new: true, runValidators: true }
  );

  const userResponse = {
    id: updatedUser._id,
    email: updatedUser.email,
    username: updatedUser.username,
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    fullName: updatedUser.fullName,
    credits: updatedUser.credits,
    isPremium: updatedUser.isPremium,
    isPremiumActive: updatedUser.isPremiumActive,
    profilePicture: updatedUser.profilePicture,
    updatedAt: updatedUser.updatedAt,
  };

  return ApiResponse.success(res, { user: userResponse }, 'Profile updated successfully');
});

const uploadProfilePicture = asyncHandler(async (req, res) => {
  const user = req.user;

  if (!req.file) {
    return ApiResponse.validationError(res, [{ 
      field: 'profilePicture', 
      message: 'Profile picture is required' 
    }]);
  }

  try {
    // Upload image to cloud storage
    const imageUrl = await uploadImage(req.file, {
      processOptions: {
        width: 300,
        height: 300,
        quality: 85,
        format: 'jpeg',
      },
    });

    // Update user profile picture
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { profilePicture: imageUrl },
      { new: true }
    );

    return ApiResponse.success(res, {
      profilePicture: updatedUser.profilePicture,
    }, 'Profile picture updated successfully');

  } catch (error) {
    return ApiResponse.serverError(res, 'Failed to upload profile picture');
  }
});

const removeProfilePicture = asyncHandler(async (req, res) => {
  const user = req.user;

  // Update user profile picture to null
  await User.findByIdAndUpdate(user._id, { profilePicture: null });

  return ApiResponse.success(res, null, 'Profile picture removed successfully');
});

const getCredits = asyncHandler(async (req, res) => {
  const user = req.user;

  // Get recent credit transactions
  const recentTransactions = await Transaction.find({
    userId: user._id,
    status: 'completed',
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('type creditsAdded amount description createdAt');

  return ApiResponse.success(res, {
    credits: user.credits,
    isPremium: user.isPremium,
    isPremiumActive: user.isPremiumActive,
    premiumExpiresAt: user.premiumExpiresAt,
    recentTransactions,
  }, 'Credits retrieved successfully');
});

const getGenerationHistory = asyncHandler(async (req, res) => {
  const user = req.user;
  const { page = 1, limit = 10, status } = req.query;

  // Build query
  const query = { userId: user._id };
  if (status) {
    query.status = status;
  }

  // Get paginated generations
  const skip = (page - 1) * limit;
  const [generations, total] = await Promise.all([
    Generation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-userId'),
    Generation.countDocuments(query),
  ]);

  return ApiResponse.paginated(res, generations, {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
  }, 'Generation history retrieved successfully');
});

const getTransactionHistory = asyncHandler(async (req, res) => {
  const user = req.user;
  const { page = 1, limit = 10, type } = req.query;

  // Build query
  const query = { userId: user._id };
  if (type) {
    query.type = type;
  }

  // Get paginated transactions
  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-userId'),
    Transaction.countDocuments(query),
  ]);

  return ApiResponse.paginated(res, transactions, {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
  }, 'Transaction history retrieved successfully');
});

const getDashboardStats = asyncHandler(async (req, res) => {
  const user = req.user;

  // Get various statistics
  const [
    totalGenerations,
    completedGenerations,
    totalCreditsSpent,
    totalMoneySpent,
    recentGenerations,
    monthlyStats,
  ] = await Promise.all([
    Generation.countDocuments({ userId: user._id }),
    Generation.countDocuments({ userId: user._id, status: 'completed' }),
    Generation.aggregate([
      { $match: { userId: user._id, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$creditsUsed' } } },
    ]),
    Transaction.aggregate([
      { 
        $match: { 
          userId: user._id, 
          status: 'completed',
          type: { $in: ['credit_purchase', 'premium_subscription'] },
        } 
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Generation.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('prompt status createdAt generatedImageUrls'),
    Generation.aggregate([
      { 
        $match: { 
          userId: user._id,
          createdAt: { $gte: new Date(new Date().getFullYear(), 0, 1) }, // This year
        } 
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
    ]),
  ]);

  const stats = {
    credits: {
      current: user.credits,
      totalSpent: totalCreditsSpent[0]?.total || 0,
    },
    generations: {
      total: totalGenerations,
      completed: completedGenerations,
      successRate: totalGenerations > 0 ? Math.round((completedGenerations / totalGenerations) * 100) : 0,
    },
    spending: {
      totalMoneySpent: totalMoneySpent[0]?.total || 0,
    },
    premium: {
      isPremium: user.isPremium,
      isPremiumActive: user.isPremiumActive,
      premiumExpiresAt: user.premiumExpiresAt,
    },
    recentGenerations,
    monthlyStats,
  };

  return ApiResponse.success(res, { stats }, 'Dashboard statistics retrieved successfully');
});

const getNotifications = asyncHandler(async (req, res) => {
  const user = req.user;
  const notifications = [];

  // Low credits notification
  if (user.credits <= 2 && !user.isPremiumActive) {
    notifications.push({
      id: 'low-credits',
      type: 'warning',
      title: 'Low Credits',
      message: `You have ${user.credits} credits remaining. Purchase more or watch ads to continue creating.`,
      action: 'Get Credits',
      priority: 'high',
    });
  }

  // Premium expiring soon
  if (user.isPremium && user.premiumExpiresAt) {
    const daysUntilExpiry = Math.ceil(
      (user.premiumExpiresAt - new Date()) / (1000 * 60 * 60 * 24)
    );
    
    if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
      notifications.push({
        id: 'premium-expiring',
        type: 'info',
        title: 'Premium Expiring Soon',
        message: `Your premium subscription expires in ${daysUntilExpiry} days.`,
        action: 'Renew Premium',
        priority: 'medium',
      });
    }
  }

  // Welcome message for new users
  const daysSinceJoined = Math.floor(
    (new Date() - user.createdAt) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSinceJoined <= 1) {
    notifications.push({
      id: 'welcome',
      type: 'success',
      title: 'Welcome to the App!',
      message: 'Start creating amazing AI-generated images with your free credits.',
      action: 'Create Now',
      priority: 'low',
    });
  }

  return ApiResponse.success(res, { notifications }, 'Notifications retrieved successfully');
});

module.exports = {
  getProfile,
  updateProfile,
  uploadProfilePicture,
  removeProfilePicture,
  getCredits,
  getGenerationHistory,
  getTransactionHistory,
  getDashboardStats,
  getNotifications,
};