// One-time (but idempotent — safe to re-run) migration: converts every
// tenant's legacy Tenant.websiteContent into a TenantPage 'home' document.
// Part of the multi-page Website Builder migration, Phase 1a.
//
// Usage: node src/scripts/backfillTenantPages.js
require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const config = require('../config');

async function backfill() {
  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to MongoDB');

  const Tenant = require('../database/models/Tenant.model');
  const tenantPageRepo = require('../database/repositories/tenantPage.repository');
  const { sectionsFromWebsiteContent } = require('../modules/tenantPage/tenantPage.service');

  const tenants = await Tenant.find({ deletedAt: null }).select('_id websiteContent').lean();
  console.log(`Found ${tenants.length} tenant(s)`);

  let migrated = 0;

  for (const tenant of tenants) {
    // Race-safe upsert — no-ops (returns the existing doc) if a 'home' page
    // already exists for this tenant.
    const home = await tenantPageRepo.upsertHomePage(tenant._id, { title: 'Home' });

    const hadLegacyContent = !!(tenant.websiteContent?.isPublished || tenant.websiteContent?.instituteType);
    const homeAlreadyPopulated = home.sections.length > 0;

    if (hadLegacyContent && !homeAlreadyPopulated) {
      await tenantPageRepo.updateById(tenant._id, home._id, {
        instituteType: tenant.websiteContent.instituteType ?? null,
        isPublished: !!tenant.websiteContent.isPublished,
        sections: sectionsFromWebsiteContent(tenant.websiteContent),
      });
      migrated += 1;
      console.log(`  Backfilled tenant ${tenant._id}`);
    }
  }

  console.log(`\nDone. Migrated: ${migrated} / ${tenants.length} tenant(s).`);
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
