const { emailLayout } = require('./emailLayout');

module.exports = ({ recipientName, senderName, preview, conversationUrl, tenantName, branding = {} }) => ({
  subject: `New message from ${senderName} — ${tenantName}`,
  html: emailLayout({
    tenantName, branding,
    body: `
      <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Hi ${recipientName},</h2>
      <p style="color:#6b7280;margin:0 0 20px">
        <strong style="color:#111827">${senderName}</strong> sent you a message.
      </p>
      ${preview ? `
      <div style="background:#f9fafb;border-left:4px solid #3B82F6;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:24px">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;font-style:italic">"${preview}"</p>
      </div>` : ''}
      <a href="${conversationUrl}" style="display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
        View Message
      </a>
      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af">
        You received this because you have a new message on ${tenantName}.
      </p>
    `,
  }),
});
