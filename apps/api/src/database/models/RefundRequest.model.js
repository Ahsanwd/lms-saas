const mongoose = require('mongoose');
const { Schema } = mongoose;

const refundRequestSchema = new Schema({
  tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  paymentId:  { type: Schema.Types.ObjectId, ref: 'CoursePayment', required: true },
  courseId:   { type: Schema.Types.ObjectId, ref: 'Course', required: true },
  userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason:     { type: String, required: true, trim: true, maxlength: 1000 },
  status:     { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminNote:  { type: String, trim: true, maxlength: 500 },
  adminId:    { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  // Partial refund support — null = full refund
  requestedAmount: { type: Number, default: null }, // cents; null = full refund requested
  approvedAmount:  { type: Number, default: null }, // cents; null = full refund approved
}, { timestamps: true });

refundRequestSchema.index({ tenantId: 1, status: 1 });
refundRequestSchema.index({ tenantId: 1, userId: 1 });
refundRequestSchema.index({ paymentId: 1 }, { unique: true }); // one request per payment

module.exports = mongoose.model('RefundRequest', refundRequestSchema);
