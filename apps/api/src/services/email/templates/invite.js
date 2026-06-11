const { emailLayout } = require('./emailLayout');

module.exports = ({ inviterName, tenantName, role, inviteUrl, expiresInHours = 72, branding = {} }) => ({
  subject: `You've been invited to ${tenantName}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827">You're invited!</h2>
      <p style="margin:0 0 16px;color:#374151"><strong>${inviterName}</strong> has invited you to join <strong>${tenantName}</strong> as a <strong>${role}</strong>.</p>
      <p style="margin:24px 0">
        <a href="${inviteUrl}" style="background:#10B981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
          Accept Invitation
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0">This invitation expires in ${expiresInHours} hours.</p>
    `,
  }),
});
