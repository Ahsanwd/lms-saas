const emailLayout = require('./emailLayout');

/**
 * Weekly analytics summary email for tenant admins.
 * stats: { newStudents, newEnrollments, completions, revenue, topCourses: [{ title, count }] }
 */
function analyticsWeeklySummary({ adminName, tenantName, stats, analyticsUrl, branding = {} }) {
  const fmt$ = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100);

  const topCoursesRows = (stats.topCourses || []).slice(0, 3).map((c, i) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#111827;font-weight:500">${c.title}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:right">${c.count} new</td>
    </tr>`).join('');

  const body = `
    <p style="margin:0 0 6px">Hi ${adminName},</p>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Here's your weekly platform summary for <strong>${tenantName}</strong>.</p>

    <!-- KPI grid -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="8" style="margin-bottom:24px">
      <tr>
        <td width="50%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;font-weight:600">New Students</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#111827">${stats.newStudents ?? 0}</p>
        </td>
        <td width="50%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;font-weight:600">New Enrollments</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#111827">${stats.newEnrollments ?? 0}</p>
        </td>
      </tr>
      <tr style="height:8px"><td colspan="2"></td></tr>
      <tr>
        <td width="50%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;font-weight:600">Completions</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#111827">${stats.completions ?? 0}</p>
        </td>
        <td width="50%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
          <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;font-weight:600">Revenue (7 days)</p>
          <p style="margin:0;font-size:28px;font-weight:700;color:#111827">${fmt$(stats.revenue)}</p>
        </td>
      </tr>
    </table>

    ${topCoursesRows ? `
    <!-- Top courses -->
    <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151">Top Courses This Week</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px">
      <thead>
        <tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">#</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">Course</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase">Enrollments</th>
        </tr>
      </thead>
      <tbody>
        ${topCoursesRows}
      </tbody>
    </table>` : ''}

    <div style="text-align:center;margin-top:8px">
      <a href="${analyticsUrl}" style="display:inline-block;background:${branding.primaryColor||'#3B82F6'};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px">
        View Full Analytics →
      </a>
    </div>

    <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center">
      This is an automated weekly summary. To unsubscribe, adjust your notification settings.
    </p>
  `;

  return {
    subject: `Weekly Platform Summary — ${tenantName}`,
    html: emailLayout({ tenantName, body, branding }),
  };
}

module.exports = analyticsWeeklySummary;
