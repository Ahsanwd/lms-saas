const { emailLayout } = require('./emailLayout');

module.exports = ({ studentName, itemLabel = 'Course', itemName, note, tenantName, appUrl, branding = {} }) => ({
  subject: `Update on your payment for "${itemName}"`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Hi ${studentName},</h2>
      <p style="color:#6b7280;margin:0 0 24px">We couldn't verify your payment proof for <strong>${itemName}</strong>.</p>
      ${note ? `
      <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#92400e"><strong>Reason:</strong> ${note}</p>
      </div>` : ''}
      <p style="color:#6b7280;margin:0 0 24px">Please upload a new payment screenshot from your payment history page and we'll take another look.</p>
      <a href="${appUrl}/my-payments" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        View Payment
      </a>
    `,
  }),
});
