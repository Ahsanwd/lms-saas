// One-time index migration for the per-instructor Zoom OAuth redesign.
// ZoomCredential moved from a single unique index on {tenantId} to a
// compound unique index on {tenantId, userId} (null userId = tenant's
// shared fallback, a real user id = that instructor's own account).
// Mongoose's syncIndexes() reconciles the live collection to match the
// current schema — drops the old index, creates the new one. Safe to
// re-run (no-ops once indexes already match).
//
// Usage: node src/scripts/migrateZoomCredentialIndex.js
require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const config = require('../config');

async function migrate() {
  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to MongoDB');

  const ZoomCredential = require('../database/models/ZoomCredential.model');

  console.log('Indexes before:', await ZoomCredential.collection.indexes());

  const result = await ZoomCredential.syncIndexes();
  console.log('syncIndexes result:', result);

  console.log('Indexes after:', await ZoomCredential.collection.indexes());

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
