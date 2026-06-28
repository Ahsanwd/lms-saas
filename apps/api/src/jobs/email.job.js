const logger = require('../utils/logger');

const skipEmail = process.env.SKIP_EMAIL === 'true';

if (!skipEmail) {
  const { emailQueue }  = require('./queue');
  const { sendMail }    = require('../services/email/email.service');
  const FailedEmailLog  = require('../database/models/FailedEmailLog.model');

  emailQueue().process(async (job) => {
    const { to, subject, html, tenantId } = job.data;

    let tenantEmailSettings;
    if (tenantId) {
      try {
        const Tenant = require('../database/models/Tenant.model');
        const tenant = await Tenant.findById(tenantId)
          .select('emailSettings')
          .lean();
        if (tenant?.emailSettings) tenantEmailSettings = tenant.emailSettings;
      } catch { /* non-critical — fall back to platform SMTP */ }
    }

    await sendMail({ to, subject, html, tenantEmailSettings });
    logger.info(`Email job ${job.id} processed for ${to}`);
  });

  // Dead-letter handler: fires after all retry attempts are exhausted
  emailQueue().on('failed', async (job, err) => {
    const maxAttempts = job.opts?.attempts || 3;
    if (job.attemptsMade < maxAttempts) return; // Will be retried — skip until final failure

    const tenantId = job.data.tenantId || null;

    try {
      await FailedEmailLog.create({
        tenantId,
        to:           job.data.to || '',
        subject:      job.data.subject || '',
        errorMessage: err?.message || 'Unknown error',
        attemptsMade: job.attemptsMade,
        jobId:        String(job.id),
        failedAt:     new Date(),
      });
      logger.warn(`Dead-letter: email to ${job.data.to} failed after ${job.attemptsMade} attempts — logged`);
    } catch (logErr) {
      logger.error('Failed to write FailedEmailLog', { error: logErr.message });
    }

    // In-app alert to tenant admin — direct DB insert, no email dispatch (avoids feedback loop)
    if (tenantId) {
      try {
        const Notification = require('../database/models/Notification.model');
        const User         = require('../database/models/User.model');
        const admin = await User.findOne({ tenantId, role: 'tenant_admin', deletedAt: null })
          .select('_id').lean();
        if (admin) {
          await Notification.create({
            tenantId,
            userId:  admin._id,
            type:    'email_delivery_failed',
            title:   'Email delivery failure',
            message: `Failed to deliver "${job.data.subject || '(no subject)'}" to ${job.data.to}`,
            link:    '/notifications?tab=failed',
          });
        }
      } catch (alertErr) {
        logger.error('Failed to create DLQ in-app alert', { error: alertErr.message });
      }
    }
  });
}

function queueEmail(data) {
  if (skipEmail) {
    logger.info(`[DEV] Email skipped — to: ${data.to} | subject: ${data.subject}`);
    return Promise.resolve();
  }

  // If Redis is not configured or skipped, send directly (no queue)
  const skipRedis = !process.env.REDIS_HOST ||
    process.env.REDIS_HOST === 'localhost' ||
    process.env.SKIP_REDIS === 'true';

  if (skipRedis) {
    const { sendMail } = require('../services/email/email.service');
    logger.info(`[DIRECT] Sending email to ${data.to} subject="${data.subject}"`);
    return sendMail({ to: data.to, subject: data.subject, html: data.html })
      .then(info => logger.info(`[DIRECT] Email sent OK to ${data.to} messageId=${info?.messageId}`))
      .catch(err => {
        logger.error(`[DIRECT] Email FAILED to ${data.to}: ${err.message}`);
        throw err;
      });
  }

  const { emailQueue } = require('./queue');
  return emailQueue().add(data);
}

module.exports = { queueEmail };
