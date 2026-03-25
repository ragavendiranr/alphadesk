'use strict';
const mongoose = require('mongoose');

let isConnected = false;
let lastError   = null;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || 'Alphadesk_Trading';

  try {
    await mongoose.connect(uri, {
      dbName,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS:          60000,
      connectTimeoutMS:         30000,
      heartbeatFrequencyMS:     10000,
      bufferTimeoutMS:          60000,  // wait up to 60s for reconnect before failing buffered ops
      maxPoolSize:              10,
      minPoolSize:              2,      // keep 2 connections alive to survive Atlas idle timeouts
      maxIdleTimeMS:            270000, // close idle connections after 4.5 min (Atlas limit is 5 min)
    });
    isConnected = true;
    console.log(`✅ MongoDB connected → ${dbName}`);

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('⚠️  MongoDB disconnected — reconnecting...');
      setTimeout(connectDB, 5000);
    });

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB error:', err.message);
    });
  } catch (err) {
    lastError = err.message;
    console.error('❌ MongoDB connection failed:', err.message);
    setTimeout(connectDB, 10000);
  }
}

module.exports = { connectDB, mongoose, getLastError: () => lastError };
