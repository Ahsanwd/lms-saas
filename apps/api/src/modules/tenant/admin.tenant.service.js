const crypto = require('crypto');
const Tenant = require('../../database/models/Tenant.model');
const tenantRepo = require('../../database/repositories/tenant.repository');
const planRepo = require('../../database/repositories/plan.repository');
const userRepo = require('../../database/repositories/user.repository');
const sessionRepo = require('../../database/repositories/session.repository');
const AppError = require('../../utils/AppError');

// ─── List All Tenants ─────────────────────────────────────────────────────────
async function listTenants({ status, plan, search, page = 1, limit = 20 }) {
  const filter = { deletedAt: null };
  if (status) filter.status = status;
  if (plan) filter.plan = plan;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { subdomain: { $regex: search, $options: 'i' } },
      { contactEmail: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [tenants, total] = await Promise.all([
    Tenant.find(filter)
      .populate('plan', 'name slug price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Tenant.countDocuments(filter),
  ]);

  return {
    tenants,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
    },
  };
}

// ─── Get Tenant By ID ─────────────────────────────────────────────────────────
async function getTenantById(tenantId) {
  const tenant = await Tenant.findById(tenantId).populate('plan');
  if (!tenant) throw new AppError('Tenant not found', 404);
  return tenant;
}

// ─── Create Tenant ────────────────────────────────────────────────────────────
async function createTenant({ name, subdomain, contactEmail, planId, dbMode }, actingUserId) {
  const plan = await planRepo.findById(planId);
  if (!plan) throw new AppError('Plan not found', 404);

  const existing = await tenantRepo.findBySubdomain(subdomain);
  if (existing) throw new AppError('Subdomain already taken', 409, 'SUBDOMAIN_TAKEN');

  const trialDays = plan.trialDays || 0;
  const trialEndsAt = trialDays > 0
    ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
    : null;

  const tenant = await Tenant.create({
    name: name.trim(),
    subdomain: subdomain.toLowerCase().trim(),
    contactEmail: contactEmail.toLowerCase().trim(),
    plan: planId,
    dbMode: dbMode || plan.dbMode || 'shared',
    isOnTrial: trialDays > 0,
    trialEndsAt,
    status: 'active',
    createdBy: actingUserId,
  });

  return tenant;
}

// ─── Update Tenant ────────────────────────────────────────────────────────────
async function updateTenant(tenantId, updates) {
  const allowed = ['name', 'contactEmail', 'status'];
  const update = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) update[key] = updates[key];
  }
  if (!Object.keys(update).length) throw new AppError('No valid fields provided', 400);

  const tenant = await tenantRepo.updateById(tenantId, update);
  if (!tenant) throw new AppError('Tenant not found', 404);
  return tenant;
}

// ─── Suspend Tenant ───────────────────────────────────────────────────────────
async function suspendTenant(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);
  if (tenant.status === 'suspended') throw new AppError('Tenant already suspended', 400);

  await tenantRepo.updateById(tenantId, { status: 'suspended' });

  // Immediately invalidate every active session in this tenant
  await sessionRepo.revokeAllByTenant(tenantId);

  return tenantRepo.findById(tenantId);
}

// ─── Restore Tenant ───────────────────────────────────────────────────────────
async function restoreTenant(tenantId) {
  const tenant = await tenantRepo.findById(tenantId);
  if (!tenant) throw new AppError('Tenant not found', 404);
  if (tenant.status !== 'suspended') throw new AppError('Tenant is not suspended', 400);
  return tenantRepo.updateById(tenantId, { status: 'active' });
}

// ─── Delete Tenant (Soft) ─────────────────────────────────────────────────────
async function deleteTenant(tenantId, actingUserId) {
  const tenant = await Tenant.findById(tenantId).select('+deletedAt');
  if (!tenant) throw new AppError('Tenant not found', 404);
  await tenant.softDelete(actingUserId);
}

// ─── Change Tenant Plan ───────────────────────────────────────────────────────
async function changeTenantPlan(tenantId, { planId, planExpiresAt }) {
  const plan = await planRepo.findById(planId);
  if (!plan) throw new AppError('Plan not found', 404);

  const tenant = await tenantRepo.updateById(tenantId, {
    plan: planId,
    planExpiresAt: planExpiresAt ? new Date(planExpiresAt) : null,
    isOnTrial: false,
  });
  if (!tenant) throw new AppError('Tenant not found', 404);
  return tenant;
}

// ─── Tenant Stats ─────────────────────────────────────────────────────────────
async function getTenantStats(tenantId) {
  const User = require('../../database/models/User.model');
  const [tenant, userCounts] = await Promise.all([
    Tenant.findById(tenantId).populate('plan', 'name limits'),
    User.aggregate([
      { $match: { tenantId: require('mongoose').Types.ObjectId.createFromHexString(tenantId.toString()), deletedAt: null } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
  ]);

  if (!tenant) throw new AppError('Tenant not found', 404);

  const counts = userCounts.reduce((acc, cur) => {
    acc[cur._id] = cur.count;
    return acc;
  }, {});

  return {
    tenant,
    users: {
      students: counts.student || 0,
      instructors: counts.instructor || 0,
      admins: counts.tenant_admin || 0,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    },
  };
}

module.exports = {
  listTenants,
  getTenantById,
  createTenant,
  updateTenant,
  suspendTenant,
  restoreTenant,
  deleteTenant,
  changeTenantPlan,
  getTenantStats,
};
