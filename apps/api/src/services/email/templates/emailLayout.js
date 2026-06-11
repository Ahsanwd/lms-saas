/**
 * Shared branded email layout.
 * Pass branding.logoUrl + branding.primaryColor to apply tenant identity.
 * Both are optional — falls back to tenant name text + default blue.
 */
function emailLayout({ tenantName, body, branding = {} }) {
  const color  = branding.primaryColor || '#3B82F6';
  const logo   = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${tenantName}" style="max-height:48px;max-width:200px;object-fit:contain;display:block;margin:0 auto">`
    : `<span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px">${tenantName}</span>`;

  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
        <!-- Branded header -->
        <tr>
          <td style="background-color:${color};padding:24px 32px;border-radius:12px 12px 0 0;text-align:center">
            ${logo}
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background-color:#ffffff;padding:32px 32px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;color:#111827;font-size:15px;line-height:1.6">
            ${body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background-color:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center">
            <p style="margin:0;font-size:12px;color:#9ca3af">&copy; ${year} ${tenantName}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { emailLayout };
