const Plan     = require('../../database/models/Plan.model');
const User     = require('../../database/models/User.model');
const Course   = require('../../database/models/Course.model');
const Tenant   = require('../../database/models/Tenant.model');
const AppError = require('../../utils/AppError');

// 30-second in-memory plan cache — avoids a DB hit on every upload/create.
const _planCache = new Map(); // planId → { plan, expiresAt }

async function getPlan(planId) {
  if (!planId) return null;
  const key = planId.toString();
  const hit = _planCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.plan;
  const plan = await Plan.findById(planId).select('name limits').lean();
  if (plan) _planCache.set(key, { plan, expiresAt: Date.now() + 30_000 });
  return plan;
}

// Throws 403 if adding one more user of `role` would exceed the plan limit.
async function assertUserLimit(tenantId, planId, role) {
  const limitKey = { instructor: 'instructors', student: 'students' }[role];
  if (!limitKey) return; // tenant_admin / super_admin — no cap

  const plan = await getPlan(planId);
  if (!plan) return;

  const limit = plan.limits[limitKey];
  if (limit == null || limit === -1) return; // null or -1 = unlimited

  const count = await User.countDocuments({ tenantId, role, deletedAt: null });
  if (count >= limit) {
    throw new AppError(
      `Your ${plan.name} plan allows a maximum of ${limit} ${limitKey}. Upgrade your plan to add more.`,
      403,
      'PLAN_LIMIT_EXCEEDED'
    );
  }
}

// Throws 403 if adding one more course would exceed the plan limit.
async function assertCourseLimit(tenantId, planId) {
  const plan = await getPlan(planId);
  if (!plan) return;

  const limit = plan.limits.courses;
  if (limit == null || limit === -1) return; // null or -1 = unlimited

  const count = await Course.countDocuments({ tenantId, deletedAt: null });
  if (count >= limit) {
    throw new AppError(
      `Your ${plan.name} plan allows a maximum of ${limit} courses. Upgrade your plan to add more.`,
      403,
      'PLAN_LIMIT_EXCEEDED'
    );
  }
}

// Throws 403 if adding `newBytes` would exceed the storage quota.
async function assertStorageLimit(tenantId, planId, newBytes) {
  const plan = await getPlan(planId);
  if (!plan) return;

  const limitGB = plan.limits.storageGB;
  if (limitGB == null || limitGB === -1) return; // null or -1 = unlimited

  const limitBytes = limitGB * 1024 * 1024 * 1024;
  const tenant     = await Tenant.findById(tenantId).select('storageUsedBytes').lean();
  const used       = tenant?.storageUsedBytes ?? 0;

  if (used + newBytes > limitBytes) {
    const usedGBStr = (used / (1024 ** 3)).toFixed(2);
    throw new AppError(
      `Storage limit reached (${usedGBStr} GB used of ${limitGB} GB). Upgrade your plan for more storage.`,
      403,
      'STORAGE_LIMIT_EXCEEDED'
    );
  }
}

// Throws 403 if the tenant's plan has no Cloudflare Stream storage quota, or adding
// `newMinutes` would exceed it (plan quota + purchased top-up).
async function assertStreamStorageLimit(tenantId, planId, newMinutes) {
  const plan = await getPlan(planId);
  const limitMinutes = plan?.limits?.streamStorageMinutes ?? 0;

  const tenant = await Tenant.findById(tenantId).select('cloudflareStreamUsage').lean();
  const usage  = tenant?.cloudflareStreamUsage ?? {};
  const used   = usage.storageMinutesUsed ?? 0;
  const topup  = usage.storageTopupMinutes ?? 0;
  const cap    = limitMinutes + topup;

  if (used + newMinutes > cap) {
    if (limitMinutes === 0) {
      throw new AppError(
        'Cloudflare Stream is not available on your current plan. Upgrade to Basic or Pro to unlock it.',
        403,
        'STREAM_STORAGE_LOCKED'
      );
    }
    throw new AppError(
      `Cloudflare Stream storage quota reached (${used.toFixed(1)} of ${cap} minutes used). Buy a top-up or upgrade your plan.`,
      403,
      'STREAM_STORAGE_LIMIT_EXCEEDED'
    );
  }
}

// Throws 403 if the tenant has used up its plan's Cloudflare Stream viewer-minute
// quota for this billing cycle. Called before issuing a new signed playback token —
// an already-issued token (1h validity) keeps working after this point.
async function assertStreamViewerAvailable(tenantId, planId) {
  const plan = await getPlan(planId);
  const limitMinutes = plan?.limits?.streamViewerMinutes ?? 0;

  const tenant = await Tenant.findById(tenantId).select('cloudflareStreamUsage').lean();
  const usage  = tenant?.cloudflareStreamUsage ?? {};
  const used   = usage.viewerMinutesUsed ?? 0;
  const topup  = usage.viewerTopupMinutes ?? 0;
  const cap    = limitMinutes + topup;

  if (limitMinutes === 0) {
    throw new AppError(
      'Cloudflare Stream is not available on your current plan. Upgrade to Basic or Pro to unlock it.',
      403,
      'STREAM_VIEWER_LOCKED'
    );
  }
  if (used >= cap) {
    throw new AppError(
      `Your organization's monthly Cloudflare Stream viewing quota is used up (${used.toFixed(1)} of ${cap} minutes). Buy a top-up to keep streaming.`,
      403,
      'STREAM_VIEWER_LIMIT_EXCEEDED'
    );
  }
}

async function incrementStreamStorageUsed(tenantId, minutes) {
  if (minutes > 0) {
    await Tenant.updateOne({ _id: tenantId }, { $inc: { 'cloudflareStreamUsage.storageMinutesUsed': minutes } });
  }
}

async function decrementStreamStorageUsed(tenantId, minutes) {
  if (minutes > 0) {
    await Tenant.updateOne(
      { _id: tenantId, 'cloudflareStreamUsage.storageMinutesUsed': { $gte: minutes } },
      { $inc: { 'cloudflareStreamUsage.storageMinutesUsed': -minutes } }
    );
  }
}

// Returns a full Cloudflare Stream usage/quota snapshot for the course-editor upsell
// UI and the Billing page usage card.
async function getStreamUsageSummary(tenantId, planId) {
  const [plan, tenant] = await Promise.all([
    getPlan(planId),
    Tenant.findById(tenantId).select('cloudflareStreamUsage').lean(),
  ]);

  const limits = plan?.limits ?? {};
  const usage  = tenant?.cloudflareStreamUsage ?? {};

  return {
    planAllows: (limits.streamStorageMinutes ?? 0) > 0,
    storage: {
      used:  usage.storageMinutesUsed ?? 0,
      limit: limits.streamStorageMinutes ?? 0,
      topup: usage.storageTopupMinutes ?? 0,
    },
    viewer: {
      used:  usage.viewerMinutesUsed ?? 0,
      limit: limits.streamViewerMinutes ?? 0,
      topup: usage.viewerTopupMinutes ?? 0,
    },
  };
}

async function incrementStorageUsed(tenantId, bytes) {
  if (bytes > 0) {
    await Tenant.updateOne({ _id: tenantId }, { $inc: { storageUsedBytes: bytes } });
  }
}

async function decrementStorageUsed(tenantId, bytes) {
  if (bytes > 0) {
    // Floor at 0 — never let the counter go negative due to accounting drift.
    await Tenant.updateOne(
      { _id: tenantId, storageUsedBytes: { $gte: bytes } },
      { $inc: { storageUsedBytes: -bytes } }
    );
  }
}

// Returns a full usage snapshot for the billing/settings UI.
async function getUsageSummary(tenantId, planId) {
  const [plan, students, instructors, courses, tenant] = await Promise.all([
    getPlan(planId),
    User.countDocuments({ tenantId, role: 'student',    deletedAt: null }),
    User.countDocuments({ tenantId, role: 'instructor', deletedAt: null }),
    Course.countDocuments({ tenantId, deletedAt: null }),
    Tenant.findById(tenantId).select('storageUsedBytes').lean(),
  ]);

  const limits           = plan?.limits ?? {};
  const storageUsedBytes = tenant?.storageUsedBytes ?? 0;

  return {
    planName:    plan?.name ?? 'Unknown',
    students:    { used: students,    limit: limits.students    ?? -1 },
    instructors: { used: instructors, limit: limits.instructors ?? -1 },
    courses:     { used: courses,     limit: limits.courses     ?? -1 },
    storage: {
      usedBytes: storageUsedBytes,
      usedGB:    parseFloat((storageUsedBytes / (1024 ** 3)).toFixed(3)),
      limitGB:   limits.storageGB ?? -1,
    },
  };
}

module.exports = {
  assertUserLimit,
  assertCourseLimit,
  assertStorageLimit,
  incrementStorageUsed,
  decrementStorageUsed,
  getUsageSummary,
  assertStreamStorageLimit,
  assertStreamViewerAvailable,
  incrementStreamStorageUsed,
  decrementStreamStorageUsed,
  getStreamUsageSummary,
};
