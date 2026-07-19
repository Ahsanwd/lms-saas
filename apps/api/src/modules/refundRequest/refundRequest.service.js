const RefundRequest = require('../../database/models/RefundRequest.model');
const CoursePayment = require('../../database/models/CoursePayment.model');
const AppError      = require('../../utils/AppError');
const paymentSvc    = require('../payment/payment.service');

async function requestRefund(tenantId, paymentId, userId, reason, requestedAmount = null) {
  const payment = await CoursePayment.findOne({ _id: paymentId, tenantId, userId });
  if (!payment) throw new AppError('Payment not found', 404);
  if (payment.status !== 'completed') throw new AppError('Only completed payments can be refunded', 400);

  // Enforce refund window
  const Tenant = require('../../database/models/Tenant.model');
  const tenant = await Tenant.findById(tenantId).select('settings.refundWindowDays').lean();
  const windowDays = tenant?.settings?.refundWindowDays ?? 30;
  if (windowDays > 0 && payment.paidAt) {
    const daysSincePurchase = (Date.now() - new Date(payment.paidAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePurchase > windowDays) {
      throw new AppError(
        `Refund window has expired. Refunds are accepted within ${windowDays} days of purchase.`,
        400,
        'REFUND_WINDOW_EXPIRED'
      );
    }
  }

  const existing = await RefundRequest.findOne({ paymentId });
  if (existing) throw new AppError('A refund request already exists for this payment', 409, 'REFUND_REQUEST_EXISTS');

  // Validate partial refund amount if provided
  const reqAmount = requestedAmount ? Math.round(Number(requestedAmount)) : null;
  if (reqAmount !== null && (reqAmount <= 0 || reqAmount > payment.amount)) {
    throw new AppError('Requested refund amount must be between 1 cent and the full payment amount', 400);
  }

  return RefundRequest.create({
    tenantId,
    paymentId,
    courseId: payment.courseId,
    userId,
    reason,
    requestedAmount: reqAmount,
  });
}

async function getMyRequests(tenantId, userId) {
  return RefundRequest.find({ tenantId, userId }).sort({ createdAt: -1 });
}

async function listRequests(tenantId, query = {}) {
  const { status, page = 1, limit = 20 } = query;
  const filter = { tenantId };
  if (status) filter.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [requests, total] = await Promise.all([
    RefundRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit))
      .populate('userId',    'firstName lastName email')
      .populate('paymentId', 'amount currency receiptNumber provider paidAt')
      .populate('courseId',  'title thumbnail'),
    RefundRequest.countDocuments(filter),
  ]);
  return { requests, total, page: Number(page), limit: Number(limit) };
}

async function approveRequest(tenantId, requestId, adminId, refundAmount = null) {
  const refReq = await RefundRequest.findOne({ _id: requestId, tenantId, status: 'pending' });
  if (!refReq) throw new AppError('Pending refund request not found', 404);

  // Resolve approved amount: explicit override → student-requested → null (full)
  const approvedAmount = refundAmount
    ? Math.round(Number(refundAmount))
    : (refReq.requestedAmount ?? null);

  // This route is requireRole('tenant_admin')-gated, so the acting user is
  // always a tenant admin — refundPayment's ownership check only applies to
  // the 'instructor' role and is a no-op here either way.
  await paymentSvc.refundPayment(tenantId, refReq.paymentId.toString(), { sub: adminId, role: 'tenant_admin' }, {
    reason: refReq.reason,
    amount: approvedAmount,
  });

  refReq.approvedAmount = approvedAmount;

  refReq.status     = 'approved';
  refReq.adminId    = adminId;
  refReq.resolvedAt = new Date();
  await refReq.save();

  setImmediate(() => {
    require('../notification/notification.service')
      .notifyRefundApproved(tenantId, refReq.userId.toString(), null, refReq.courseId?.toString() ?? null)
      .catch(() => {});
  });

  return refReq;
}

async function rejectRequest(tenantId, requestId, adminId, adminNote = '') {
  const refReq = await RefundRequest.findOne({ _id: requestId, tenantId, status: 'pending' });
  if (!refReq) throw new AppError('Pending refund request not found', 404);

  refReq.status     = 'rejected';
  refReq.adminId    = adminId;
  refReq.adminNote  = adminNote;
  refReq.resolvedAt = new Date();
  await refReq.save();

  setImmediate(() => {
    require('../notification/notification.service')
      .notifyRefundRejected(tenantId, refReq.userId.toString(), adminNote, null, refReq.courseId?.toString() ?? null)
      .catch(() => {});
  });

  return refReq;
}

module.exports = { requestRefund, getMyRequests, listRequests, approveRequest, rejectRequest };
