const User = require('../models/User');
const jwt = require('../utils/jwt');
const config = require('../config');
const ApiResponse = require('../utils/apiResponse');
const { sendWelcomeEmail, sendEmailVerificationCode, sendPasswordResetCode } = require('../utils/email');
const { asyncHandler } = require('../middleware/errorHandler');
const { OAuth2Client } = require('google-auth-library');

const register = asyncHandler(async (req, res) => {
  const { email, password, username, firstName, lastName, deviceId } = req.body;

  console.log('Registration attempt:', { email: email.toLowerCase(), username, firstName, lastName });

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username }],
  });

  if (existingUser) {
    const field = existingUser.email === email.toLowerCase() ? 'email' : 'username';
    console.log('User already exists:', { field, existingEmail: existingUser.email, existingUsername: existingUser.username });
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
    // Don't include googleId field at all for normal registration
  };

  let user;
  try {
    user = await User.create(userData);
  } catch (error) {
    console.log('Registration error:', { code: error.code, message: error.message, keyPattern: error.keyPattern, keyValue: error.keyValue });
    if (error.code === 11000) {
      // Handle duplicate key error
      if (error.keyPattern && error.keyPattern.googleId) {
        return ApiResponse.conflictError(res, 'This Google account is already registered');
      }
      if (error.keyPattern && error.keyPattern.email) {
        return ApiResponse.conflictError(res, 'User with this email already exists');
      }
      if (error.keyPattern && error.keyPattern.username) {
        return ApiResponse.conflictError(res, 'Username is already taken');
      }
      return ApiResponse.conflictError(res, 'User already exists');
    }
    throw error;
  }

  // Generate email verification code
  const verificationCode = user.generateEmailVerificationCode();
  await user.save({ validateBeforeSave: false });

  // Send verification email (don't wait for it)
  sendEmailVerificationCode(user, verificationCode).catch(err => {
    console.error('Failed to send verification email:', err);
  });

  // Create signup bonus transaction
  const Transaction = require('../models/Transaction');
  const signupTransaction = await Transaction.create({
    userId: user._id,
    type: 'signup_bonus',
    amount: 0,
    creditsAdded: 1,
    description: 'Welcome Bonus - Free Credit',
    status: 'completed',
    metadata: {
      bonusType: 'signup',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    },
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
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
  };

  return ApiResponse.created(res, {
    user: userResponse,
    message: 'Account created successfully. Please check your email to verify your account.',
  }, 'Registration successful');
});

const login = asyncHandler(async (req, res) => {
  const { email, password, deviceId } = req.body;
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

  // Check if email is verified
  if (!user.isEmailVerified) {
    return ApiResponse.unauthorizedError(res, 'Please verify your email address before logging in. Check your email for the verification code.');
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

  // Ensure refreshTokens array exists
  if (!user.refreshTokens) {
    user.refreshTokens = [];
  }

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

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ 
    email: email.toLowerCase(),
    isActive: true,
  });

  if (!user) {
    // Don't reveal if user exists or not for security
    return ApiResponse.success(res, null, 'If an account with this email exists, a password reset link has been sent.');
  }

  // Generate password reset code
  const resetCode = user.generatePasswordResetCode();
  await user.save({ validateBeforeSave: false });

  try {
    // Send password reset email
    await sendPasswordResetCode(user, resetCode);
    
    return ApiResponse.success(res, null, 'Password reset code has been sent to your email address.');
  } catch (error) {
    // Clear the reset code if email fails
    user.passwordResetCode = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    
    return ApiResponse.internalServerError(res, 'There was an error sending the password reset code. Please try again.');
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  const { code, password } = req.body;

  // Find user by valid reset code
  const user = await User.findOne({ 
    passwordResetCode: code,
    passwordResetExpires: { $gt: Date.now() },
  });
  
  if (!user) {
    return ApiResponse.error(res, 'Password reset code is invalid or has expired.', 400);
  }

  // Update password and clear reset code
  user.password = password;
  user.passwordResetCode = undefined;
  user.passwordResetExpires = undefined;
  user.passwordResetLastSent = undefined;
  
  await user.save();

  // Clear all refresh tokens to force re-login
  user.refreshTokens = [];
  await user.save();

  return ApiResponse.success(res, null, 'Password has been reset successfully. Please log in with your new password.');
});

const requestEmailVerificationCode = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ 
    email: email.toLowerCase(),
    isActive: true,
  });

  if (!user) {
    return ApiResponse.notFoundError(res, 'User not found.');
  }

  if (user.isEmailVerified) {
    return ApiResponse.error(res, 'Email is already verified.', 400);
  }

  // Check if can resend (3 minutes limit)
  if (!user.canResendEmailVerification()) {
    const waitTime = 3 - Math.floor((Date.now() - user.emailVerificationLastSent.getTime()) / (60 * 1000));
    return ApiResponse.error(res, `Please wait ${waitTime} more minute(s) before requesting a new code.`, 400);
  }

  // Generate email verification code
  const verificationCode = user.generateEmailVerificationCode();
  await user.save({ validateBeforeSave: false });

  try {
    console.log(`Attempting to send verification code to ${user.email}, code: ${verificationCode}`);
    // Send verification email
    const emailResult = await sendEmailVerificationCode(user, verificationCode);
    console.log('Email send result:', emailResult);
    
    return ApiResponse.success(res, null, 'Verification code has been sent to your email address.');
  } catch (error) {
    console.error('Failed to send verification email:', error);
    // Clear the verification code if email fails
    user.emailVerificationCode = undefined;
    user.emailVerificationExpires = undefined;
    user.emailVerificationLastSent = undefined;
    await user.save({ validateBeforeSave: false });
    
    return ApiResponse.internalServerError(res, 'There was an error sending the verification code. Please try again.');
  }
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { code } = req.body;

  // Find user by valid verification code
  const user = await User.findOne({ 
    emailVerificationCode: code,
    emailVerificationExpires: { $gt: Date.now() },
  });
  
  if (!user) {
    return ApiResponse.error(res, 'Email verification code is invalid or has expired.', 400);
  }

  // Update user as verified and clear verification code
  user.isEmailVerified = true;
  user.emailVerificationCode = undefined;
  user.emailVerificationExpires = undefined;
  user.emailVerificationLastSent = undefined;
  user.lastLogin = new Date();
  
  await user.save();

  // Generate tokens
  const tokenPayload = { id: user._id, email: user.email, role: user.role };
  const { accessToken, refreshToken } = jwt.generateTokens(tokenPayload);

  // Add refresh token to user (keep only last 5 tokens)
  user.refreshTokens.push({ token: refreshToken });
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }

  await user.save();

  // Send welcome email after successful verification (don't wait for it)
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
    profilePicture: user.profilePicture,
    lastLogin: user.lastLogin,
  };

  return ApiResponse.success(res, {
    user: userResponse,
    accessToken,
    refreshToken,
  }, 'Email verified successfully. You are now logged in.');
});

const resendPasswordResetCode = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ 
    email: email.toLowerCase(),
    isActive: true,
  });

  if (!user) {
    // Don't reveal if user exists or not for security
    return ApiResponse.success(res, null, 'If an account with this email exists, a password reset code has been sent.');
  }

  // Check if can resend (3 minutes limit)
  if (!user.canResendPasswordReset()) {
    const waitTime = 3 - Math.floor((Date.now() - user.passwordResetLastSent.getTime()) / (60 * 1000));
    return ApiResponse.error(res, `Please wait ${waitTime} more minute(s) before requesting a new code.`, 400);
  }

  // Generate password reset code
  const resetCode = user.generatePasswordResetCode();
  await user.save({ validateBeforeSave: false });

  try {
    // Send password reset email
    await sendPasswordResetCode(user, resetCode);
    
    return ApiResponse.success(res, null, 'Password reset code has been sent to your email address.');
  } catch (error) {
    // Clear the reset code if email fails
    user.passwordResetCode = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetLastSent = undefined;
    await user.save({ validateBeforeSave: false });
    
    return ApiResponse.internalServerError(res, 'There was an error sending the password reset code. Please try again.');
  }
});

const googleSignIn = asyncHandler(async (req, res) => {
  const { idToken, email, firstName, lastName, googleId, photo } = req.body;

  if (!idToken || !email || !googleId) {
    return ApiResponse.error(res, 'Google ID token, email, and Google ID are required', 400);
  }

  try {
    // Initialize Google OAuth client
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    
    // Verify that the email matches
    if (payload.email !== email || payload.sub !== googleId) {
      return ApiResponse.unauthorizedError(res, 'Invalid Google ID token');
    }

    // Check if user already exists
    let user = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { googleId: googleId }
      ],
    });

    // Additional check to ensure googleId uniqueness if provided
    if (!user && googleId) {
      const existingGoogleUser = await User.findOne({ googleId: googleId });
      if (existingGoogleUser && existingGoogleUser.email !== email.toLowerCase()) {
        return ApiResponse.conflictError(res, 'This Google account is already linked to another user');
      }
    }

    if (user) {
      // User exists, update Google ID if not set
      if (!user.googleId) {
        user.googleId = googleId;
        user.profilePicture = photo || user.profilePicture;
        await user.save();
      }
      
      // Update last login
      user.lastLogin = new Date();
      await user.save();
    } else {
      // Create new user
      const userData = {
        email: email.toLowerCase(),
        googleId,
        firstName: firstName || 'User',
        lastName: lastName || '',
        username: Math.random().toString().substring(2, 12), // Random username
        profilePicture: photo,
        lastLogin: new Date(),
        isEmailVerified: true, // Google accounts are pre-verified
      };

      user = await User.create(userData);
      
      // Create signup bonus transaction for new Google users
      const Transaction = require('../models/Transaction');
      const signupTransaction = await Transaction.create({
        userId: user._id,
        type: 'signup_bonus',
        amount: 0,
        creditsAdded: 1,
        description: 'Welcome Bonus - Free Credit (Google Sign-Up)',
        status: 'completed',
        metadata: {
          bonusType: 'google_signup',
          googleId: googleId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        },
      });
      
      // Send welcome email (don't wait for it)
      sendWelcomeEmail(user).catch(err => {
        console.error('Failed to send welcome email:', err);
      });
    }

    // Generate tokens
    const tokenPayload = { id: user._id, email: user.email, role: user.role };
    const { accessToken, refreshToken } = jwt.generateTokens(tokenPayload);

    // Add refresh token to user
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
      createdAt: user.createdAt,
    };

    return ApiResponse.success(res, {
      user: userResponse,
      accessToken,
      refreshToken,
    }, user.isNew ? 'Account created successfully with Google' : 'Google sign-in successful');

  } catch (error) {
    console.error('Google sign-in error:', error);
    return ApiResponse.unauthorizedError(res, 'Invalid Google ID token');
  }
});

module.exports = {
  register,
  login,
  googleSignIn,
  refreshToken,
  logout,
  logoutAll,
  getProfile,
  verifyToken,
  changePassword,
  deleteAccount,
  forgotPassword,
  resetPassword,
  requestEmailVerificationCode,
  verifyEmail,
  resendPasswordResetCode,
};