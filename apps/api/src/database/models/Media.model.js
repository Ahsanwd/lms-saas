const mongoose = require('mongoose');
const softDeletePlugin = require('../plugins/softDelete.plugin');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

const mediaSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },

    url: { type: String, required: true },
    key: { type: String, default: null }, // R2 object key, for deletion (null for local/external)
    filename: { type: String, default: null },
    mimeType: { type: String, default: null },

    category: {
      type: String,
      enum: ['thumbnail', 'content-image', 'video', 'audio', 'chat', 'attachment', 'cloudflare-stream'],
      required: true,
    },

    sizeBytes: { type: Number, default: 0 }, // 0 for cloudflare-stream (duration matters, not bytes)
    width: { type: Number, default: null },  // images only
    height: { type: Number, default: null }, // images only
    durationSeconds: { type: Number, default: null }, // video/audio, when known

    provider: {
      type: String,
      enum: ['local', 's3', 'cloudflare'],
      required: true,
    },

    // Where this file was uploaded from — informational only (not a live reference count)
    contextType: { type: String, default: null }, // e.g. 'course-thumbnail', 'lesson-video', 'tenant-logo'
    contextId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

mediaSchema.index({ tenantId: 1, createdAt: -1 });
mediaSchema.index({ tenantId: 1, category: 1 });

mediaSchema.plugin(softDeletePlugin);
mediaSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('Media', mediaSchema);
