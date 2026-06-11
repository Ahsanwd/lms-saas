const Subscription = require('../models/Subscription.model');

class SubscriptionRepository {
  findByTenant(tenantId) {
    return Subscription.findOne({ tenantId })
      .populate('planId')
      .populate('previousPlanId', 'name slug');
  }

  findAll(filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      Subscription.find(filter)
        .populate('tenantId', 'name subdomain contactEmail')
        .populate('planId', 'name slug price')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Subscription.countDocuments(filter),
    ]);
  }

  findById(id) {
    return Subscription.findById(id)
      .populate('tenantId', 'name subdomain')
      .populate('planId');
  }

  findExpiringSoon(daysAhead = 7) {
    const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    return Subscription.find({
      status: 'active',
      currentPeriodEnd: { $lte: cutoff },
      autoRenew: false,
    }).populate('tenantId', 'name contactEmail');
  }

  create(data) {
    return Subscription.create(data);
  }

  updateByTenant(tenantId, update) {
    return Subscription.findOneAndUpdate({ tenantId }, update, { new: true, upsert: false });
  }

  updateById(id, update) {
    return Subscription.findByIdAndUpdate(id, update, { new: true });
  }
}

module.exports = new SubscriptionRepository();
