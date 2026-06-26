const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');
const softDeletePlugin = require('../plugins/softDelete.plugin');

const userSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: function() { return this.role !== 'super_admin'; }, default: null },
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },

    role: {
      type: String,
      enum: ['student', 'instructor', 'tenant_admin', 'super_admin'],
      default: 'student',
    },

    status: {
      type: String,
      enum: ['unverified', 'active', 'suspended'],
      default: 'unverified',
    },

    avatar: { type: String, default: null },

    emailVerification: {
      tokenHash: { type: String, default: null, select: false },
      expiresAt: { type: Date, default: null },
      resendCount: { type: Number, default: 0 },
      resendWindowStart: { type: Date, default: null },
    },

    passwordReset: {
      tokenHash: { type: String, default: null, select: false },
      expiresAt: { type: Date, default: null },
    },

    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },

    // Google OAuth
    googleId: { type: String, default: null, select: false },

    // Stripe Customer ID — created lazily on first paid purchase
    stripeCustomerId: { type: String, default: null, select: false },

    // Two-Factor Authentication (TOTP)
    twoFactor: {
      enabled:          { type: Boolean, default: false },
      secretEncrypted:  { type: String, default: null, select: false },
      backupCodes:      { type: [String], default: [], select: false }, // SHA-256 hashed
      pendingSecret:    { type: String, default: null, select: false }, // temp during setup, not yet enabled
      setupAt:          { type: Date, default: null },
    },

    lastLoginAt: { type: Date, default: null },
    timezone: { type: String, default: 'UTC' },
    language: { type: String, default: 'en' },
  },
  { timestamps: true }
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1 });
userSchema.index({ tenantId: 1, status: 1 });
userSchema.index({ tenantId: 1, googleId: 1 }, { sparse: true });

userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual('isLocked').get(function () {
  return this.lockUntil && this.lockUntil > Date.now();
});

userSchema.methods.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.generateVerificationToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.emailVerification.tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  this.emailVerification.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return raw;
};

userSchema.methods.generatePasswordResetToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.passwordReset.tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  this.passwordReset.expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  return raw;
};

userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  next();
});

userSchema.plugin(auditFieldsPlugin);
userSchema.plugin(softDeletePlugin);

module.exports = mongoose.model('User', userSchema);
