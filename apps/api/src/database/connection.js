const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../utils/logger');

const connections = new Map();

const defaultOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

async function connectDefault() {
  if (connections.has('default')) return connections.get('default');

  await mongoose.connect(config.mongodb.uri, defaultOptions);
  connections.set('default', mongoose.connection);
  logger.info('MongoDB default connection established');
  return mongoose.connection;
}

async function connectTenant(tenantId, uri) {
  if (connections.has(tenantId)) return connections.get(tenantId);

  const conn = await mongoose.createConnection(uri, defaultOptions).asPromise();
  connections.set(tenantId, conn);
  logger.info(`MongoDB dedicated connection established for tenant: ${tenantId}`);
  return conn;
}

function getConnection(tenantId = 'default') {
  const conn = connections.get(tenantId);
  if (!conn) throw new Error(`No DB connection found for: ${tenantId}`);
  return conn;
}

async function closeAll() {
  for (const [key, conn] of connections.entries()) {
    await conn.close();
    logger.info(`Closed MongoDB connection: ${key}`);
  }
  connections.clear();
}

module.exports = { connectDefault, connectTenant, getConnection, closeAll };
