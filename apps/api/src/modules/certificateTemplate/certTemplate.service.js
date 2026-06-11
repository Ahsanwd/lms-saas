const CertificateTemplate = require('../../database/models/CertificateTemplate.model');
const { getPublicUrl } = require('../../services/storage/storage.service');

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

// Get template for a course — falls back to tenant default, then system defaults
async function getTemplate(tenantId, courseId = null) {
  // Try course-specific first
  if (courseId) {
    const specific = await CertificateTemplate.findOne({ tenantId, courseId });
    if (specific) return specific;
  }
  // Fallback to tenant-wide default
  const def = await CertificateTemplate.findOne({ tenantId, courseId: null });
  return def ?? { ...DEFAULT_FIELDS, tenantId, courseId: null };
}

// Save (upsert) template for a course or tenant default
async function saveTemplate(tenantId, data, actingUser, courseId = null) {
  const allowed = [
    'organizationName', 'heading', 'subheading', 'bodyText', 'footerNote',
    'signatoryName', 'signatoryTitle',
    'secondSignatoryName', 'secondSignatoryTitle',
    'accentColor', 'backgroundColor', 'borderStyle', 'fontFamily',
    'nameFontSize', 'titleFontSize', 'showBadge', 'expiryDays',
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
  await CertificateTemplate.deleteOne({ tenantId, courseId: courseId ?? null });
  return { ...DEFAULT_FIELDS };
}

module.exports = { getTemplate, saveTemplate, uploadLogo, uploadBackground, uploadSignature, uploadSecondSignature, resetTemplate };
