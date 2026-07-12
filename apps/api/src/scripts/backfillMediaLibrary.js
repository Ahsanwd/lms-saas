// One-off script: catalogs files uploaded BEFORE the Media Library feature
// existed into the new Media collection, by scanning every model field known
// to store a file URL. Safe to re-run — skips any URL already in Media.
//
// Known, accepted limitation: course content-images (from
// POST /courses/:id/content-images) are never persisted to any field on the
// Course document, so there is nothing to scan for those — they cannot be
// backfilled. Chat attachments and Website Builder page images are also
// skipped (arbitrarily nested/free-form data, not a fixed field to scan).
//
// sizeBytes for backfilled entries defaults to 0 for R2/Cloudflare-hosted
// files — size was never tracked before this feature existed and getting the
// real value would require a network call per file (out of scope for a
// one-off backfill). Local files get their real on-disk size via fs.statSync.

require('dotenv').config();
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const fs = require('fs');
const config = require('../config');

async function run() {
  await mongoose.connect(config.mongodb.uri);
  console.log('Connected to MongoDB');

  const Media = require('../database/models/Media.model');
  const Course = require('../database/models/Course.model');
  const Lesson = require('../database/models/Lesson.model');
  const Tenant = require('../database/models/Tenant.model');
  const CertificateTemplate = require('../database/models/CertificateTemplate.model');
  const User = require('../database/models/User.model');

  const { UPLOAD_ROOT } = require('../services/storage/storage.service');
  const path = require('path');

  let created = 0, skipped = 0;

  function providerFor(url) {
    if (!url) return null;
    return url.startsWith('http') ? 's3' : 'local';
  }

  function localSize(url) {
    try {
      if (url.startsWith('http')) return 0;
      const rel = url.replace(/^\/uploads\//, '');
      const p = path.join(UPLOAD_ROOT, rel);
      return fs.existsSync(p) ? fs.statSync(p).size : 0;
    } catch { return 0; }
  }

  async function upsertMedia(tenantId, url, fields) {
    if (!url) return;
    const exists = await Media.findOne({ tenantId, url, deletedAt: null }).select('_id').lean();
    if (exists) { skipped++; return; }
    await Media.create({ tenantId, url, provider: providerFor(url), ...fields });
    created++;
  }

  // ── Courses: thumbnail ────────────────────────────────────────────────────
  const courses = await Course.find({ deletedAt: null }).select('tenantId thumbnail').lean();
  for (const c of courses) {
    if (!c.thumbnail) continue;
    await upsertMedia(c.tenantId, c.thumbnail, {
      category: 'thumbnail', sizeBytes: localSize(c.thumbnail),
      contextType: 'course-thumbnail', contextId: c._id,
    });
  }

  // ── Lessons: video, audio, file, attachments[] ───────────────────────────
  const lessons = await Lesson.find({ deletedAt: null })
    .select('tenantId video audio file attachments').lean();
  const internalVideoProviders = new Set(['local', 's3']); // cloudflare already tracked live, external providers skipped
  for (const l of lessons) {
    if (l.video?.url && internalVideoProviders.has(l.video.provider)) {
      await upsertMedia(l.tenantId, l.video.url, {
        category: 'video', sizeBytes: localSize(l.video.url),
        durationSeconds: l.video.durationSeconds || null,
        contextType: 'lesson-video', contextId: l._id,
      });
    }
    if (l.audio?.url && internalVideoProviders.has(l.audio.provider)) {
      await upsertMedia(l.tenantId, l.audio.url, {
        category: 'audio', sizeBytes: localSize(l.audio.url),
        durationSeconds: l.audio.durationSeconds || null,
        contextType: 'lesson-audio', contextId: l._id,
      });
    }
    if (l.file?.url) {
      await upsertMedia(l.tenantId, l.file.url, {
        category: 'attachment', sizeBytes: l.file.sizeBytes || localSize(l.file.url),
        filename: l.file.name || null, mimeType: l.file.mimeType || null,
        contextType: 'lesson-file', contextId: l._id,
      });
    }
    for (const att of l.attachments || []) {
      await upsertMedia(l.tenantId, att.url, {
        category: 'attachment', sizeBytes: att.sizeBytes || localSize(att.url),
        filename: att.name || null, mimeType: att.mimeType || null,
        contextType: 'lesson-attachment', contextId: l._id,
      });
    }
  }

  // ── Tenants: logo, favicon ────────────────────────────────────────────────
  const tenants = await Tenant.find({}).select('settings.logo settings.favicon').lean();
  for (const t of tenants) {
    if (t.settings?.logo)    await upsertMedia(t._id, t.settings.logo,    { category: 'thumbnail', sizeBytes: localSize(t.settings.logo),    contextType: 'tenant-logo',    contextId: t._id });
    if (t.settings?.favicon) await upsertMedia(t._id, t.settings.favicon, { category: 'thumbnail', sizeBytes: localSize(t.settings.favicon), contextType: 'tenant-favicon', contextId: t._id });
  }

  // ── Certificate templates: logo, background, signature, second signature ─
  const certs = await CertificateTemplate.find({})
    .select('tenantId logoUrl backgroundImageUrl signatureImageUrl secondSignatureImageUrl').lean();
  for (const ct of certs) {
    const fields = [
      ['logoUrl', 'certificate-logo'],
      ['backgroundImageUrl', 'certificate-background'],
      ['signatureImageUrl', 'certificate-signature'],
      ['secondSignatureImageUrl', 'certificate-second-signature'],
    ];
    for (const [field, contextType] of fields) {
      if (ct[field]) await upsertMedia(ct.tenantId, ct[field], {
        category: 'thumbnail', sizeBytes: localSize(ct[field]), contextType, contextId: ct._id,
      });
    }
  }

  // ── User avatars ──────────────────────────────────────────────────────────
  const users = await User.find({ avatar: { $ne: null } }).select('tenantId avatar').lean();
  for (const u of users) {
    await upsertMedia(u.tenantId, u.avatar, {
      category: 'thumbnail', sizeBytes: localSize(u.avatar), contextType: 'user-avatar', contextId: u._id,
    });
  }

  console.log(`\n── Backfill complete ─────────────────────────────`);
  console.log(`  Created: ${created}`);
  console.log(`  Already existed (skipped): ${skipped}`);
  console.log(`──────────────────────────────────────────────────`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
