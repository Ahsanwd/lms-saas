const { emailLayout } = require('./emailLayout');

module.exports = ({ studentName, courseName, note, tenantName, appUrl, branding = {} }) => ({
  subject: `Update on your enrollment request for "${courseName}"`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Hi ${studentName},</h2>
      <p style="color:#6b7280;margin:0 0 24px">Unfortunately your enrollment request for <strong>${courseName}</strong> was not approved at this time.</p>
      ${note ? `
      <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#92400e"><strong>Reason:</strong> ${note}</p>
      </div>` : ''}
      <p style="color:#6b7280;margin:0 0 24px">You can browse other available courses or contact your instructor for more information.</p>
      <a href="${appUrl}/courses" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Browse Courses
      </a>
    `,
  }),
});
