const { emailLayout } = require('./emailLayout');

module.exports = ({ studentName, courseName, courseId, tenantName, appUrl, branding = {} }) => ({
  subject: `You completed "${courseName}" 🏆`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <div style="text-align:center;padding:8px 0 24px">
        <div style="font-size:52px;margin-bottom:8px">🏆</div>
        <h2 style="margin:0 0 8px;font-size:22px;color:#111827">Amazing work, ${studentName}!</h2>
        <p style="color:#6b7280;margin:0">You've completed the entire course.</p>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center">
        <p style="margin:0;font-size:18px;font-weight:700;color:#92400e">${courseName}</p>
      </div>
      <div style="text-align:center">
        <a href="${appUrl}/courses/${courseId}" style="display:inline-block;background:#f59e0b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          View Course
        </a>
      </div>
    `,
  }),
});
