const { emailLayout } = require('./emailLayout');

module.exports = ({ adminName, tenantName, daysLeft, upgradeUrl, branding = {} }) => ({
  subject: `Your free trial expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — action required`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">⏰ Hi ${adminName}, your trial ends ${daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}</h2>
      <p style="color:#6b7280;margin:0 0 24px">
        Your 14-day free trial for <strong>${tenantName}</strong> will expire
        ${daysLeft === 1 ? '<strong>tomorrow</strong>' : `in <strong>${daysLeft} days</strong>`}.
        After that, your school will be paused until you upgrade.
      </p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#92400e">Upgrade now to keep access to:</p>
        <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.9">
          <li>All courses, lessons and student data</li>
          <li>Quizzes, assignments and certificates</li>
          <li>Live classes, chat and notifications</li>
          <li>Payments and billing features</li>
        </ul>
      </div>
      <a href="${upgradeUrl}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
        Upgrade Your Plan →
      </a>
    `,
  }),
});
