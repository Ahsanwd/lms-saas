const { emailLayout } = require('./emailLayout');
const config = require('../../../config');

module.exports = () => ({
  subject: 'Ready when you are',
  html: emailLayout({
    tenantName: 'Coursel',
    body: `
      <h2 style="margin:0 0 8px;font-size:19px;color:#111827">Ready when you are</h2>
      <p style="color:#111827;margin:0 0 16px;line-height:1.7">
        Quick recap: Coursel connects to Safepay and Stripe out of the box, prices in PKR or USD, and
        includes courses, quizzes, certificates, and your own branded launch page — everything in the
        checklist you got on day one.
      </p>
      <p style="color:#111827;margin:0 0 24px;line-height:1.7">
        No card required to start. If it's not a fit, you've lost ten minutes, not a subscription.
      </p>
      <div style="text-align:center;margin:24px 0">
        <a href="${config.app.url}/register-tenant" style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px">Start free at coursel.space</a>
      </div>
      <p style="color:#6b7280;font-size:13px;margin:20px 0 0">Questions before you start? Just reply to this email — a real person reads these.</p>
    `,
  }),
});
