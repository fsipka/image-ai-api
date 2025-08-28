const mongoose = require('mongoose');
require('dotenv').config();

const fixGoogleIdIndex = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mobile-app-api');
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collection = db.collection('users');
    
    console.log('Checking existing indexes...');
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(idx => ({ 
      name: idx.name, 
      key: idx.key, 
      unique: idx.unique, 
      sparse: idx.sparse 
    })));
    
    // Try to drop the existing googleId index
    try {
      await collection.dropIndex({ googleId: 1 });
      console.log('Dropped existing googleId index');
    } catch (error) {
      if (error.codeName === 'IndexNotFound') {
        console.log('No existing googleId index found');
      } else {
        console.log('Error dropping index:', error.message);
      }
    }
    
    // Create new sparse unique index for googleId
    await collection.createIndex(
      { googleId: 1 }, 
      { 
        unique: true, 
        sparse: true,
        name: 'googleId_1_sparse'
      }
    );
    console.log('Created new sparse unique index for googleId');
    
    // Verify the new index
    const updatedIndexes = await collection.indexes();
    const googleIdIndex = updatedIndexes.find(idx => idx.key.googleId === 1);
    console.log('New googleId index:', googleIdIndex);
    
    console.log('Index fix completed successfully!');
    
  } catch (error) {
    console.error('Error fixing googleId index:', error);
  } finally {
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
};

// Run the fix
fixGoogleIdIndex();