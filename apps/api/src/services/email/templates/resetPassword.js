const { emailLayout } = require('./emailLayout');

module.exports = ({ name, resetUrl, tenantName, branding = {} }) => ({
  subject: `Reset your password — ${tenantName}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827">Hi ${name},</h2>
      <p style="margin:0 0 16px;color:#374151">We received a request to reset your <strong>${tenantName}</strong> password.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#EF4444;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
          Reset Password
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  }),
});
