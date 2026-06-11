const { emailLayout } = require('./emailLayout');

module.exports = ({ adminName, tenantName, reason, upgradeUrl, branding = {} }) => ({
  subject: `Your ${reason === 'trial' ? 'free trial' : 'subscription'} has expired — ${tenantName} is paused`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">
        ❌ Hi ${adminName}, your ${reason === 'trial' ? 'free trial' : 'subscription'} has ended
      </h2>
      <p style="color:#6b7280;margin:0 0 24px">
        Your ${reason === 'trial' ? '14-day free trial' : 'subscription'} for
        <strong>${tenantName}</strong> has expired. Your school is currently
        <strong style="color:#dc2626">paused</strong> — students and instructors
        cannot log in until you reactivate your account.
      </p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin-bottom:24px">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
          ✅ Your data is safe — all courses, students and progress are preserved.<br>
          ⚡ Reactivate in minutes by choosing a plan below.
        </p>
      </div>
      <a href="${upgradeUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
        Reactivate ${tenantName} →
      </a>
    `,
  }),
});
