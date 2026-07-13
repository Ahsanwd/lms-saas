const mongoose = require('mongoose');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');
const softDeletePlugin = require('../plugins/softDelete.plugin');

// 'custom' sections don't get service-level max-count enforced by the schema —
// see tenantPage.service.js for the 0-or-1-per-fixed-type and size/count caps
// (Mixed data has no schema-level validation, so those checks live there).
const SECTION_TYPES = ['hero', 'about', 'coursesSection', 'testimonials', 'cta', 'contact', 'custom', 'contactForm', 'courseApplication'];

const tenantPageSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]+$/,
    },
    title: { type: String, required: true, trim: true },
    isHomePage: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
    navOrder: { type: Number, default: 0 },

    // Only meaningful on the home page today — which starter-copy TEMPLATES
    // preset the builder seeded on first run. Carried over as-is from the
    // single-page builder's websiteContent.instituteType.
    instituteType: { type: String, enum: ['school', 'academy', 'college', 'university', null], default: null },

    sections: [{
      type: { type: String, enum: SECTION_TYPES, required: true },
      order: { type: Number, required: true },
      data: { type: mongoose.Schema.Types.Mixed, default: {} },
    }],

    // Not editable yet (no UI in this phase) — added now so it isn't a schema
    // migration later when per-page SEO fields get a builder UI (deferred).
    seo: {
      title: { type: String, default: null },
      description: { type: String, default: null },
    },
  },
  { timestamps: true }
);

tenantPageSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
// At most one home page per tenant, enforced at the DB level (not just app logic).
tenantPageSchema.index(
  { tenantId: 1, isHomePage: 1 },
  { unique: true, partialFilterExpression: { isHomePage: true } }
);
tenantPageSchema.index({ tenantId: 1, isPublished: 1 });

tenantPageSchema.plugin(auditFieldsPlugin);
tenantPageSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('TenantPage', tenantPageSchema);
module.exports.SECTION_TYPES = SECTION_TYPES;
