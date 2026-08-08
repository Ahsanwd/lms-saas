const contactSubmissionRepo = require('../../database/repositories/contactSubmission.repository');
const tenantPageRepo = require('../../database/repositories/tenantPage.repository');
const tenantRepo = require('../../database/repositories/tenant.repository');
const Tenant = require('../../database/models/Tenant.model');
const AppError = require('../../utils/AppError');
const { queueEmail } = require('../../jobs/email.job');
const contactFormSubmissionTemplate = require('../../services/email/templates/contactFormSubmission');
const config = require('../../config');

const MAX_FIELD_LENGTH = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertReasonableLength(value, field) {
  if (value && String(value).length > MAX_FIELD_LENGTH)
    throw new AppError(`${field} is too long`, 400);
}

// Public — no auth. The recipient is deliberately never taken from client
// input: it's resolved entirely from req.tenant (set by resolveTenant off
// the request's hostname/header) plus that tenant's own stored settings —
// this is the actual guarantee against a submission ever reaching the
// wrong tenant, not something bolted on after the fact.
async function submit(tenantId, pageId, data, meta) {
  const { name, email, phone, subject, message } = data;

  if (!email || !EMAIL_RE.test(email)) throw new AppError('A valid email is required', 400);
  if (!message || !message.trim()) throw new AppError('Message is required', 400);
  assertReasonableLength(name, 'Name');
  assertReasonableLength(phone, 'Phone');
  assertReasonableLength(subject, 'Subject');
  if (message.length > MAX_FIELD_LENGTH * 5) throw new AppError('Message is too long', 400);

  const submission = await contactSubmissionRepo.create({
    tenantId, pageId: pageId || null,
    name: name || null, email, phone: phone || null, subject: subject || null, message,
    ip: meta?.ip || null,
  });

  // In-app notification to every tenant admin — the actual "someone
  // contacted us" indicator (the outbound email above depends on Brevo
  // delivery and a correctly-configured recipient; this doesn't).
  const User = require('../../database/models/User.model');
  const admins = await User.find({ tenantId, role: 'tenant_admin', deletedAt: null }).select('_id').lean();
  if (admins.length > 0) {
    const notifySvc = require('../notification/notification.service');
    notifySvc.createBulk(tenantId, admins.map((a) => a._id), {
      type: 'contact_submission',
      title: 'New contact form submission',
      message: `${name || email}: ${subject || message.slice(0, 100)}`,
      link: '/contact-submissions',
    }).catch(() => {});
  }

  // Resolve recipient: the contactForm section's own override, else the
  // tenant's registered contact email. Never client-supplied.
  let recipientEmail = null;
  if (pageId) {
    const page = await tenantPageRepo.findById(tenantId, pageId);
    const section = page?.sections?.find((s) => s.type === 'contactForm');
    recipientEmail = section?.data?.recipientEmail || null;
  }
  if (!recipientEmail) {
    const tenant = await Tenant.findById(tenantId).select('contactEmail').lean();
    recipientEmail = tenant?.contactEmail || null;
  }

  if (recipientEmail) {
    const { tenantName, branding } = await tenantRepo.getBranding(tenantId);
    const template = contactFormSubmissionTemplate({
      name, email, phone, subject, message,
      submittedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      tenantName, appUrl: config.app.url, branding,
    });
    // Delivery outcome (success or failure) is recorded by the email job
    // itself once the send actually completes — see markContactDeliveryOutcome
    // in email.job.js. This call is fire-and-forget; the DB record already
    // exists regardless of the email outcome.
    queueEmail({
      to: recipientEmail,
      tenantId: tenantId.toString(),
      contactSubmissionId: submission._id.toString(),
      ...template,
    }).catch(() => {});
  }

  return submission;
}

function listSubmissions(tenantId, query) {
  return contactSubmissionRepo.findAll(tenantId, query);
}

function getUnreadCount(tenantId) {
  return contactSubmissionRepo.countUnread(tenantId);
}

async function markStatus(tenantId, id, status) {
  if (!['new', 'read'].includes(status)) throw new AppError('Invalid status', 400);
  const submission = await contactSubmissionRepo.updateById(tenantId, id, { status });
  if (!submission) throw new AppError('Submission not found', 404);
  return submission;
}

async function deleteSubmission(tenantId, id, userId) {
  const submission = await contactSubmissionRepo.softDeleteById(tenantId, id, userId);
  if (!submission) throw new AppError('Submission not found', 404);
  return submission;
}

module.exports = { submit, listSubmissions, markStatus, getUnreadCount, deleteSubmission };
