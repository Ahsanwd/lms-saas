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

      // Per-tenant feature flags — disable modules you don't need
      featureFlags: {
        liveClasses:   { type: Boolean, default: true },
        certificates:  { type: Boolean, default: true },
        assignments:   { type: Boolean, default: true },
        announcements: { type: Boolean, default: true },
        payments:      { type: Boolean, default: true },
        forums:        { type: Boolean, default: false },
      },
    },

    emailSettings: {
      fromName:  { type: String, default: null },   // "Sunrise Academy"
      fromEmail: { type: String, default: null },   // no-reply@sunriseacademy.com
      replyTo:   { type: String, default: null },   // support@sunriseacademy.com

      smtp: {
        host:       { type: String, default: null },
        port:       { type: Number, default: 587 },
        secure:     { type: Boolean, default: false }, // true = port 465
        user:       { type: String, default: null },
        passEncrypted: { type: String, default: null, select: false }, // AES-256 encrypted
        verified:   { type: Boolean, default: false },
        verifiedAt: { type: Date,    default: null },
      },
    },

    // Per-tenant Cloudflare Stream BYOK integration
    cloudflareStream: {
      enabled:      { type: Boolean, default: false },
      accountId:    { type: String,  default: null },
      apiTokenEnc:  { type: String,  default: null, select: false }, // AES-256 encrypted
      signingKeyId: { type: String,  default: null },
      signingKeyEnc:{ type: String,  default: null, select: false }, // AES-256 encrypted PEM
    },

    contactEmail: { type: String, required: true, lowercase: true },
    storageUsedBytes: { type: Number, default: 0 },

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
