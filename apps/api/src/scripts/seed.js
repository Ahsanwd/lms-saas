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

  // ── Plans ──────────────────────────────────────────────────────────────────
  // Upserted (not just created-if-missing) so pricing/limits stay in sync with
  // the public pricing page (apps/web/app/page.tsx `plans` array) and the
  // Lemon Squeezy variant slugs (LS_VARIANT_{BASIC,PRO}_{MONTHLY,YEARLY}).
  const planDefs = [
    {
      name: 'Free',
      slug: 'free',
      price: { monthly: 0, yearly: 0 },
      limits: { students: 50, instructors: 3, courses: 5, storageGB: 2, maxSessions: 2, streamStorageMinutes: 0, streamViewerMinutes: 0 },
      features: ['Basic courses', 'Email support', '🔒 Cloudflare Stream video (Basic & Pro only)'],
      trialDays: 14,
      isActive: true,
    },
    {
      name: 'Basic',
      slug: 'basic',
      price: { monthly: 29, yearly: 290 },
      limits: { students: 100, instructors: 3, courses: 10, storageGB: 10, maxSessions: 5, streamStorageMinutes: 300, streamViewerMinutes: 3000 },
      features: [
        'Up to 100 students',
        '3 instructors',
        '10 courses',
        '10 GB storage',
        'Course payments (Stripe)',
        'Quizzes & Assignments',
        'Email notifications',
        'Community forum',
        'Certificate builder',
        'Cloudflare Stream video — 300 min library / 3,000 min watch-time per month',
      ],
      trialDays: 14,
      isActive: true,
    },
    {
      name: 'Pro',
      slug: 'pro',
      price: { monthly: 59, yearly: 590 },
      limits: { students: -1, instructors: -1, courses: -1, storageGB: 50, maxSessions: 10, streamStorageMinutes: 600, streamViewerMinutes: 6000 },
      features: [
        'Unlimited students',
        'Unlimited instructors',
        'Unlimited courses',
        '50 GB storage',
        'Everything in Basic',
        'Live learning (Zoom)',
        'Advanced analytics & CSV export',
        'Student memberships',
        'Custom domain support',
        'Priority support',
        'Cloudflare Stream video — 600 min library / 6,000 min watch-time per month',
      ],
      trialDays: 14,
      isActive: true,
    },
  ];

  let freePlan;
  for (const def of planDefs) {
    const existing = await Plan.findOne({ slug: def.slug });
    const plan = await Plan.findOneAndUpdate(
      { slug: def.slug },
      { $set: def },
      { upsert: true, new: true }
    );
    if (def.slug === 'free') freePlan = plan;
    console.log(existing ? `✓ ${def.name} plan updated` : `✓ ${def.name} plan created`);
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
