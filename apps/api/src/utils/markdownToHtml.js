/**
 * Minimal markdown → email-safe HTML converter.
 * Supports exactly the subset the announcement editor produces:
 *   **bold**, *italic*, `code`, ## H2, ### H3, - bullet, * bullet
 * All other content is treated as plain paragraphs.
 * Input is HTML-escaped before inline substitutions to prevent XSS.
 */

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,
      '<code style="background:#f3f4f6;padding:1px 5px;border-radius:3px;font-size:0.85em;font-family:monospace">$1</code>');
}

function markdownToHtml(md) {
  if (!md) return '';

  const lines     = md.split('\n');
  const html      = [];
  const listItems = [];

  function flushList() {
    if (!listItems.length) return;
    html.push('<ul style="margin:0 0 12px;padding-left:20px">');
    listItems.splice(0).forEach(item => {
      html.push(`  <li style="margin-bottom:4px;color:#374151;line-height:1.65">${parseInline(item)}</li>`);
    });
    html.push('</ul>');
  }

  for (const raw of lines) {
    if (raw.startsWith('### ')) {
      flushList();
      html.push(`<h3 style="margin:12px 0 4px;font-size:15px;font-weight:600;color:#111827">${parseInline(raw.slice(4))}</h3>`);
    } else if (raw.startsWith('## ')) {
      flushList();
      html.push(`<h2 style="margin:16px 0 6px;font-size:17px;font-weight:700;color:#111827">${parseInline(raw.slice(3))}</h2>`);
    } else if (raw.startsWith('- ') || raw.startsWith('* ')) {
      listItems.push(raw.slice(2));
    } else if (raw.trim() === '') {
      flushList();
    } else {
      flushList();
      html.push(`<p style="margin:0 0 10px;color:#374151;line-height:1.65">${parseInline(raw)}</p>`);
    }
  }

  flushList();
  return html.join('\n');
}

module.exports = markdownToHtml;
