// config/db.js
import mongoose from 'mongoose';

// ✅ Validate required environment variables on startup
const validateEnvVars = () => {
  const required = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
};

const connectDB = async () => {
  validateEnvVars();

  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    // ✅ Never log the full host (can expose cloud credentials)
    const host = conn.connection.host.replace(/mongodb(\+srv)?:\/\/[^@]+@/, '***:***@');
    console.log(`✅ MongoDB Connected Successfully`);

    // ✅ Handle connection errors after initial connection
    mongoose.connection.on('error', (err) => {
      // ✅ Never expose full error (may contain connection string)
      console.error(`❌ MongoDB Error: ${err.name || 'Connection error occurred'}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB Disconnected - Attempting reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB Reconnected');
    });

    // ✅ Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed on app termination');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed on SIGTERM');
      process.exit(0);
    });

  } catch (error) {
    // ✅ Only log error type, not full message (may contain credentials)
    console.error(`❌ MongoDB Connection Failed: ${error.name || 'Unknown error'}`);
    process.exit(1);
  }
};

export default connectDB;