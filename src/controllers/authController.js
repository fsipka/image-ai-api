const User = require('../models/User');
const jwt = require('../utils/jwt');
const ApiResponse = require('../utils/apiResponse');
const { sendWelcomeEmail } = require('../utils/email');
const { asyncHandler } = require('../middleware/errorHandler');

const register = asyncHandler(async (req, res) => {
  const { email, password, username, firstName, lastName, deviceId } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username }],
  });

  if (existingUser) {
    const field = existingUser.email === email.toLowerCase() ? 'email' : 'username';
    return ApiResponse.conflictError(res, `User with this ${field} already exists`);
  }

  // Create new user
  const userData = {
    email: email.toLowerCase(),
    password,
    username,
    firstName,
    lastName,
    deviceId,
    lastLogin: new Date(),
  };

  const user = await User.create(userData);

  // Generate tokens
  const tokenPayload = { id: user._id, email: user.email, role: user.role };
  const { accessToken, refreshToken } = jwt.generateTokens(tokenPayload);

  // Add refresh token to user
  user.refreshTokens.push({ token: refreshToken });
  await user.save();

  // Send welcome email (don't wait for it)
  sendWelcomeEmail(user).catch(err => {
    console.error('Failed to send welcome email:', err);
  });

  // Remove sensitive fields
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
    role: user.role,
    createdAt: user.createdAt,
  };

  return ApiResponse.created(res, {
    user: userResponse,
    accessToken,
    refreshToken,
  }, 'Account created successfully');
});

const login = asyncHandler(async (req, res) => {
  const { email, password, deviceId } = req.body;
console.log(req)
  // Find user and include password for comparison
  const user = await User.findOne({ 
    email: email.toLowerCase(),
    isActive: true,
  }).select('+password');

  if (!user) {
    return ApiResponse.unauthorizedError(res, 'Invalid email or password');
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return ApiResponse.unauthorizedError(res, 'Invalid email or password');
  }

  // Update last login and device ID
  user.lastLogin = new Date();
  if (deviceId) {
    user.deviceId = deviceId;
  }

  // Generate tokens
  const tokenPayload = { id: user._id, email: user.email, role: user.role };
  const { accessToken, refreshToken } = jwt.generateTokens(tokenPayload);

  // Add refresh token to user (keep only last 5 tokens)
  user.refreshTokens.push({ token: refreshToken });
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }

  await user.save();

  // Remove sensitive fields
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
    role: user.role,
    profilePicture: user.profilePicture,
    lastLogin: user.lastLogin,
  };

  return ApiResponse.success(res, {
    user: userResponse,
    accessToken,
    refreshToken,
  }, 'Login successful');
});

const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return ApiResponse.unauthorizedError(res, 'Refresh token is required');
  }

  try {
    // Verify refresh token
    const decoded = jwt.verifyRefreshToken(refreshToken);
    
    // Find user and check if refresh token exists
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return ApiResponse.unauthorizedError(res, 'Invalid refresh token');
    }

    // Check if refresh token exists in user's tokens
    const tokenExists = user.refreshTokens.some(tokenObj => tokenObj.token === refreshToken);
    if (!tokenExists) {
      return ApiResponse.unauthorizedError(res, 'Invalid refresh token');
    }

    // Generate new tokens
    const tokenPayload = { id: user._id, email: user.email, role: user.role };
    const { accessToken, refreshToken: newRefreshToken } = jwt.generateTokens(tokenPayload);

    // Remove old refresh token and add new one
    user.refreshTokens = user.refreshTokens.filter(tokenObj => tokenObj.token !== refreshToken);
    user.refreshTokens.push({ token: newRefreshToken });

    // Keep only last 5 tokens
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    await user.save();

    return ApiResponse.success(res, {
      accessToken,
      refreshToken: newRefreshToken,
    }, 'Token refreshed successfully');

  } catch (error) {
    return ApiResponse.unauthorizedError(res, 'Invalid refresh token');
  }
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const user = req.user;

  if (refreshToken) {
    // Remove specific refresh token
    user.refreshTokens = user.refreshTokens.filter(tokenObj => tokenObj.token !== refreshToken);
  } else {
    // Remove all refresh tokens (logout from all devices)
    user.refreshTokens = [];
  }

  await user.save();

  return ApiResponse.success(res, null, 'Logged out successfully');
});

const logoutAll = asyncHandler(async (req, res) => {
  const user = req.user;

  // Remove all refresh tokens
  user.refreshTokens = [];
  await user.save();

  return ApiResponse.success(res, null, 'Logged out from all devices successfully');
});

const getProfile = asyncHandler(async (req, res) => {
  const user = req.user;

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
    role: user.role,
    profilePicture: user.profilePicture,
    deviceId: user.deviceId,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  return ApiResponse.success(res, { user: userResponse }, 'Profile retrieved successfully');
});

const verifyToken = asyncHandler(async (req, res) => {
  // If we reach here, the token is valid (auth middleware passed)
  const user = req.user;

  const userResponse = {
    id: user._id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    credits: user.credits,
    isPremium: user.isPremium,
    isPremiumActive: user.isPremiumActive,
  };

  return ApiResponse.success(res, { 
    user: userResponse,
    valid: true,
  }, 'Token is valid');
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = req.user;

  // Get user with password
  const userWithPassword = await User.findById(user._id).select('+password');

  // Verify current password
  const isCurrentPasswordValid = await userWithPassword.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    return ApiResponse.unauthorizedError(res, 'Current password is incorrect');
  }

  // Update password
  userWithPassword.password = newPassword;
  await userWithPassword.save();

  // Remove all refresh tokens to force re-login
  userWithPassword.refreshTokens = [];
  await userWithPassword.save();

  return ApiResponse.success(res, null, 'Password changed successfully. Please login again.');
});

const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const user = req.user;

  // Get user with password
  const userWithPassword = await User.findById(user._id).select('+password');

  // Verify password
  const isPasswordValid = await userWithPassword.comparePassword(password);
  if (!isPasswordValid) {
    return ApiResponse.unauthorizedError(res, 'Password is incorrect');
  }

  // Deactivate account instead of deleting
  userWithPassword.isActive = false;
  userWithPassword.refreshTokens = [];
  await userWithPassword.save();

  return ApiResponse.success(res, null, 'Account deactivated successfully');
});

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  getProfile,
  verifyToken,
  changePassword,
  deleteAccount,
};