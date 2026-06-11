const { emailLayout }  = require('./emailLayout');
const markdownToHtml   = require('../../../utils/markdownToHtml');

module.exports = ({ recipientName, announcementTitle, announcementBody, courseName, courseId, tenantName, appUrl, branding = {} }) => ({
  subject: `New announcement${courseName ? ` in "${courseName}"` : ''}: ${announcementTitle}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <p style="color:#6b7280;margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">📢 New Announcement${courseName ? ` · ${courseName}` : ''}</p>
      <h2 style="margin:0 0 16px;font-size:20px;color:#111827">${announcementTitle}</h2>
      ${announcementBody ? `
      <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px">
        ${markdownToHtml(announcementBody)}
      </div>` : ''}
      <a href="${appUrl}${courseId ? `/courses/${courseId}` : '/announcements'}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
        View Announcement
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">You received this because you are enrolled on ${tenantName}. <a href="${appUrl}/settings" style="color:#9ca3af">Manage notifications</a></p>
    `,
  }),
});
