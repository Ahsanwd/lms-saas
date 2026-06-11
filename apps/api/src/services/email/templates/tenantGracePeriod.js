const { emailLayout } = require('./emailLayout');

module.exports = ({ adminName, tenantName, reason, upgradeUrl, gracePeriodEndsAt, branding = {} }) => {
  const endDate = gracePeriodEndsAt instanceof Date
    ? gracePeriodEndsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : gracePeriodEndsAt;

  const reasonText = reason === 'trial' ? 'free trial' : 'subscription';

  return {
    subject: `Action required — ${tenantName} enters grace period (expires ${endDate})`,
    html: emailLayout({
      tenantName, branding,
      body: `
        <h2 style="margin:0 0 8px;font-size:18px;color:#111827">
          ⚠️ Hi ${adminName}, your ${reasonText} has ended
        </h2>
        <p style="color:#6b7280;margin:0 0 24px">
          Your ${reasonText} for <strong>${tenantName}</strong> has ended.
          You are currently in a <strong style="color:#d97706">3-day grace period</strong> —
          your school is still fully accessible, but you must renew before the deadline below.
        </p>
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:20px;margin-bottom:24px">
          <p style="margin:0;font-size:15px;color:#92400e;font-weight:600">
            ⏰ Grace period ends: ${endDate}
          </p>
          <p style="margin:8px 0 0;font-size:14px;color:#374151;line-height:1.7">
            After this date all users will lose access until the plan is renewed.<br>
            ✅ Your data is safe — all courses, students and progress are preserved.
          </p>
        </div>
        <a href="${upgradeUrl}" style="display:inline-block;background:#d97706;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
          Renew Now — Keep Access →
        </a>
      `,
    }),
  };
};
