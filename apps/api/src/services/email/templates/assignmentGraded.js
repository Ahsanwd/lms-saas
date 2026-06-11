const { emailLayout } = require('./emailLayout');

module.exports = ({ studentName, assignmentTitle, courseName, marks, totalMarks, feedback, tenantName, appUrl, branding = {} }) => ({
  subject: `Your assignment has been graded — ${assignmentTitle}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Hi ${studentName},</h2>
      <p style="color:#6b7280;margin:0 0 24px">Your assignment has been graded.</p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 6px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Assignment</p>
        <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#111827">${assignmentTitle}</p>
        <p style="margin:0 0 16px;font-size:13px;color:#6b7280">Course: ${courseName}</p>
        <div style="padding-top:16px;border-top:1px solid #e5e7eb">
          <span style="font-size:32px;font-weight:700;color:#3B82F6">${marks}</span>
          <span style="font-size:16px;color:#6b7280"> / ${totalMarks}</span>
          <span style="margin-left:12px;font-size:14px;font-weight:600;color:#111827">(${Math.round((marks / totalMarks) * 100)}%)</span>
        </div>
      </div>
      ${feedback ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.05em">Instructor Feedback</p>
        <p style="margin:0;color:#1f2937;white-space:pre-wrap">${feedback}</p>
      </div>` : ''}
      <a href="${appUrl}/assignments" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        View Assignment
      </a>
    `,
  }),
});
