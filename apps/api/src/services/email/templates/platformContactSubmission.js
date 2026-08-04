const { emailLayout } = require('./emailLayout');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = ({ name, email, phone, message, submittedAt }) => ({
  subject: `New contact message from coursel.space${name ? ` — ${escapeHtml(name)}` : ''}`,
  html: emailLayout({
    tenantName: 'Coursel',
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">New contact form submission</h2>
      <p style="color:#6b7280;margin:0 0 24px">Someone submitted the contact form on coursel.space.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">Name</td><td style="padding:4px 0;color:#111827">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">Email</td><td style="padding:4px 0"><a href="mailto:${escapeHtml(email)}" style="color:#3B82F6">${escapeHtml(email)}</a></td></tr>
          ${phone ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">Phone</td><td style="padding:4px 0;color:#111827">${escapeHtml(phone)}</td></tr>` : ''}
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">Submitted</td><td style="padding:4px 0;color:#111827">${escapeHtml(submittedAt)}</td></tr>
        </table>
        <div style="white-space:pre-wrap;color:#111827;margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb">${escapeHtml(message)}</div>
      </div>
    `,
  }),
});
