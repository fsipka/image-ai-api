const stripe = require('stripe')(require('../config').stripe.secretKey);
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { sendPremiumUpgradeEmail } = require('../utils/email');
const config = require('../config');

// Credit packages configuration
const CREDIT_PACKAGES = {
  small: {
    id: 'small',
    name: '10 Credits',
    credits: 10,
    price: 199, // $1.99 in cents
    description: 'Perfect for trying out the app',
  },
  medium: {
    id: 'medium',
    name: '50 Credits',
    credits: 50,
    price: 799, // $7.99 in cents
    description: 'Most popular package',
    discount: 20, // 20% discount
  },
  large: {
    id: 'large',
    name: '100 Credits',
    credits: 100,
    price: 1299, // $12.99 in cents
    description: 'Best value for heavy users',
    discount: 35, // 35% discount
  },
  premium: {
    id: 'premium',
    name: 'Premium Monthly',
    credits: 0, // Unlimited
    price: config.premium.price, // $9.99 in cents
    description: 'Unlimited generations for 30 days',
    isPremium: true,
  },
};

const getCreditPackages = asyncHandler(async (req, res) => {
  const packages = Object.values(CREDIT_PACKAGES).map(pkg => ({
    ...pkg,
    priceFormatted: `$${(pkg.price / 100).toFixed(2)}`,
    originalPrice: pkg.discount ? Math.round(pkg.price / (1 - pkg.discount / 100)) : null,
  }));

  return ApiResponse.success(res, { packages }, 'Credit packages retrieved successfully');
});

const createPaymentIntent = asyncHandler(async (req, res) => {
  const user = req.user;
  const { packageId, paymentMethodId } = req.body;

  // Validate package
  const selectedPackage = CREDIT_PACKAGES[packageId];
  if (!selectedPackage) {
    return ApiResponse.validationError(res, [{
      field: 'packageId',
      message: 'Invalid package ID',
    }]);
  }

  try {
    // Create transaction record
    const transactionData = {
      userId: user._id,
      type: selectedPackage.isPremium ? 'premium_subscription' : 'credit_purchase',
      amount: selectedPackage.price,
      creditsAdded: selectedPackage.credits,
      description: selectedPackage.name,
      status: 'pending',
      metadata: {
        packageName: selectedPackage.name,
        originalPrice: selectedPackage.discount ? Math.round(selectedPackage.price / (1 - selectedPackage.discount / 100)) : selectedPackage.price,
        discount: selectedPackage.discount || 0,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    };

    const transaction = await Transaction.create(transactionData);

    // Create Stripe payment intent
    const paymentIntentData = {
      amount: selectedPackage.price,
      currency: 'usd',
      customer: user.stripeCustomerId,
      metadata: {
        userId: user._id.toString(),
        transactionId: transaction._id.toString(),
        packageId: packageId,
      },
      description: `${selectedPackage.name} for ${user.email}`,
    };

    // If payment method is provided, confirm immediately
    if (paymentMethodId) {
      paymentIntentData.payment_method = paymentMethodId;
      paymentIntentData.confirm = true;
      paymentIntentData.return_url = `${process.env.FRONTEND_URL || 'https://yourapp.com'}/payment/success`;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    // Update transaction with Stripe payment intent ID
    transaction.stripePaymentIntentId = paymentIntent.id;
    await transaction.save();

    logger.info(`Payment intent created: ${paymentIntent.id} for user ${user._id}`);

    return ApiResponse.created(res, {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      transactionId: transaction._id,
      package: selectedPackage,
    }, 'Payment intent created successfully');

  } catch (error) {
    logger.error('Payment intent creation failed:', error);
    
    if (error.type === 'StripeCardError') {
      return ApiResponse.validationError(res, [{
        field: 'payment',
        message: error.message,
      }]);
    }

    return ApiResponse.serverError(res, 'Failed to create payment intent');
  }
});

const confirmPayment = asyncHandler(async (req, res) => {
  const user = req.user;
  const { paymentIntentId } = req.body;

  try {
    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata.userId !== user._id.toString()) {
      return ApiResponse.forbiddenError(res, 'Payment intent does not belong to user');
    }

    const transaction = await Transaction.findById(paymentIntent.metadata.transactionId);
    if (!transaction) {
      return ApiResponse.notFoundError(res, 'Transaction not found');
    }

    if (paymentIntent.status === 'succeeded' && transaction.status === 'pending') {
      // Payment successful - process the transaction
      await processSuccessfulPayment(transaction, paymentIntent);
      
      return ApiResponse.success(res, {
        transactionId: transaction._id,
        status: 'completed',
      }, 'Payment confirmed successfully');
    }

    return ApiResponse.success(res, {
      transactionId: transaction._id,
      status: paymentIntent.status,
    }, `Payment status: ${paymentIntent.status}`);

  } catch (error) {
    logger.error('Payment confirmation failed:', error);
    return ApiResponse.serverError(res, 'Failed to confirm payment');
  }
});

const handleStripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    logger.error('Stripe webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionCancelled(event.data.object);
        break;
      
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Stripe webhook processing failed:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

const getPaymentHistory = asyncHandler(async (req, res) => {
  const user = req.user;
  const { page = 1, limit = 10 } = req.query;

  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    Transaction.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-userId'),
    Transaction.countDocuments({ userId: user._id }),
  ]);

  return ApiResponse.paginated(res, transactions, {
    page: parseInt(page),
    limit: parseInt(limit),
    total,
  }, 'Payment history retrieved successfully');
});

const refundPayment = asyncHandler(async (req, res) => {
  const user = req.user;
  const { transactionId, reason } = req.body;

  const transaction = await Transaction.findOne({
    _id: transactionId,
    userId: user._id,
    status: 'completed',
  });

  if (!transaction) {
    return ApiResponse.notFoundError(res, 'Transaction not found');
  }

  // Check if refund is allowed (within 24 hours for example)
  const hoursAgo24 = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (transaction.processedAt < hoursAgo24) {
    return ApiResponse.validationError(res, [{
      field: 'transaction',
      message: 'Refunds are only allowed within 24 hours of purchase',
    }]);
  }

  try {
    // Create refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: transaction.stripePaymentIntentId,
      reason: 'requested_by_customer',
      metadata: {
        reason: reason || 'User requested refund',
        userId: user._id.toString(),
      },
    });

    // Process refund
    await processRefund(transaction, refund);

    return ApiResponse.success(res, {
      refundId: refund.id,
      transactionId: transaction._id,
    }, 'Refund processed successfully');

  } catch (error) {
    logger.error('Refund processing failed:', error);
    return ApiResponse.serverError(res, 'Failed to process refund');
  }
});

// Helper functions
const processSuccessfulPayment = async (transaction, paymentIntent) => {
  try {
    const user = await User.findById(transaction.userId);
    const packageId = paymentIntent.metadata.packageId;
    const selectedPackage = CREDIT_PACKAGES[packageId];

    if (selectedPackage.isPremium) {
      // Activate premium subscription
      await user.activatePremium(30); // 30 days
      await user.addCredits(config.premium.credits);
      
      // Send premium upgrade email
      sendPremiumUpgradeEmail(user).catch(err => {
        logger.error('Failed to send premium upgrade email:', err);
      });
    } else {
      // Add credits
      await user.addCredits(selectedPackage.credits);
    }

    // Complete transaction
    await transaction.complete();

    logger.info(`Payment processed successfully: ${paymentIntent.id} for user ${user._id}`);
  } catch (error) {
    logger.error('Payment processing failed:', error);
    await transaction.fail('Payment processing failed');
    throw error;
  }
};

const handlePaymentIntentSucceeded = async (paymentIntent) => {
  const transaction = await Transaction.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (transaction && transaction.status === 'pending') {
    await processSuccessfulPayment(transaction, paymentIntent);
  }
};

const handlePaymentIntentFailed = async (paymentIntent) => {
  const transaction = await Transaction.findOne({
    stripePaymentIntentId: paymentIntent.id,
  });

  if (transaction && transaction.status === 'pending') {
    await transaction.fail('Payment failed');
    logger.info(`Payment failed: ${paymentIntent.id}`);
  }
};

const handleSubscriptionUpdate = async (subscription) => {
  // Handle subscription updates if you implement recurring subscriptions
  logger.info(`Subscription updated: ${subscription.id}`);
};

const handleSubscriptionCancelled = async (subscription) => {
  // Handle subscription cancellations
  logger.info(`Subscription cancelled: ${subscription.id}`);
};

const processRefund = async (transaction, refund) => {
  const user = await User.findById(transaction.userId);
  
  // Deduct credits if they were added
  if (transaction.creditsAdded > 0) {
    const creditsToDeduct = Math.min(user.credits, transaction.creditsAdded);
    await User.findByIdAndUpdate(user._id, {
      $inc: { credits: -creditsToDeduct },
    });
  }

  // Deactivate premium if it was a premium purchase
  if (transaction.type === 'premium_subscription') {
    user.isPremium = false;
    user.premiumExpiresAt = null;
    await user.save();
  }

  // Update transaction status
  await transaction.refund();

  logger.info(`Refund processed: ${refund.id} for transaction ${transaction._id}`);
};

module.exports = {
  getCreditPackages,
  createPaymentIntent,
  confirmPayment,
  handleStripeWebhook,
  getPaymentHistory,
  refundPayment,
};