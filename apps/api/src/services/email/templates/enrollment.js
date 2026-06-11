const { emailLayout } = require('./emailLayout');

module.exports = ({ studentName, courseName, courseId, tenantName, appUrl, branding = {} }) => ({
  subject: `You're now enrolled in "${courseName}"`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:20px;color:#111827">Hi ${studentName}, welcome aboard! 🎓</h2>
      <p style="color:#6b7280;margin:0 0 24px">You have been successfully enrolled in a new course.</p>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:12px;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Course</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#1f2937">${courseName}</p>
      </div>
      <a href="${appUrl}/courses/${courseId}/learn" style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Start Learning →
      </a>
    `,
  }),
});
