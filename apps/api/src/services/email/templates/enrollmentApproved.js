const { emailLayout } = require('./emailLayout');

module.exports = ({ studentName, courseName, courseId, note, tenantName, appUrl, branding = {} }) => ({
  subject: `Your enrollment request for "${courseName}" was approved`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Great news, ${studentName}! ✅</h2>
      <p style="color:#6b7280;margin:0 0 24px">Your enrollment request has been approved.</p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-size:12px;color:#059669;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Course</p>
        <p style="margin:0;font-size:18px;font-weight:700;color:#1f2937">${courseName}</p>
        ${note ? `<p style="margin:12px 0 0;font-size:13px;color:#374151;border-top:1px solid #bbf7d0;padding-top:12px"><strong>Note from instructor:</strong> ${note}</p>` : ''}
      </div>
      <a href="${appUrl}/courses/${courseId}/learn" style="display:inline-block;background:#059669;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Start Learning →
      </a>
    `,
  }),
});
