const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true },

    position: { type: Number, required: true }, // 1-based, recomputed on removal

    status: {
      type: String,
      enum: ['waiting', 'promoted', 'cancelled'],
      default: 'waiting',
    },

    joinedAt:    { type: Date, default: Date.now },
    promotedAt:  { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

waitlistSchema.index({ tenantId: 1, courseId: 1, userId: 1 }, { unique: true });
waitlistSchema.index({ tenantId: 1, courseId: 1, status: 1, position: 1 });

module.exports = mongoose.model('Waitlist', waitlistSchema);
