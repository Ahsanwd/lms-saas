const { emailLayout } = require('./emailLayout');

module.exports = ({ adminName, userName, userEmail, lockUntil, ip, tenantName, branding = {} }) => ({
  subject: `Security Alert: Account locked — ${tenantName}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#DC2626">&#9888; Security Alert</h2>
      <p style="color:#374151;margin:0 0 20px">Hi ${adminName}, a user account has been <strong>temporarily locked</strong> after too many failed login attempts.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
        <tr style="background:#FEF2F2">
          <td style="padding:10px 12px;border:1px solid #FECACA;font-weight:600;width:35%">User</td>
          <td style="padding:10px 12px;border:1px solid #FECACA">${userName}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;border:1px solid #E5E7EB;font-weight:600">Email</td>
          <td style="padding:10px 12px;border:1px solid #E5E7EB">${userEmail}</td>
        </tr>
        <tr style="background:#F9FAFB">
          <td style="padding:10px 12px;border:1px solid #E5E7EB;font-weight:600">IP Address</td>
          <td style="padding:10px 12px;border:1px solid #E5E7EB">${ip || 'Unknown'}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;border:1px solid #E5E7EB;font-weight:600">Locked Until</td>
          <td style="padding:10px 12px;border:1px solid #E5E7EB">${new Date(lockUntil).toUTCString()}</td>
        </tr>
      </table>
      <p style="color:#374151;margin:0 0 8px">If this looks suspicious, review the user's account or contact them directly. The account will unlock automatically after the lockout period.</p>
    `,
  }),
});
