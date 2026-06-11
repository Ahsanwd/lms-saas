const { emailLayout } = require('./emailLayout');

module.exports = ({ name, verifyUrl, tenantName, branding = {} }) => ({
  subject: `Verify your email — ${tenantName}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827">Hi ${name},</h2>
      <p style="margin:0 0 16px;color:#374151">Welcome to <strong>${tenantName}</strong>. Please verify your email address to activate your account.</p>
      <p style="margin:24px 0">
        <a href="${verifyUrl}" style="background:#3B82F6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
          Verify Email
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0">This link expires in 24 hours. If you didn't sign up, you can safely ignore this email.</p>
    `,
  }),
});
