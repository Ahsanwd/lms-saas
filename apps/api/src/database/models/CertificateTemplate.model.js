const mongoose = require('mongoose');
const auditFieldsPlugin = require('../plugins/auditFields.plugin');

// One template per tenant (courseId null = default for all courses)
// Course-specific templates override the tenant default.
const certTemplateSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },

    organizationName: { type: String, default: '' },
    logoUrl:          { type: String, default: null },

    // Body text (support {{studentName}}, {{courseTitle}}, {{date}} tokens)
    heading:    { type: String, default: 'Certificate of Completion' },
    subheading: { type: String, default: 'This certifies that' },
    bodyText:   { type: String, default: 'has successfully completed the course' },
    footerNote: { type: String, default: '' },

    // Signatory
    signatoryName:     { type: String, default: '' },
    signatoryTitle:    { type: String, default: 'Course Instructor' },
    signatureImageUrl: { type: String, default: null },

    // Second signatory (optional)
    secondSignatoryName:     { type: String, default: '' },
    secondSignatoryTitle:    { type: String, default: '' },
    secondSignatureImageUrl: { type: String, default: null },

    // Visual style
    accentColor:        { type: String, default: '#0284c7' },
    backgroundColor:    { type: String, default: '#ffffff' },
    backgroundImageUrl: { type: String, default: null },
    borderStyle:        { type: String, enum: ['classic', 'modern', 'minimal', 'elegant'], default: 'classic' },
    fontFamily:         { type: String, enum: ['serif', 'sans', 'elegant'], default: 'serif' },
    nameFontSize:       { type: Number, default: 36, min: 18, max: 72 },
    titleFontSize:      { type: Number, default: 22, min: 12, max: 48 },
    showBadge:          { type: Boolean, default: true },

    // Expiry — if set, certificates issued for this template expire N days after issuance
    expiryDays: { type: Number, default: null },
  },
  { timestamps: true }
);

// One template per tenant+course pair
certTemplateSchema.index({ tenantId: 1, courseId: 1 }, { unique: true });

certTemplateSchema.plugin(auditFieldsPlugin);

module.exports = mongoose.model('CertificateTemplate', certTemplateSchema);
