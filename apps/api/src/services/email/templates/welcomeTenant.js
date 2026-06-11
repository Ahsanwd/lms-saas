const { emailLayout } = require('./emailLayout');

module.exports = ({ adminName, tenantName, subdomain, trialEndsAt, appUrl, branding = {} }) => {
  const trialDate = trialEndsAt instanceof Date
    ? trialEndsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : trialEndsAt;

  const schoolUrl = `https://${subdomain}.lmsplatform.com`;

  return {
    subject: `Welcome to ${tenantName} — your 14-day trial is live`,
    html: emailLayout({
      tenantName, branding,
      body: `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827">🎉 Welcome, ${adminName}!</h2>
        <p style="color:#374151;margin:0 0 20px;line-height:1.7">
          Your school <strong>${tenantName}</strong> is up and running on LMS Platform.
          Your 14-day free trial is active — no credit card needed, cancel anytime.
        </p>

        <!-- Trial info box -->
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:24px">
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.05em">
            Free trial active
          </p>
          <p style="margin:0;font-size:14px;color:#374151">
            Trial expires on <strong>${trialDate}</strong>. Upgrade before then to keep full access.
          </p>
        </div>

        <!-- School URL -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 20px;margin-bottom:24px">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">
            Your school URL
          </p>
          <p style="margin:0;font-size:15px;font-family:monospace;color:#1e40af">${schoolUrl}</p>
        </div>

        <!-- Next steps -->
        <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#111827">Get started in 3 steps:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
          ${[
            ['🎨', 'Customize your branding', 'Upload your logo and set your brand color in Settings.'],
            ['📚', 'Create your first course',  'Add lessons, quizzes and assignments for your students.'],
            ['👥', 'Invite your team',           'Add instructors and enroll your first students.'],
          ].map(([icon, title, desc]) => `
          <tr>
            <td style="padding:8px 0;vertical-align:top;width:32px;font-size:18px">${icon}</td>
            <td style="padding:8px 0 8px 10px;vertical-align:top">
              <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#111827">${title}</p>
              <p style="margin:0;font-size:13px;color:#6b7280">${desc}</p>
            </td>
          </tr>`).join('')}
        </table>

        <a href="${appUrl}/dashboard" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
          Open Your Dashboard →
        </a>

        <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6">
          Need help? Reply to this email or visit our help center.<br>
          To manage your plan, visit <a href="${appUrl}/billing" style="color:#9ca3af">${appUrl}/billing</a>
        </p>
      `,
    }),
  };
};
