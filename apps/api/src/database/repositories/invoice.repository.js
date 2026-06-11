const Invoice = require('../models/Invoice.model');

class InvoiceRepository {
  findByTenant(tenantId, filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      Invoice.find({ tenantId, ...filter })
        .populate('planId', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Invoice.countDocuments({ tenantId, ...filter }),
    ]);
  }

  findAll(filter = {}, { page = 1, limit = 20 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    return Promise.all([
      Invoice.find(filter)
        .populate('tenantId', 'name subdomain')
        .populate('planId', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Invoice.countDocuments(filter),
    ]);
  }

  findById(id) {
    return Invoice.findById(id)
      .populate('tenantId', 'name subdomain contactEmail')
      .populate('planId')
      .populate('paidBy', 'name email');
  }

  findByNumber(invoiceNumber) {
    return Invoice.findOne({ invoiceNumber });
  }

  create(data) {
    return Invoice.create(data);
  }

  // Invoices are immutable — only status/payment fields may change
  updateStatus(id, update) {
    return Invoice.findByIdAndUpdate(id, update, { new: true });
  }

  updateById(id, update) {
    return Invoice.findByIdAndUpdate(id, { $set: update }, { new: true });
  }

  findByStripeIntentId(paymentIntentId) {
    return Invoice.findOne({ stripePaymentIntentId: paymentIntentId });
  }

  getRevenueStats(filter = {}) {
    return Invoice.aggregate([
      { $match: { status: 'paid', ...filter } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalInvoices: { $sum: 1 },
          avgInvoice: { $avg: '$total' },
        },
      },
    ]);
  }

  getMonthlyRevenue(months = 12) {
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    return Invoice.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: start } } },
      {
        $group: {
          _id: { year: { $year: '$paidAt' }, month: { $month: '$paidAt' } },
          revenue: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
  }
}

module.exports = new InvoiceRepository();
