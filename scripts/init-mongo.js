// MongoDB initialization script
print('Initializing mobile-app-api-new database...');

// Switch to the mobile-app-api-new database
db = db.getSiblingDB('mobile-app-api-new');

// Create application user with read/write permissions
db.createUser({
  user: 'api_user',
  pwd: 'api_password',
  roles: [
    {
      role: 'readWrite',
      db: 'mobile-app-api-new'
    }
  ]
});

// Create indexes for better performance
print('Creating indexes...');

// User indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ deviceId: 1 });
db.users.createIndex({ createdAt: -1 });
db.users.createIndex({ isPremium: 1, premiumExpiresAt: 1 });

// Generation indexes
db.generations.createIndex({ userId: 1, createdAt: -1 });
db.generations.createIndex({ status: 1 });
db.generations.createIndex({ externalJobId: 1 });
db.generations.createIndex({ createdAt: -1 });

// Transaction indexes
db.transactions.createIndex({ userId: 1, createdAt: -1 });
db.transactions.createIndex({ status: 1 });
db.transactions.createIndex({ type: 1 });
db.transactions.createIndex({ paymentId: 1 });
db.transactions.createIndex({ stripePaymentIntentId: 1 });

// AdWatch indexes
db.adwatches.createIndex({ userId: 1, createdAt: -1 });
db.adwatches.createIndex({ userId: 1, watchedAt: -1, status: 1, rewardCredited: 1 });
db.adwatches.createIndex({ ipAddress: 1, createdAt: -1 });
db.adwatches.createIndex({ deviceId: 1, createdAt: -1 });
db.adwatches.createIndex({ status: 1 });

print('Database initialization completed!');