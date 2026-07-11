const mongoose = require('mongoose');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    price: {
      monthly: { type: Number, required: true, default: 0 },
      yearly: { type: Number, required: true, default: 0 },
    },
    limits: {
      students: { type: Number, default: -1 },        // -1 = unlimited
      instructors: { type: Number, default: -1 },
      courses: { type: Number, default: -1 },
      storageGB: { type: Number, default: 5 },
      maxSessions: { type: Number, default: 2 },
      streamStorageMinutes: { type: Number, default: 0 }, // 0 = Cloudflare Stream locked (Free)
      streamViewerMinutes:  { type: Number, default: 0 }, // per billing month
    },
    features: [{ type: String }],
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true },
    trialDays: { type: Number, default: 0 },
    dbMode: {
      type: String,
      enum: ['shared', 'dedicated'],
      default: 'shared',
    },
  },
  { timestamps: true }
);

planSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Plan', planSchema);
