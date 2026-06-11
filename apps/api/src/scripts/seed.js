require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const config = require('../config');

const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@lms.local';
const SUPER_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
const TEST_TENANT_SUBDOMAIN = process.env.SEED_TENANT_SUBDOMAIN || 'demo';
const TEST_ADMIN_EMAIL = process.env.SEED_TENANT_EMAIL || 'demo@lms.local';
const TEST_ADMIN_PASSWORD = process.env.SEED_TENANT_PASSWORD || 'Demo@123456';
const TEST_INSTRUCTOR_EMAIL = 'instructor@lms.local';
const TEST_INSTRUCTOR_PASSWORD = 'Instructor@123456';
const TEST_STUDENT_EMAIL = 'student@lms.local';
const TEST_STUDENT_PASSWORD = 'Student@123456';

async function seed() {
  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to MongoDB');

  const Plan = require('../database/models/Plan.model');
  const User = require('../database/models/User.model');
  const Tenant = require('../database/models/Tenant.model');

  // ── Free Plan ──────────────────────────────────────────────────────────────
  let freePlan = await Plan.findOne({ slug: 'free' });
  if (!freePlan) {
    freePlan = await Plan.create({
      name: 'Free',
      slug: 'free',
      price: { monthly: 0, yearly: 0 },
      limits: { students: 50, instructors: 3, courses: 5, storageGB: 2, maxSessions: 2 },
      features: ['Basic courses', 'Email support'],
      trialDays: 14,
      isActive: true,
    });
    console.log('✓ Free plan created');
  } else {
    console.log('- Free plan already exists');
  }

  // ── Pro Plan ───────────────────────────────────────────────────────────────
  let proPlan = await Plan.findOne({ slug: 'pro' });
  if (!proPlan) {
    await Plan.create({
      name: 'Pro',
      slug: 'pro',
      price: { monthly: 49, yearly: 470 },
      limits: { students: 500, instructors: 20, courses: 50, storageGB: 50, maxSessions: 10 },
      features: ['Unlimited courses', 'Priority support', 'Custom domain', 'Advanced analytics'],
      trialDays: 14,
      isActive: true,
    });
    console.log('✓ Pro plan created');
  } else {
    console.log('- Pro plan already exists');
  }

  // ── Super Admin ────────────────────────────────────────────────────────────
  let superAdmin = await User.findOne({ email: SUPER_ADMIN_EMAIL, role: 'super_admin' });
  if (!superAdmin) {
    superAdmin = await User.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: SUPER_ADMIN_EMAIL,
      passwordHash: SUPER_ADMIN_PASSWORD,
      role: 'super_admin',
      status: 'active',
    });
    console.log(`✓ Super admin created — ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
  } else {
    console.log(`- Super admin already exists (${SUPER_ADMIN_EMAIL})`);
  }

  // ── Demo Tenant ────────────────────────────────────────────────────────────
  let tenant = await Tenant.findOne({ subdomain: TEST_TENANT_SUBDOMAIN });
  if (!tenant) {
    tenant = await Tenant.create({
      name: 'Demo Organisation',
      subdomain: TEST_TENANT_SUBDOMAIN,
      contactEmail: TEST_ADMIN_EMAIL,
      plan: freePlan._id,
      isOnTrial: true,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'active',
      settings: { requireEmailVerification: false },
    });
    console.log(`✓ Demo tenant created — subdomain: ${TEST_TENANT_SUBDOMAIN}`);
  } else {
    console.log(`- Demo tenant already exists (${TEST_TENANT_SUBDOMAIN})`);
  }

  // ── Demo Tenant Admin ──────────────────────────────────────────────────────
  let tenantAdmin = await User.findOne({ tenantId: tenant._id, email: TEST_ADMIN_EMAIL });
  if (!tenantAdmin) {
    await User.create({
      tenantId: tenant._id,
      firstName: 'Demo',
      lastName: 'Admin',
      email: TEST_ADMIN_EMAIL,
      passwordHash: TEST_ADMIN_PASSWORD,
      role: 'tenant_admin',
      status: 'active',
    });
    console.log(`✓ Demo tenant admin created — ${TEST_ADMIN_EMAIL} / ${TEST_ADMIN_PASSWORD}`);
  } else {
    console.log(`- Demo tenant admin already exists (${TEST_ADMIN_EMAIL})`);
  }

  // ── Demo Instructor ────────────────────────────────────────────────────────
  let instructor = await User.findOne({ tenantId: tenant._id, email: TEST_INSTRUCTOR_EMAIL });
  if (!instructor) {
    await User.create({
      tenantId: tenant._id,
      firstName: 'Demo',
      lastName: 'Instructor',
      email: TEST_INSTRUCTOR_EMAIL,
      passwordHash: TEST_INSTRUCTOR_PASSWORD,
      role: 'instructor',
      status: 'active',
    });
    console.log(`✓ Demo instructor created — ${TEST_INSTRUCTOR_EMAIL} / ${TEST_INSTRUCTOR_PASSWORD}`);
  } else {
    console.log(`- Demo instructor already exists (${TEST_INSTRUCTOR_EMAIL})`);
  }

  // ── Demo Student ───────────────────────────────────────────────────────────
  let student = await User.findOne({ tenantId: tenant._id, email: TEST_STUDENT_EMAIL });
  if (!student) {
    await User.create({
      tenantId: tenant._id,
      firstName: 'Demo',
      lastName: 'Student',
      email: TEST_STUDENT_EMAIL,
      passwordHash: TEST_STUDENT_PASSWORD,
      role: 'student',
      status: 'active',
    });
    console.log(`✓ Demo student created — ${TEST_STUDENT_EMAIL} / ${TEST_STUDENT_PASSWORD}`);
  } else {
    console.log(`- Demo student already exists (${TEST_STUDENT_EMAIL})`);
  }

  console.log('\n── Seed complete ─────────────────────────────');
  console.log(`  Super Admin  : ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
  console.log(`  Tenant Admin : ${TEST_ADMIN_EMAIL} / ${TEST_ADMIN_PASSWORD}`);
  console.log(`  Instructor   : ${TEST_INSTRUCTOR_EMAIL} / ${TEST_INSTRUCTOR_PASSWORD}`);
  console.log(`  Student      : ${TEST_STUDENT_EMAIL} / ${TEST_STUDENT_PASSWORD}`);
  console.log(`  Tenant URL   : http://localhost:3000/login?tenant=demo`);
  console.log('──────────────────────────────────────────────\n');

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
