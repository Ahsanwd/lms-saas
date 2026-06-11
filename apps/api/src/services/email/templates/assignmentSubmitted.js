const { emailLayout } = require('./emailLayout');

module.exports = ({ instructorName, studentName, studentEmail, assignmentTitle, courseName, submittedAt, tenantName, appUrl, assignmentId, branding = {} }) => ({
  subject: `New submission: ${assignmentTitle}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Hi ${instructorName},</h2>
      <p style="color:#6b7280;margin:0 0 24px">A student has submitted an assignment.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:120px">Assignment</td><td style="padding:6px 0;font-weight:600">${assignmentTitle}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Course</td><td style="padding:6px 0">${courseName}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Student</td><td style="padding:6px 0">${studentName} <span style="color:#6b7280">(${studentEmail})</span></td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;font-size:13px">Submitted</td><td style="padding:6px 0">${submittedAt}</td></tr>
        </table>
      </div>
      <a href="${appUrl}/assignments/${assignmentId}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        View Submission
      </a>
    `,
  }),
});
