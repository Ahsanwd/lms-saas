const Coupon = require('../models/Coupon.model');

class CouponRepository {
  findAll(filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      Coupon.find({ deletedAt: null, ...filter }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Coupon.countDocuments({ deletedAt: null, ...filter }),
    ]);
  }

  findByCode(code) {
    return Coupon.findOne({ code: code.toUpperCase().trim(), deletedAt: null });
  }

  findById(id) {
    return Coupon.findOne({ _id: id, deletedAt: null });
  }

  create(data) {
    return Coupon.create(data);
  }

  updateById(id, update) {
    return Coupon.findByIdAndUpdate(id, update, { new: true });
  }

  incrementUsage(id, tenantId) {
    return Coupon.findByIdAndUpdate(id, {
      $inc: { usedCount: 1 },
      $addToSet: { usedByTenants: tenantId },
    });
  }

  async softDelete(id, userId) {
    const coupon = await this.findById(id);
    if (!coupon) return null;
    return coupon.softDelete(userId);
  }
}

module.exports = new CouponRepository();
