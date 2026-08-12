const mongoose = require('mongoose');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');
const softDeletePlugin = require('../plugins/softDelete.plugin');

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]+$/,
    },
    customDomain: { type: String, default: null, lowercase: true },
    customDomainVerified: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['active', 'suspended', 'plan_expired', 'deleted'],
      default: 'active',
    },

    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    planExpiresAt: { type: Date, default: null },
    trialEndsAt: { type: Date, default: null },
    isOnTrial: { type: Boolean, default: false },

    dbMode: { type: String, enum: ['shared', 'dedicated'], default: 'shared' },
    dedicatedDbUri: { type: String, default: null, select: false },

    settings: {
      logo:    { type: String, default: null },
      favicon: { type: String, default: null },
      primaryColor: { type: String, default: '#3B82F6' },
      secondaryColor: { type: String, default: '#8B5CF6' },
      fontFamily: {
        type: String,
        enum: ['Inter', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Nunito', 'Work Sans', 'Plus Jakarta Sans', 'Source Sans 3'],
        default: 'Inter',
      },
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'UTC' },
      allowSelfRegistration: { type: Boolean, default: true },
      requireEmailVerification: { type: Boolean, default: true },
      idleTimeoutMinutes: { type: Number, default: 0 },
      defaultInviteExpiryHours: { type: Number, default: 72, min: 1, max: 720 },
      currency: { type: String, default: 'usd', uppercase: true, trim: true },
      // VAT / GST percentage applied to subscription invoices (0 = no tax)
      taxRate: { type: Number, default: 0, min: 0, max: 100 },
      taxLabel: { type: String, default: 'Tax', trim: true }, // e.g. "VAT", "GST"
      // Students may request a refund within this many days of purchase (0 = no limit)
      refundWindowDays: { type: Number, default: 30, min: 0, max: 365 },

      // Configurable password policy per tenant
      passwordPolicy: {
        minLength:        { type: Number, default: 8 },
        requireUppercase: { type: Boolean, default: true },
        requireLowercase: { type: Boolean, default: true },
        requireNumbers:   { type: Boolean, default: true },
        requireSymbols:   { type: Boolean, default: false },
      },

      // Storefront visibility — which categories/courses appear on the public catalog
      storefront: {
        hiddenCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      },

      // Per-tenant feature flags — disable modules you don't need
      featureFlags: {
        liveClasses:   { type: Boolean, default: true },
        certificates:  { type: Boolean, default: true },
        assignments:   { type: Boolean, default: true },
        announcements: { type: Boolean, default: true },
        payments:      { type: Boolean, default: true },
        forums:        { type: Boolean, default: false },
      },

      // Public website nav bar — defaults reproduce today's hardcoded
      // LandingNavBar exactly, so tenants who never open the Header Builder
      // see zero change. menuOverrides join TenantPage by slug rather than
      // ObjectId ref — a stale entry (page later deleted) is just filtered
      // out at render time, no cleanup job needed.
      header: {
        logoHeightPx:    { type: Number, default: 36, min: 20, max: 80 },
        backgroundColor: { type: String, default: '#ffffff' },
        menuTextColor:   { type: String, default: '#4b5563' },
        signInText:      { type: String, default: 'Sign in', trim: true, maxlength: 30 },
        signUpText:      { type: String, default: 'Sign up free', trim: true, maxlength: 30 },
        buttonStyle:     { type: String, enum: ['solid', 'outline'], default: 'solid' },
        // Optional third nav button, e.g. linking to a same-page anchor like
        // "/#scholarship" — null by default so existing tenants see no change.
        ctaText:         { type: String, default: null, trim: true, maxlength: 30 },
        ctaHref:         { type: String, default: null, trim: true, maxlength: 200 },
        menuOverrides: [{
          pageSlug:   { type: String, required: true }, // TenantPage.slug ('home' for the home page)
          label:      { type: String, default: null },  // null = use the page's own title
          hidden:     { type: Boolean, default: false },
          order:      { type: Number, default: 0 },
          parentSlug: { type: String, default: null },  // set = nests this item under another page's dropdown
        }],
        // Optional extra HTML/CSS/JS block rendered below the nav bar.
        // Mixed like TenantPage's section `data` field, for the same reason
        // (arbitrary code, no schema-level validation) — checked in
        // tenant.service.js's validateHeader/validateCustomCode instead.
        customCode: { type: mongoose.Schema.Types.Mixed, default: { html: '', css: '', js: '', heightPx: 80, isEnabled: false } },
      },

      // Public website footer — same zero-change-by-default rule as header.
      footer: {
        backgroundColor: { type: String, default: '#ffffff' },
        textColor:       { type: String, default: '#9ca3af' },
        tagline:         { type: String, default: null, maxlength: 200 },
        // Extra line above the fixed "Powered by Coursel" attribution.
        // Supports {{year}} / {{tenantName}} tokens, resolved at render time.
        copyrightText:   { type: String, default: null, maxlength: 200 },
        socialLinks: [{
          platform: { type: String, enum: ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok'], required: true },
          url:      { type: String, required: true, maxlength: 500 },
        }],
        // Optional extra HTML/CSS/JS block rendered above the footer — same
        // Mixed/service-layer-validated pattern as header.customCode above.
        customCode: { type: mongoose.Schema.Types.Mixed, default: { html: '', css: '', js: '', heightPx: 150, isEnabled: false } },
      },
    },

    emailSettings: {
      fromName:  { type: String, default: null },   // "Sunrise Academy"
      fromEmail: { type: String, default: null },   // no-reply@sunriseacademy.com
      replyTo:   { type: String, default: null },   // support@sunriseacademy.com
    },

    // Bring-your-own payment gateway for course purchases (tenant is paid directly, platform takes no cut)
    paymentGateway: {
      activeProvider: { type: String, enum: ['stripe', 'safepay', 'manual', 'paypal', 'wise', null], default: null },

      stripe: {
        secretKeyEncrypted: { type: String,  default: null, select: false }, // AES-256 encrypted
        publishableKey:     { type: String,  default: null }, // safe to expose to frontend
        verified:           { type: Boolean, default: false },
        verifiedAt:         { type: Date,    default: null },
      },

      // Legacy — Safepay integration removed (never completed a live transaction;
      // blocked by an unresolved sandbox-account issue on Safepay's side). Fields
      // kept, and 'safepay' kept in activeProvider above, only so a tenant that
      // had this configured doesn't crash on read. No live code acts on this anymore.
      safepay: {
        apiKey:             { type: String,  default: null }, // merchant_api_key
        secretKeyEncrypted: { type: String,  default: null, select: false }, // AES-256 encrypted
        environment:        { type: String,  enum: ['sandbox', 'production'], default: 'sandbox' },
        verified:           { type: Boolean, default: false },
        verifiedAt:         { type: Date,    default: null },
      },

      // Manual payment — tenant publishes their own bank/JazzCash/EasyPaisa
      // account details; student pays externally and uploads a screenshot as
      // proof, admin reviews and approves/rejects. No secrets here (account
      // numbers, not credentials) so nothing needs encryption.
      manual: {
        accounts: [{
          type:          { type: String, enum: ['bank', 'jazzcash', 'easypaisa'], required: true },
          label:         { type: String, default: null },
          accountTitle:  { type: String, required: true },
          accountNumber: { type: String, required: true }, // IBAN / wallet number
          bankName:      { type: String, default: null },  // only meaningful when type === 'bank'
        }],
        instructions: { type: String, default: null, maxlength: 2000 },
      },

      // PayPal Checkout (BYO PayPal Business app) — REST API v2 Orders,
      // client-side JS SDK button using clientId (public, safe to expose).
      paypal: {
        clientId:              { type: String,  default: null }, // safe to expose to frontend
        clientSecretEncrypted: { type: String,  default: null, select: false }, // AES-256 encrypted
        mode:                  { type: String,  enum: ['sandbox', 'live'], default: 'sandbox' },
        verified:              { type: Boolean, default: false },
        verifiedAt:            { type: Date,    default: null },
      },

      // Wise — no usable one-off-checkout API for this use case, so it follows
      // the same pattern as Manual: tenant publishes their Wise account
      // details, student pays externally and uploads a screenshot as proof.
      wise: {
        accountHolderName: { type: String, default: null },
        email:              { type: String, default: null }, // Wise account email (wise.com/pay/me/<name> or direct transfer)
        iban:               { type: String, default: null },
        swiftBic:           { type: String, default: null },
        accountNumber:      { type: String, default: null },
        instructions:       { type: String, default: null, maxlength: 2000 },
      },
    },

    // Per-tenant Bunny.net Stream integration
    bunnyStream: {
      enabled:         { type: Boolean, default: false },
      libraryId:       { type: String,  default: null },
      apiKeyEnc:       { type: String,  default: null, select: false }, // AES-256 encrypted
      cdnHostname:     { type: String,  default: null },
      tokenAuthKeyEnc: { type: String,  default: null, select: false }, // AES-256 encrypted, optional
    },

    // Public landing-page content builder (tenant subdomain homepage).
    // isPublished=false (default) means every existing tenant keeps today's
    // hardcoded landing page with zero behavior change until they opt in.
    websiteContent: {
      instituteType: { type: String, enum: ['school', 'academy', 'college', 'university', null], default: null },
      isPublished:   { type: Boolean, default: false },

      hero: {
        headline:           { type: String, default: null },
        subheadline:        { type: String, default: null },
        ctaText:            { type: String, default: null },
        ctaLink:            { type: String, default: null },
        backgroundImageUrl: { type: String, default: null },
      },
      about: {
        heading:    { type: String, default: null },
        body:       { type: String, default: null },
        imageUrl:   { type: String, default: null },
        ctaText:    { type: String, default: null },
        ctaLink:    { type: String, default: null },
      },
      coursesSection: {
        heading:     { type: String, default: null },
        subheading:  { type: String, default: null },
        // 'all' (default) = every storefront-visible course, matches today's behavior.
        // 'category'      = only courses in categoryId.
        // 'selected'      = exactly courseIds, in that array order.
        displayMode: { type: String, enum: ['all', 'category', 'selected'], default: 'all' },
        categoryId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
        courseIds:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
        layout:      { type: String, enum: ['grid', 'slider'], default: 'grid' },
      },
      testimonials: [{
        name:      { type: String, default: null },
        role:      { type: String, default: null },
        quote:     { type: String, default: null },
        avatarUrl: { type: String, default: null },
      }],
      cta: {
        heading:    { type: String, default: null },
        subtext:    { type: String, default: null },
        buttonText: { type: String, default: null },
        buttonLink: { type: String, default: null },
      },
      contact: {
        email:   { type: String, default: null },
        phone:   { type: String, default: null },
        address: { type: String, default: null },
      },
    },

    contactEmail: { type: String, required: true, lowercase: true },
    storageUsedBytes: { type: Number, default: 0 },

    // Cloudflare Stream plan-quota metering (shared platform-level account, config.cloudflareStream)
    cloudflareStreamUsage: {
      storageMinutesUsed:  { type: Number, default: 0 },   // current total library duration
      storageTopupMinutes: { type: Number, default: 0 },   // purchased, permanent cap raise
      viewerMinutesUsed:   { type: Number, default: 0 },   // this billing month
      viewerTopupMinutes:  { type: Number, default: 0 },   // purchased, expires at monthly reset
      viewerCycleResetAt:  { type: Date, default: null },
      lastAnalyticsSyncAt: { type: Date, default: null },
    },

    // Idempotency: tracks last date each warning level was sent (keys: '7d', '3d', '1d')
    warnings: { type: Map, of: Date, default: () => new Map() },
  },
  { timestamps: true }
);

tenantSchema.index({ subdomain: 1 }, { unique: true });
tenantSchema.index({ customDomain: 1 }, { sparse: true });
tenantSchema.index({ status: 1 });

tenantSchema.plugin(auditFieldsPlugin);
tenantSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('Tenant', tenantSchema);
