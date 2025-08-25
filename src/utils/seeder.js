require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Generation = require('../models/Generation');
const Transaction = require('../models/Transaction');
const AdWatch = require('../models/AdWatch');
const connectDB = require('../config/database');
const { logger } = require('./logger');

const seedData = {
  users: [
    {
      email: 'admin@example.com',
      password: 'admin123',
      username: 'admin',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      credits: 1000,
      isPremium: true,
      premiumExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
    },
    {
      email: 'john@example.com',
      password: 'password123',
      username: 'johndoe',
      firstName: 'John',
      lastName: 'Doe',
      credits: 10,
    },
    {
      email: 'jane@example.com',
      password: 'password123',
      username: 'janesmith',
      firstName: 'Jane',
      lastName: 'Smith',
      credits: 25,
      isPremium: true,
      premiumExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    },
    {
      email: 'bob@example.com',
      password: 'password123',
      username: 'bobwilson',
      firstName: 'Bob',
      lastName: 'Wilson',
      credits: 5,
    },
  ],
};

const seedUsers = async () => {
  try {
    // Clear existing users
    await User.deleteMany({});
    logger.info('Cleared existing users');

    // Create new users
    const users = await User.create(seedData.users);
    logger.info(`Created ${users.length} users`);

    return users;
  } catch (error) {
    logger.error('Error seeding users:', error);
    throw error;
  }
};

const seedGenerations = async (users) => {
  try {
    // Clear existing generations
    await Generation.deleteMany({});
    logger.info('Cleared existing generations');

    const generations = [];
    const statuses = ['pending', 'processing', 'completed', 'failed'];
    const models = ['fal-ai', 'custom-model-1', 'custom-model-2'];
    const prompts = [
      'A beautiful sunset over mountains',
      'A futuristic city with flying cars',
      'A peaceful forest with a river',
      'A cyberpunk street scene at night',
      'An ancient castle on a hill',
    ];

    for (let i = 0; i < 20; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const model = models[Math.floor(Math.random() * models.length)];
      const prompt = prompts[Math.floor(Math.random() * prompts.length)];

      const generationData = {
        userId: user._id,
        originalImageUrl: `https://example.com/uploads/image-${i + 1}.jpg`,
        prompt: prompt + ` - variation ${i + 1}`,
        modelUsed: model,
        creditsUsed: Math.floor(Math.random() * 3) + 1,
        status,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
      };

      if (status === 'completed') {
        generationData.generatedImageUrls = [
          `https://example.com/generated/result-${i + 1}-1.jpg`,
          `https://example.com/generated/result-${i + 1}-2.jpg`,
        ];
        generationData.processingTimeMs = Math.random() * 120000 + 30000; // 30s to 2.5min
        generationData.completedAt = new Date(generationData.createdAt.getTime() + generationData.processingTimeMs);
      } else if (status === 'failed') {
        generationData.failureReason = 'AI service temporarily unavailable';
        generationData.completedAt = new Date(generationData.createdAt.getTime() + Math.random() * 60000);
      } else if (status === 'processing') {
        generationData.processingStartedAt = new Date();
      }

      generations.push(generationData);
    }

    const createdGenerations = await Generation.create(generations);
    logger.info(`Created ${createdGenerations.length} generations`);

    return createdGenerations;
  } catch (error) {
    logger.error('Error seeding generations:', error);
    throw error;
  }
};

const seedTransactions = async (users) => {
  try {
    // Clear existing transactions
    await Transaction.deleteMany({});
    logger.info('Cleared existing transactions');

    const transactions = [];
    const types = ['credit_purchase', 'ad_watch', 'premium_subscription', 'bonus'];
    const creditPackages = [
      { credits: 10, amount: 199 },
      { credits: 50, amount: 799 },
      { credits: 100, amount: 1299 },
    ];

    for (let i = 0; i < 15; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const type = types[Math.floor(Math.random() * types.length)];
      let transactionData = {
        userId: user._id,
        type,
        status: 'completed',
        processedAt: new Date(),
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
      };

      switch (type) {
        case 'credit_purchase':
          const pack = creditPackages[Math.floor(Math.random() * creditPackages.length)];
          transactionData.amount = pack.amount;
          transactionData.creditsAdded = pack.credits;
          transactionData.description = `${pack.credits} Credits Package`;
          break;
        
        case 'ad_watch':
          transactionData.amount = 0;
          transactionData.creditsAdded = 1;
          transactionData.description = 'Ad watch reward';
          break;
        
        case 'premium_subscription':
          transactionData.amount = 999; // $9.99
          transactionData.creditsAdded = 100;
          transactionData.description = 'Premium Monthly Subscription';
          break;
        
        case 'bonus':
          transactionData.amount = 0;
          transactionData.creditsAdded = Math.floor(Math.random() * 10) + 5;
          transactionData.description = 'Welcome bonus credits';
          break;
      }

      transactions.push(transactionData);
    }

    const createdTransactions = await Transaction.create(transactions);
    logger.info(`Created ${createdTransactions.length} transactions`);

    return createdTransactions;
  } catch (error) {
    logger.error('Error seeding transactions:', error);
    throw error;
  }
};

const seedAdWatches = async (users) => {
  try {
    // Clear existing ad watches
    await AdWatch.deleteMany({});
    logger.info('Cleared existing ad watches');

    const adWatches = [];
    const statuses = ['completed', 'abandoned', 'fraud_detected'];
    const providers = ['admob', 'facebook', 'unity'];

    for (let i = 0; i < 25; i++) {
      const user = users[Math.floor(Math.random() * users.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const provider = providers[Math.floor(Math.random() * providers.length)];

      const adWatchData = {
        userId: user._id,
        adId: `ad_${provider}_${i + 1}`,
        adProvider: provider,
        status,
        watchedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random date within last 7 days
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Mobile App)',
        requiredDurationMs: 30000,
      };

      if (status === 'completed') {
        adWatchData.rewardCredited = true;
        adWatchData.creditsEarned = 1;
        adWatchData.watchDurationMs = Math.random() * 5000 + 30000; // 30-35 seconds
        adWatchData.completedAt = new Date(adWatchData.watchedAt.getTime() + adWatchData.watchDurationMs);
      } else if (status === 'abandoned') {
        adWatchData.rewardCredited = false;
        adWatchData.creditsEarned = 0;
        adWatchData.watchDurationMs = Math.random() * 20000 + 5000; // 5-25 seconds
      } else if (status === 'fraud_detected') {
        adWatchData.rewardCredited = false;
        adWatchData.creditsEarned = 0;
        adWatchData.fraudScore = Math.random() * 0.3 + 0.7; // 0.7-1.0
        adWatchData.watchDurationMs = Math.random() * 1000 + 500; // Very short watch time
      }

      adWatches.push(adWatchData);
    }

    const createdAdWatches = await AdWatch.create(adWatches);
    logger.info(`Created ${createdAdWatches.length} ad watches`);

    return createdAdWatches;
  } catch (error) {
    logger.error('Error seeding ad watches:', error);
    throw error;
  }
};

const seedDatabase = async () => {
  try {
    logger.info('Starting database seeding...');
    
    // Connect to database
    await connectDB();

    // Seed data in order
    const users = await seedUsers();
    const generations = await seedGenerations(users);
    const transactions = await seedTransactions(users);
    const adWatches = await seedAdWatches(users);

    logger.info('Database seeding completed successfully!');
    logger.info('Sample accounts created:');
    logger.info('Admin: admin@example.com / admin123');
    logger.info('User 1: john@example.com / password123');
    logger.info('User 2: jane@example.com / password123 (Premium)');
    logger.info('User 3: bob@example.com / password123');

    process.exit(0);
  } catch (error) {
    logger.error('Database seeding failed:', error);
    process.exit(1);
  }
};

const clearDatabase = async () => {
  try {
    logger.info('Starting database clearing...');
    
    // Connect to database
    await connectDB();

    // Clear all collections
    await Promise.all([
      User.deleteMany({}),
      Generation.deleteMany({}),
      Transaction.deleteMany({}),
      AdWatch.deleteMany({}),
    ]);

    logger.info('Database cleared successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Database clearing failed:', error);
    process.exit(1);
  }
};

// Check command line arguments
if (process.argv[2] === 'clear') {
  clearDatabase();
} else if (process.argv[2] === 'seed' || !process.argv[2]) {
  seedDatabase();
} else {
  console.log('Usage: node seeder.js [seed|clear]');
  console.log('  seed (default): Populate database with sample data');
  console.log('  clear: Clear all data from database');
  process.exit(1);
}

module.exports = {
  seedDatabase,
  clearDatabase,
  seedUsers,
  seedGenerations,
  seedTransactions,
  seedAdWatches,
};