const { emailLayout } = require('./emailLayout');

module.exports = ({ studentName, itemLabel = 'Course', itemName, ctaUrl, tenantName, appUrl, branding = {} }) => ({
  subject: `Your payment for "${itemName}" was approved`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Great news, ${studentName}! ✅</h2>
      <p style="color:#6b7280;margin:0 0 24px">We verified your payment — you're enrolled.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:12px;color:#059669;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">${itemLabel}</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#1f2937">${itemName}</p>
      </div>
      <a href="${ctaUrl}" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Start Learning →
      </a>
    `,
  }),
});
