const MembershipSubscription = require('../models/MembershipSubscription.model');

class MembershipSubscriptionRepository {
  findByUser(tenantId, userId) {
    // Includes past_due so checkCourseAccess can evaluate the grace period,
    // and cancelled so a student who cancelled keeps seeing (and using) their
    // subscription until currentPeriodEnd, matching the "you'll keep access
    // until <date>" promise shown at cancel time.
    return MembershipSubscription.findOne({
      tenantId, userId,
      status: { $in: ['active', 'trial', 'past_due', 'cancelled'] },
    }).populate({ path: 'planId', populate: { path: 'courses', select: 'title' } });
  }

  findByPaymentIntent(paymentIntentId) {
    return MembershipSubscription.findOne({ paymentIntentId });
  }

  findExpiring(cutoffDate) {
    return MembershipSubscription.find({
      status: 'active',
      currentPeriodEnd: { $lte: cutoffDate },
      autoRenew: true,
    }).populate('userId', 'email firstName lastName')
      .populate('planId', 'name monthlyPrice yearlyPrice');
  }

  create(data) {
    return MembershipSubscription.create(data);
  }

  updateById(id, update) {
    return MembershipSubscription.findByIdAndUpdate(
      id, { $set: update }, { new: true }
    ).populate({ path: 'planId', populate: { path: 'courses', select: 'title' } });
  }

  // Count active subscribers for a plan
  countActive(tenantId, planId) {
    return MembershipSubscription.countDocuments({
      tenantId, planId, status: { $in: ['active', 'trial'] },
    });
  }

  // Admin: list all subscriptions for a tenant
  findAll(tenantId, { page = 1, limit = 20, status } = {}) {
    const filter = { tenantId };
    if (status) filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      MembershipSubscription.find(filter)
        .populate('userId', 'firstName lastName email')
        .populate('planId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      MembershipSubscription.countDocuments(filter),
    ]);
  }
}

module.exports = new MembershipSubscriptionRepository();
