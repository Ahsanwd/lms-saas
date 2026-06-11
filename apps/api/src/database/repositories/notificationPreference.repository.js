const NotificationPreference = require('../models/NotificationPreference.model');

class NotificationPreferenceRepository {
  async findOrCreate(tenantId, userId) {
    return NotificationPreference.findOneAndUpdate(
      { tenantId, userId },
      { $setOnInsert: { tenantId, userId, preferences: {} } },
      { upsert: true, new: true, lean: true }
    );
  }

  async update(tenantId, userId, preferences) {
    return NotificationPreference.findOneAndUpdate(
      { tenantId, userId },
      { $set: { preferences } },
      { upsert: true, new: true, lean: true }
    );
  }

  // Returns true if the channel (email|push) is enabled for the given type.
  // Missing preference = default enabled.
  isEnabled(preferences, type, channel) {
    return preferences?.[type]?.[channel] !== false;
  }
}

module.exports = new NotificationPreferenceRepository();
