const { emailLayout } = require('./emailLayout');

module.exports = ({ recipientName, courseName, paymentsUrl, tenantName, branding = {} }) => ({
  subject: `Your refund request has been approved — ${tenantName}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <div style="text-align:center;margin-bottom:24px">
        <div style="display:inline-block;background:#dcfce7;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px">✓</div>
      </div>
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827;text-align:center">Refund Approved</h2>
      <p style="color:#6b7280;margin:0 0 24px;text-align:center">Hi ${recipientName}, your refund request has been approved.</p>

      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:20px;margin-bottom:24px">
        ${courseName ? `<p style="margin:0 0 8px;font-size:13px;color:#6b7280">Course</p><p style="margin:0;font-size:15px;font-weight:600;color:#111827">${courseName}</p>` : ''}
        <p style="margin:${courseName ? '12px' : '0'} 0 0;font-size:13px;color:#15803d">
          Your refund has been processed. Funds typically appear in 5–10 business days depending on your payment provider.
        </p>
      </div>

      <a href="${paymentsUrl}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        View Payment History
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">
        This is a confirmation of your refund approval on ${tenantName}.
      </p>
    `,
  }),
});
