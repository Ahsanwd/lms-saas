const CertificateTemplate = require('../../database/models/CertificateTemplate.model');
const Course = require('../../database/models/Course.model');
const { getPublicUrl } = require('../../services/storage/storage.service');
const AppError = require('../../utils/AppError');

// requirePermission('course:manage') passes for every instructor tenant-wide,
// not just the ones teaching a given course — so writes need their own
// ownership check here. Only a tenant admin may touch the org-wide default
// (courseId null), since it applies to every course in the tenant.
async function assertCanEditTemplate(tenantId, actingUser, courseId) {
  if (['tenant_admin', 'super_admin'].includes(actingUser.role)) return;
  if (!courseId)
    throw new AppError('Only a tenant admin can edit the organization-wide default certificate template', 403);
  const course = await Course.findOne({ _id: courseId, tenantId }).select('instructorId').lean();
  if (!course) throw new AppError('Course not found', 404);
  const ownerId = course.instructorId?._id?.toString() ?? course.instructorId?.toString();
  if (ownerId !== actingUser.sub) throw new AppError('Forbidden', 403);
}

const DEFAULT_FIELDS = {
  organizationName: '',
  logoUrl: null,
  heading: 'Certificate of Completion',
  subheading: 'This certifies that',
  bodyText: 'has successfully completed the course',
  footerNote: '',
  signatoryName: '',
  signatoryTitle: 'Course Instructor',
  signatureImageUrl: null,
  secondSignatoryName: '',
  secondSignatoryTitle: '',
  secondSignatureImageUrl: null,
  accentColor: '#0284c7',
  backgroundColor: '#ffffff',
  backgroundImageUrl: null,
  borderStyle: 'classic',
  fontFamily: 'serif',
  nameFontSize: 36,
  titleFontSize: 22,
  showBadge: true,
  expiryDays: null,
};

// Get template for a course — falls back to tenant default, then system defaults.
// isCourseSpecific tells the caller whether courseId actually has its own
// override saved, or whether it's inheriting the tenant-wide default —
// the builder UI uses this to show "custom" vs "using organization default".
async function getTemplate(tenantId, courseId = null) {
  // Try course-specific first
  if (courseId) {
    const specific = await CertificateTemplate.findOne({ tenantId, courseId }).lean();
    if (specific) return { ...specific, isCourseSpecific: true };
  }
  // Fallback to tenant-wide default
  const def = await CertificateTemplate.findOne({ tenantId, courseId: null }).lean();
  return def
    ? { ...def, isCourseSpecific: false }
    : { ...DEFAULT_FIELDS, tenantId, courseId: null, isCourseSpecific: false };
}

// Save (upsert) template for a course or tenant default
async function saveTemplate(tenantId, data, actingUser, courseId = null) {
  await assertCanEditTemplate(tenantId, actingUser, courseId);
  const allowed = [
    'organizationName', 'heading', 'subheading', 'bodyText', 'footerNote',
    'signatoryName', 'signatoryTitle',
    'secondSignatoryName', 'secondSignatoryTitle',
    'accentColor', 'backgroundColor', 'borderStyle', 'fontFamily',
    'nameFontSize', 'titleFontSize', 'showBadge', 'expiryDays',
    // image URL fields — writable here too (not just via the upload
    // endpoints) so the builder's "Remove" buttons can actually clear them
    'logoUrl', 'signatureImageUrl', 'backgroundImageUrl', 'secondSignatureImageUrl',
  ];
  const update = { updatedBy: actingUser.sub };
  allowed.forEach(f => { if (data[f] !== undefined) update[f] = data[f]; });

  const template = await CertificateTemplate.findOneAndUpdate(
    { tenantId, courseId: courseId ?? null },
    { $set: update, $setOnInsert: { createdBy: actingUser.sub } },
    { upsert: true, new: true }
  );
  return template;
}

// Upload logo image (req.file from multer)
async function uploadLogo(tenantId, file, actingUser, courseId = null) {
  await assertCanEditTemplate(tenantId, actingUser, courseId);
  const url = getPublicUrl(file.path);
  const template = await CertificateTemplate.findOneAndUpdate(
    { tenantId, courseId: courseId ?? null },
    { $set: { logoUrl: url, updatedBy: actingUser.sub }, $setOnInsert: { createdBy: actingUser.sub } },
    { upsert: true, new: true }
  );
  return { logoUrl: template.logoUrl };
}

// Upload signature image (req.file from multer)
async function uploadSignature(tenantId, file, actingUser, courseId = null) {
  await assertCanEditTemplate(tenantId, actingUser, courseId);
  const url = getPublicUrl(file.path);
  const template = await CertificateTemplate.findOneAndUpdate(
    { tenantId, courseId: courseId ?? null },
    { $set: { signatureImageUrl: url, updatedBy: actingUser.sub }, $setOnInsert: { createdBy: actingUser.sub } },
    { upsert: true, new: true }
  );
  return { signatureImageUrl: template.signatureImageUrl };
}

// Upload background image (req.file from multer)
async function uploadBackground(tenantId, file, actingUser, courseId = null) {
  await assertCanEditTemplate(tenantId, actingUser, courseId);
  const url = getPublicUrl(file.path);
  const template = await CertificateTemplate.findOneAndUpdate(
    { tenantId, courseId: courseId ?? null },
    { $set: { backgroundImageUrl: url, updatedBy: actingUser.sub }, $setOnInsert: { createdBy: actingUser.sub } },
    { upsert: true, new: true }
  );
  return { backgroundImageUrl: template.backgroundImageUrl };
}

// Upload second signature image (req.file from multer)
async function uploadSecondSignature(tenantId, file, actingUser, courseId = null) {
  await assertCanEditTemplate(tenantId, actingUser, courseId);
  const url = getPublicUrl(file.path);
  const template = await CertificateTemplate.findOneAndUpdate(
    { tenantId, courseId: courseId ?? null },
    { $set: { secondSignatureImageUrl: url, updatedBy: actingUser.sub }, $setOnInsert: { createdBy: actingUser.sub } },
    { upsert: true, new: true }
  );
  return { secondSignatureImageUrl: template.secondSignatureImageUrl };
}

// Reset to defaults
async function resetTemplate(tenantId, actingUser, courseId = null) {
  await assertCanEditTemplate(tenantId, actingUser, courseId);
  await CertificateTemplate.deleteOne({ tenantId, courseId: courseId ?? null });
  return { ...DEFAULT_FIELDS };
}

module.exports = { getTemplate, saveTemplate, uploadLogo, uploadBackground, uploadSignature, uploadSecondSignature, resetTemplate };
