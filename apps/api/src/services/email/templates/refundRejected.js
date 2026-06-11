const { emailLayout } = require('./emailLayout');

module.exports = ({ recipientName, courseName, adminNote, paymentsUrl, tenantName, branding = {} }) => ({
  subject: `Your refund request was not approved — ${tenantName}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Refund Request Update</h2>
      <p style="color:#6b7280;margin:0 0 24px">Hi ${recipientName}, we have reviewed your refund request and are unable to approve it at this time.</p>

      ${courseName ? `
      <div style="margin-bottom:16px">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Course</p>
        <p style="margin:0;font-size:15px;font-weight:600;color:#111827">${courseName}</p>
      </div>` : ''}

      ${adminNote ? `
      <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0 0 6px;font-size:12px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Reason</p>
        <p style="margin:0;font-size:14px;color:#92400e;line-height:1.6">${adminNote}</p>
      </div>` : '<p style="color:#6b7280;margin:0 0 24px;font-size:14px">If you believe this decision was made in error, please contact support.</p>'}

      <a href="${paymentsUrl}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        View Payment History
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">
        You received this regarding your refund request on ${tenantName}.
      </p>
    `,
  }),
});
