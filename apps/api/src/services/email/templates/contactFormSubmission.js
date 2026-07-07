const { emailLayout } = require('./emailLayout');

// Visitor-supplied values are anonymous public input — unlike this
// codebase's other templates (used between already-authenticated tenant
// users), these MUST be escaped before interpolation to prevent HTML
// injection into the tenant's inbox.
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = ({ name, email, phone, subject, message, submittedAt, tenantName, appUrl, branding = {} }) => ({
  subject: `New contact form submission${subject ? `: ${escapeHtml(subject)}` : ''}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">New contact form submission</h2>
      <p style="color:#6b7280;margin:0 0 24px">Someone submitted your website's contact form.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          ${name ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px">Name</td><td style="padding:6px 0;font-weight:600">${escapeHtml(name)}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:6px 0"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          ${phone ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Phone</td><td style="padding:6px 0">${escapeHtml(phone)}</td></tr>` : ''}
          ${subject ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Subject</td><td style="padding:6px 0">${escapeHtml(subject)}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Submitted</td><td style="padding:6px 0">${escapeHtml(submittedAt)}</td></tr>
        </table>
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;white-space:pre-wrap;color:#111827">${escapeHtml(message)}</div>
      </div>
      <a href="${appUrl}/contact-submissions" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        View in Dashboard
      </a>
    `,
  }),
});
