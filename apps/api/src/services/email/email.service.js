const nodemailer = require('nodemailer');
const config     = require('../../config');
const logger     = require('../../utils/logger');
const { decrypt } = require('../../utils/crypto');

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

// ── One-off transporter from raw config (tenant SMTP or test) ─────────────────
function buildTransporter({ host, port, secure, user, pass }) {
  return nodemailer.createTransport({
    host,
    port:   port   || 587,
    secure: secure || false,
    auth: { user, pass },
  });
}

// ── Resolve From address ──────────────────────────────────────────────────────
function resolveFrom(es) {
  if (es?.fromName && es?.fromEmail) return `"${es.fromName}" <${es.fromEmail}>`;
  if (es?.fromEmail)                 return es.fromEmail;
  return config.email.from;
}

/**
 * Send an email.
 * Pass `tenantEmailSettings` (tenant.emailSettings with smtp.passEncrypted selected)
 * to use the tenant's custom SMTP; falls back to platform SMTP automatically.
 */
async function sendMail({ to, subject, html, tenantEmailSettings }) {
  const from    = resolveFrom(tenantEmailSettings);
  const replyTo = tenantEmailSettings?.replyTo || undefined;
  const smtp    = tenantEmailSettings?.smtp;

  let transporter;
  let source = 'platform';

  if (smtp?.host && smtp?.user && smtp?.passEncrypted && smtp?.verified) {
    try {
      const pass = decrypt(smtp.passEncrypted);
      transporter = buildTransporter({ ...smtp, pass });
      source = 'tenant';
    } catch {
      transporter = getPlatformTransporter();
    }
  } else {
    transporter = getPlatformTransporter();
  }

  try {
    const info = await transporter.sendMail({ from, to, subject, html, replyTo });
    logger.info(`Email [${source}] sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    logger.error(`Email [${source}] failed to ${to}: ${err.message}`);
    throw err;
  }
}

/**
 * Test a raw SMTP config — verifies connection then sends a test email.
 * Throws on failure so the caller can return the error to the UI.
 */
async function testSmtpConnection({ host, port, secure, user, pass, fromEmail, toEmail }) {
  const transporter = buildTransporter({ host, port: port || 587, secure: secure || false, user, pass });
  await transporter.verify();
  await transporter.sendMail({
    from:    fromEmail || user,
    to:      toEmail,
    subject: 'SMTP connection test ✅',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:12px;color:#1f2937">
        <div style="font-size:40px;text-align:center;margin-bottom:16px">✅</div>
        <h2 style="text-align:center;margin:0 0 8px">SMTP connection successful!</h2>
        <p style="text-align:center;color:#6b7280;margin:0">Your email settings are configured correctly.</p>
        <hr style="margin:24px 0;border-color:#e5e7eb"/>
        <p style="font-size:12px;color:#9ca3af;text-align:center">
          ${host}:${port || 587} · ${user}
        </p>
      </div>
    `,
  });
}

module.exports = { sendMail, testSmtpConnection };
