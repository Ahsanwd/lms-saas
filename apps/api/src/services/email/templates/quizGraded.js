const { emailLayout } = require('./emailLayout');

module.exports = ({ recipientName, quizTitle, score, maxScore, percentage, passed, quizUrl, tenantName, branding = {} }) => ({
  subject: `Your quiz "${quizTitle}" has been graded — ${tenantName}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Quiz results are in!</h2>
      <p style="color:#6b7280;margin:0 0 24px">Hi ${recipientName}, your quiz has been manually graded by an instructor.</p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:24px;text-align:center">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">${quizTitle}</p>
        <p style="margin:0 0 4px;font-size:48px;font-weight:700;color:${passed ? '#16a34a' : '#dc2626'}">${percentage}%</p>
        <p style="margin:0 0 16px;font-size:14px;color:#6b7280">${score} / ${maxScore} points</p>
        <span style="display:inline-block;padding:6px 16px;border-radius:999px;font-size:13px;font-weight:600;background:${passed ? '#dcfce7' : '#fee2e2'};color:${passed ? '#15803d' : '#b91c1c'}">
          ${passed ? '✓ Passed' : '✗ Did not pass'}
        </span>
      </div>

      <a href="${quizUrl}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        View Full Results
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">
        You received this because your quiz submission was graded on ${tenantName}.
      </p>
    `,
  }),
});
