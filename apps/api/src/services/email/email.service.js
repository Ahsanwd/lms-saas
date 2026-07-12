const nodemailer = require('nodemailer');
const axios      = require('axios');
const config     = require('../../config');
const logger     = require('../../utils/logger');

// ── Brevo HTTP API (used when SMTP is blocked by hosting provider) ────────────
async function sendViaBrevoApi({ to, subject, html, from }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY not set');

  const fromEmail = from?.match(/<(.+)>/)?.[1] || from || config.email.from;
  const fromName  = from?.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() || 'Coursel';

  const response = await axios.post(
    'https://api.brevo.com/v3/smtp/email',
    {
      sender:      { name: fromName, email: fromEmail },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
    },
    {
      headers: {
        'api-key':     apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  return { messageId: response.data.messageId };
}

// ── Platform-level transporter (singleton, reused across requests) ────────────
let platformTransporter;

function getPlatformTransporter() {
  if (!platformTransporter) {
    platformTransporter = nodemailer.createTransport({
      host:   config.email.host,
      port:   config.email.port,
      secure: config.email.port === 465,
      auth: { user: config.email.user, pass: config.email.pass },
    });
  }
  return platformTransporter;
}

// ── Resolve From address ──────────────────────────────────────────────────────
function resolveFrom(es) {
  if (es?.fromName && es?.fromEmail) return `"${es.fromName}" <${es.fromEmail}>`;
  if (es?.fromEmail)                 return es.fromEmail;
  return config.email.from;
}

/**
 * Send an email. Pass `tenantEmailSettings` (tenant.emailSettings) to brand
 * the From name/address/reply-to; delivery always goes through the platform
 * (Brevo HTTP API when BREVO_API_KEY is set, otherwise platform SMTP).
 */
async function sendMail({ to, subject, html, tenantEmailSettings }) {
  const from    = resolveFrom(tenantEmailSettings);
  const replyTo = tenantEmailSettings?.replyTo || undefined;

  // Use Brevo HTTP API when set (avoids SMTP port blocking on cloud hosting like Render)
  if (process.env.BREVO_API_KEY) {
    try {
      const info = await sendViaBrevoApi({ to, subject, html, from });
      logger.info(`Email [brevo-api] sent to ${to}: ${info.messageId}`);
      return info;
    } catch (err) {
      logger.error(`Email [brevo-api] failed to ${to}: ${err.message}`);
      throw err;
    }
  }

  try {
    const info = await getPlatformTransporter().sendMail({ from, to, subject, html, replyTo });
    logger.info(`Email [platform] sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    logger.error(`Email [platform] failed to ${to}: ${err.message}`);
    throw err;
  }
}

module.exports = { sendMail };
