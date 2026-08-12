function liveSessionScheduled({ recipientName, lessonTitle, courseName, scheduledAt, durationMinutes, platform, courseId, tenantName, branding, appUrl }) {
  const platformLabel = { livekit: 'Live Class', zoom: 'Zoom', meet: 'Google Meet', teams: 'Microsoft Teams', youtube_live: 'YouTube Live', custom: 'Online Meeting' }[platform] || 'Online Meeting';
  // Explicit timeZone: 'UTC' — the one reference point every recipient,
  // regardless of their own timezone, can convert from unambiguously.
  const dateStr = scheduledAt ? new Date(scheduledAt).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }) : '';
  const accent = branding?.primaryColor || '#4f46e5';
  const logo = branding?.logoUrl || null;
  const courseLink = `${appUrl}/courses/${courseId}/learn`;

  const subject = `Live class scheduled: "${lessonTitle}"`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <!-- Header -->
      <tr><td style="background:${accent};padding:32px 40px;text-align:center;">
        ${logo ? `<img src="${logo}" alt="${tenantName}" style="height:36px;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;">` : ''}
        <div style="font-size:36px;margin-bottom:8px;">🗓️</div>
        <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">New Live Class Scheduled</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:40px;">
        <p style="color:#1e293b;font-size:16px;margin:0 0 8px;">Hi ${recipientName},</p>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 28px;">
          A new live class has been scheduled${courseName ? ` for <strong>${courseName}</strong>` : ''}. Save the date!
        </p>
        <!-- Session card -->
        <div style="background:#f1f5f9;border-radius:12px;padding:24px;margin-bottom:28px;border-left:4px solid ${accent};">
          <p style="color:#0f172a;font-size:17px;font-weight:700;margin:0 0 6px;">${lessonTitle}</p>
          ${courseName ? `<p style="color:#64748b;font-size:13px;margin:0 0 16px;">${courseName}</p>` : ''}
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="vertical-align:top;width:50%;padding-right:12px;">
                <p style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;">Scheduled (UTC)</p>
                <p style="color:#1e293b;font-size:14px;font-weight:600;margin:0;">${dateStr}</p>
              </td>
              <td style="vertical-align:top;width:50%;padding-left:12px;">
                <p style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px;">Platform</p>
                <p style="color:#1e293b;font-size:14px;font-weight:600;margin:0;">${platformLabel}${durationMinutes ? ` · ${durationMinutes} min` : ''}</p>
              </td>
            </tr>
          </table>
          <p style="color:#94a3b8;font-size:11px;margin:16px 0 0;">Time shown in UTC — convert to your local timezone. A reminder email will also be sent 1 hour before the class starts.</p>
        </div>
        <!-- CTA -->
        <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding-bottom:28px;">
          <a href="${courseLink}" style="display:inline-block;background:${accent};color:#fff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;">
            Go to Course →
          </a>
        </td></tr></table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;">
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">${tenantName}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}

module.exports = liveSessionScheduled;
