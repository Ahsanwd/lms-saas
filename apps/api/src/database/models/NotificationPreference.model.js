const mongoose = require('mongoose');

// Stores per-user opt-in/out preferences for each notification type + channel.
// A missing key means "default" (enabled). Only explicit false opts the user out.
const notificationPreferenceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },
    // { [notificationType]: { email: Boolean, push: Boolean } }
    preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

notificationPreferenceSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
