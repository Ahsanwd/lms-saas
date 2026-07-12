const { emailLayout } = require('./emailLayout');

module.exports = ({ firstName, tenantName, role, email, password, loginUrl, branding = {} }) => ({
  subject: `Your ${tenantName} account is ready`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827">Welcome, ${firstName}!</h2>
      <p style="margin:0 0 16px;color:#374151">An account has been created for you on <strong>${tenantName}</strong> as a <strong>${role}</strong>. Here are your login details:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin:0 0 20px">
        <tr>
          <td style="padding:16px 20px">
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Email</p>
            <p style="margin:0 0 12px;font-size:15px;font-family:monospace;color:#111827">${email}</p>
            <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Password</p>
            <p style="margin:0;font-size:15px;font-family:monospace;color:#111827">${password}</p>
          </td>
        </tr>
      </table>
      <p style="margin:24px 0">
        <a href="${loginUrl}" style="background:#10B981;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
          Log In Now
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px;margin:0">For your security, we recommend changing your password after your first login.</p>
    `,
  }),
});
