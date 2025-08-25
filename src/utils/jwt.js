const jwt = require('jsonwebtoken');
const config = require('../config');

const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: 'mobile-app-api',
    audience: 'mobile-app',
  });

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
    issuer: 'mobile-app-api',
    audience: 'mobile-app',
  });

  return { accessToken, refreshToken };
};

const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret, {
      issuer: 'mobile-app-api',
      audience: 'mobile-app',
    });
  } catch (error) {
    throw new Error('Invalid access token');
  }
};

const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret, {
      issuer: 'mobile-app-api',
      audience: 'mobile-app',
    });
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
};

const decodeToken = (token) => {
  return jwt.decode(token, { complete: true });
};

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
};