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
  const subject = 'Welcome to AI Image Generator! 🎨';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
        <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
          <div style="font-size: 40px;">🎨</div>
        </div>
        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Welcome to AI Image Generator!</h1>
        <p style="color: rgba(255, 255, 255, 0.9); margin: 12px 0 0; font-size: 16px;">Hi ${user.firstName}, you're all set!</p>
      </div>
      
      <div style="padding: 40px 20px;">
        <p style="font-size: 16px; color: #374151; line-height: 24px; margin-bottom: 32px;">
          Thank you for joining our community of creative minds! You now have access to powerful AI image generation tools that will help bring your imagination to life.
        </p>
        
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 24px; margin: 32px 0;">
          <h3 style="color: white; margin: 0 0 20px; font-size: 20px; font-weight: 600;">🚀 Getting Started</h3>
          <div style="color: rgba(255, 255, 255, 0.95); font-size: 15px; line-height: 24px;">
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 12px; font-weight: 600;">1</span>
              You start with <strong>1 free credit</strong> to test our service
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 12px; font-weight: 600;">2</span>
              Each generation typically uses 1-2 credits
            </div>
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
              <span style="background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 12px; font-weight: 600;">3</span>
              Watch ads to earn more credits for free
            </div>
            <div style="display: flex; align-items: center;">
              <span style="background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; font-size: 12px; font-weight: 600;">4</span>
              Upgrade to premium for unlimited generations
            </div>
          </div>
        </div>
        
        <div style="background-color: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 8px; padding: 20px; margin: 32px 0;">
          <h4 style="color: #0369a1; margin: 0 0 12px; font-size: 16px; font-weight: 600;">💡 Pro Tips</h4>
          <ul style="color: #0c4a6e; margin: 0; padding-left: 16px; font-size: 14px; line-height: 20px;">
            <li style="margin-bottom: 8px;">Be specific in your prompts for better results</li>
            <li style="margin-bottom: 8px;">Experiment with different styles and moods</li>
            <li>Use the advanced settings to fine-tune your images</li>
          </ul>
        </div>
        
        <p style="font-size: 16px; color: #374151; line-height: 24px; margin: 32px 0;">
          If you have any questions or need help getting started, our support team is here to assist you.
        </p>
        
        <div style="text-align: center; margin: 40px 0;">
          <p style="font-size: 18px; color: #374151; margin: 0; font-weight: 600;">Happy creating! ✨</p>
          <p style="font-size: 14px; color: #9ca3af; margin: 8px 0 0;">The AI Image Generator Team</p>
        </div>
      </div>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject,
    html,
    text: `Welcome to AI Image Generator, ${user.firstName}! Thank you for joining our community. You're all set to start creating amazing AI-powered images!`,
  });
};

const sendEmailVerificationCode = async (user, verificationCode) => {
  const subject = 'Email Verification Code';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
        <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
          <div style="font-size: 40px;">📧</div>
        </div>
        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Email Verification</h1>
      </div>
      
      <div style="padding: 40px 20px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">
          Hi <strong>${user.firstName}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; line-height: 24px; margin-bottom: 32px;">
          Thank you for signing up! Please enter the verification code below in the app to complete your registration and start generating amazing AI images.
        </p>
        
        <div style="text-align: center; margin: 32px 0;">
          <div style="background-color: #f8fafc; border: 2px dashed #667eea; border-radius: 12px; padding: 24px; display: inline-block;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280; font-weight: 600;">Your Verification Code</p>
            <div style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 4px;">${verificationCode}</div>
          </div>
        </div>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 32px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            <strong>⏰ Important:</strong> This code will expire in 15 minutes. If you didn't request this code, please ignore this email.
          </p>
        </div>
        
        <p style="font-size: 14px; color: #9ca3af; text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          The AI Image Generator Team
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.firstName}, your email verification code is: ${verificationCode}. This code will expire in 15 minutes.`,
  });
};

const sendPasswordResetCode = async (user, resetCode) => {
  const subject = 'Password Reset Code';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 40px 20px; text-align: center;">
        <div style="background-color: white; width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
          <div style="font-size: 40px;">🔐</div>
        </div>
        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Password Reset Code</h1>
      </div>
      
      <div style="padding: 40px 20px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 24px;">
          Hi <strong>${user.firstName}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; line-height: 24px; margin-bottom: 32px;">
          We received a request to reset your password. Please enter the reset code below in the app to continue with resetting your password.
        </p>
        
        <div style="text-align: center; margin: 32px 0;">
          <div style="background-color: #fef2f2; border: 2px dashed #f5576c; border-radius: 12px; padding: 24px; display: inline-block;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280; font-weight: 600;">Your Reset Code</p>
            <div style="font-family: 'Courier New', monospace; font-size: 32px; font-weight: bold; color: #f5576c; letter-spacing: 4px;">${resetCode}</div>
          </div>
        </div>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 32px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #92400e;">
            <strong>⏰ Important:</strong> This code will expire in 15 minutes. If you didn't request this password reset, please ignore this email.
          </p>
        </div>
        
        <p style="font-size: 14px; color: #9ca3af; text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          The AI Image Generator Team
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.firstName}, your password reset code is: ${resetCode}. This code will expire in 15 minutes.`,
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
  sendEmailVerificationCode,
  sendPasswordResetCode,
  sendPremiumUpgradeEmail,
  sendLowCreditsNotification,
};