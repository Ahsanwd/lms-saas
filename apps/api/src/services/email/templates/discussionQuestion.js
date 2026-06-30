const { emailLayout } = require('./emailLayout');

module.exports = ({ recipientName, studentName, lessonTitle, preview, threadUrl, tenantName, branding = {} }) => ({
  subject: `New question on "${lessonTitle}" — ${tenantName}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Hi ${recipientName},</h2>
      <p style="color:#6b7280;margin:0 0 24px">
        <strong style="color:#111827">${studentName}</strong> posted a new question in a lesson discussion.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Lesson</p>
        <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827">${lessonTitle}</p>
        ${preview ? `<p style="margin:0;font-size:13px;color:#374151;line-height:1.6;border-left:3px solid #3B82F6;padding-left:12px">${preview}</p>` : ''}
      </div>
      <a href="${threadUrl}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        View & Reply
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">
        You received this because you're an instructor or admin for this course.
      </p>
    `,
  }),
});
