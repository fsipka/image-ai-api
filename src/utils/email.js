const nodemailer = require('nodemailer');
const config = require('../config');
const { logger } = require('./logger');

let transporter = null;

if (config.email.host && config.email.user && config.email.pass) {
  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });

  // Verify transporter configuration
  transporter.verify((error, success) => {
    if (error) {
      logger.error('Email transporter verification failed:', error);
    } else {
      logger.info('Email transporter is ready');
    }
  });
}

const sendEmail = async (options) => {
  if (!transporter) {
    logger.warn('Email transporter not configured, email not sent');
    return false;
  }

  const mailOptions = {
    from: `Mobile App API <${config.email.user}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${options.to}: ${info.messageId}`);
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
};

const sendWelcomeEmail = async (user) => {
  const subject = 'Welcome to Mobile App!';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to Mobile App, ${user.firstName}!</h2>
      <p>Thank you for joining our community. You're all set to start generating amazing AI-powered images!</p>
      
      <div style="background-color: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px;">
        <h3 style="color: #007bff; margin-top: 0;">Getting Started</h3>
        <ul style="color: #555;">
          <li>You start with <strong>5 free credits</strong></li>
          <li>Each generation typically uses 1-2 credits</li>
          <li>Watch ads to earn more credits</li>
          <li>Upgrade to premium for unlimited generations</li>
        </ul>
      </div>
      
      <p style="color: #555;">
        If you have any questions, feel free to reach out to our support team.
      </p>
      
      <p style="margin-top: 30px; color: #888; font-size: 14px;">
        Happy creating!<br>
        The Mobile App Team
      </p>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject,
    html,
    text: `Welcome to Mobile App, ${user.firstName}! Thank you for joining our community.`,
  });
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'https://yourapp.com'}/reset-password?token=${resetToken}`;
  
  const subject = 'Password Reset Request';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Password Reset Request</h2>
      <p>Hi ${user.firstName},</p>
      
      <p>You recently requested to reset your password. Click the button below to reset it:</p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Reset Password
        </a>
      </div>
      
      <p style="color: #555;">
        If the button doesn't work, you can copy and paste this link into your browser:
      </p>
      <p style="word-break: break-all; color: #007bff;">${resetUrl}</p>
      
      <p style="color: #888; font-size: 14px; margin-top: 30px;">
        This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
      </p>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.firstName}, you requested to reset your password. Visit this link: ${resetUrl}`,
  });
};

const sendPremiumUpgradeEmail = async (user) => {
  const subject = 'Welcome to Premium!';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #28a745;">🎉 Welcome to Premium!</h2>
      <p>Hi ${user.firstName},</p>
      
      <p>Congratulations! Your premium subscription is now active.</p>
      
      <div style="background-color: #d4edda; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745;">
        <h3 style="color: #155724; margin-top: 0;">Premium Benefits</h3>
        <ul style="color: #155724;">
          <li>✅ Unlimited AI generations</li>
          <li>✅ Priority processing</li>
          <li>✅ Access to premium models</li>
          <li>✅ Higher resolution outputs</li>
          <li>✅ Priority customer support</li>
        </ul>
      </div>
      
      <p style="color: #555;">
        Start creating amazing content with your premium features today!
      </p>
      
      <p style="margin-top: 30px; color: #888; font-size: 14px;">
        Thank you for your support!<br>
        The Mobile App Team
      </p>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.firstName}, your premium subscription is now active! Enjoy unlimited AI generations and premium features.`,
  });
};

const sendLowCreditsNotification = async (user) => {
  const subject = 'Running Low on Credits';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ffc107;">⚠️ You're Running Low on Credits</h2>
      <p>Hi ${user.firstName},</p>
      
      <p>You currently have <strong>${user.credits} credits</strong> remaining.</p>
      
      <div style="background-color: #fff3cd; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #ffc107;">
        <h3 style="color: #856404; margin-top: 0;">Get More Credits</h3>
        <ul style="color: #856404;">
          <li>Watch ads to earn free credits</li>
          <li>Purchase credit packages</li>
          <li>Upgrade to premium for unlimited use</li>
        </ul>
      </div>
      
      <p style="color: #555;">
        Don't let your creativity stop! Get more credits today.
      </p>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.firstName}, you're running low on credits (${user.credits} remaining). Watch ads or purchase credits to continue creating.`,
  });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPremiumUpgradeEmail,
  sendLowCreditsNotification,
};