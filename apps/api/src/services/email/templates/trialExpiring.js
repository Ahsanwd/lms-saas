const { emailLayout } = require('./emailLayout');

module.exports = ({ studentName, courseName, courseId, daysLeft, tenantName, appUrl, branding = {} }) => ({
  subject: `Your free trial for "${courseName}" expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">⚠️ Hi ${studentName}, your trial is ending soon</h2>
      <p style="color:#6b7280;margin:0 0 24px">Your free trial access to <strong>${courseName}</strong> expires in <strong>${daysLeft} day${daysLeft === 1 ? '' : 's'}</strong>.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#dc2626">Upgrade to keep access to:</p>
        <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.8">
          <li>All course content and lessons</li>
          <li>Quizzes and assignments</li>
          <li>Certificate of completion</li>
        </ul>
      </div>
      <a href="${appUrl}/billing" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        Upgrade Now
      </a>
    `,
  }),
});
