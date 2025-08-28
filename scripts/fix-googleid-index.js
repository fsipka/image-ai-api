const mongoose = require('mongoose');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mobile-app-api');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
};

const fixGoogleIdIndex = async () => {
  try {
    await connectDB();
    
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    
    console.log('Checking existing indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique, sparse: idx.sparse })));
    
    // Drop the existing googleId index if it exists
    try {
      await collection.dropIndex('googleId_1');
      console.log('Dropped existing googleId_1 index');
    } catch (error) {
      if (error.codeName === 'IndexNotFound') {
        console.log('googleId_1 index does not exist, continuing...');
      } else {
        console.log('Error dropping index:', error.message);
      }
    }
    
    // Create new sparse unique index
    await collection.createIndex({ googleId: 1 }, { unique: true, sparse: true, name: 'googleId_1_sparse' });
    console.log('Created new sparse unique index for googleId');
    
    console.log('Checking updated indexes...');
    const updatedIndexes = await collection.indexes();
    console.log('Updated indexes:', updatedIndexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique, sparse: idx.sparse })));
    
    console.log('Index fix completed successfully!');
    
  } catch (error) {
    console.error('Error fixing googleId index:', error);
  } finally {
    await mongoose.connection.close();
  }
};

fixGoogleIdIndex();