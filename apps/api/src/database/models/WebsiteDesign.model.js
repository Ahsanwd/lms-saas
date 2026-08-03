const mongoose = require('mongoose');

// Shared, tenant-agnostic library of ready-made website designs — applied to
// a tenant's TenantPage collection + Tenant.settings.header/footer at signup
// (registerTenant()) and, in a future phase, by a tenant_admin switching
// designs from the Website Builder. Authored by the platform team (seed
// scripts for now, not tenant input), so structural fields are typed like
// TenantPage.model.js's own split — Mixed only for the truly freeform
// per-section `data`.
const websiteDesignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: null },

    // Auto-applied at signup when true. Enforced as "exactly one" at the
    // service layer, not a unique index — a moment with zero (or briefly two)
    // defaults during authoring must stay recoverable, not throw.
    isDefault: { type: Boolean, default: false },
    // Hide from a future design-library listing without deleting it.
    isActive: { type: Boolean, default: true },

    // Same shape as Tenant.settings.header/footer. {} means "inherit
    // tenant.service.js's DEFAULT_HEADER/DEFAULT_FOOTER exactly" — a design
    // doesn't have to override chrome styling to be useful.
    header: { type: mongoose.Schema.Types.Mixed, default: {} },
    footer: { type: mongoose.Schema.Types.Mixed, default: {} },

    pages: [
      {
        slug: { type: String, required: true, match: /^[a-z0-9-]+$/ },
        title: { type: String, required: true },
        isHomePage: { type: Boolean, default: false },
        // A design's whole point is to make a tenant's site look alive
        // immediately — default true, unlike TenantPage's own isPublished
        // (default false there, since a manually-created page starts as a
        // draft the tenant is still working on).
        isPublished: { type: Boolean, default: true },
        navOrder: { type: Number, default: 0 },
        instituteType: { type: String, default: null },
        sections: [
          {
            // Not schema-enum'd against TenantPage.SECTION_TYPES on purpose —
            // keeps this model decoupled from that list; validated at
            // apply-time via tenantPageService.validateSections instead.
            type: { type: String, required: true },
            order: { type: Number, required: true },
            data: { type: mongoose.Schema.Types.Mixed, default: {} },
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebsiteDesign', websiteDesignSchema);
