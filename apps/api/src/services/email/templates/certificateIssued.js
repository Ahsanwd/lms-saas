const { emailLayout } = require('./emailLayout');

module.exports = ({ studentName, courseName, courseId, tenantName, appUrl, branding = {} }) => ({
  subject: `Your certificate for "${courseName}" is ready 🏅`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <div style="text-align:center;padding:8px 0 24px">
        <div style="font-size:48px;margin-bottom:8px">🏅</div>
        <h2 style="margin:0 0 8px;font-size:22px;color:#111827">Congratulations, ${studentName}!</h2>
        <p style="color:#6b7280;margin:0">You've earned a certificate of completion.</p>
      </div>
      <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center">
        <p style="margin:0 0 4px;font-size:12px;color:#7c3aed;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Course Completed</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#1f2937">${courseName}</p>
      </div>
      <div style="text-align:center">
        <a href="${appUrl}/certificates/${courseId}" style="display:inline-block;background:#7c3aed;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">
          View &amp; Download Certificate
        </a>
      </div>
    `,
  }),
});
