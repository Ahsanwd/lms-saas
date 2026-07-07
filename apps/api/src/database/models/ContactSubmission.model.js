const mongoose = require('mongoose');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');
const softDeletePlugin = require('../plugins/softDelete.plugin');

const contactSubmissionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    pageId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenantPage', default: null },

    name: { type: String, default: null },
    email: { type: String, required: true },
    phone: { type: String, default: null },
    subject: { type: String, default: null },
    message: { type: String, required: true },

    ip: { type: String, default: null },
    status: { type: String, enum: ['new', 'read'], default: 'new' },
    // Whether the Brevo notification to the tenant succeeded — the DB record
    // is the safety net regardless, given the free-tier 300/day send cap.
    emailDelivered: { type: Boolean, default: false },
  },
  { timestamps: true }
);

contactSubmissionSchema.index({ tenantId: 1, createdAt: -1 });
contactSubmissionSchema.index({ tenantId: 1, status: 1 });

contactSubmissionSchema.plugin(auditFieldsPlugin);
contactSubmissionSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('ContactSubmission', contactSubmissionSchema);
