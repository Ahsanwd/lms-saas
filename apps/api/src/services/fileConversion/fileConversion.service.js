const logger = require('../../utils/logger');

const WORD_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const EXCEL_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function isConvertible(mimetype) {
  return WORD_TYPES.includes(mimetype) || EXCEL_TYPES.includes(mimetype);
}

async function convertWordToHtml(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.convertToHtml({ buffer });
  if (result.messages?.length) {
    result.messages.forEach(m => logger.warn(`mammoth: ${m.message}`));
  }
  return result.value;
}

function convertExcelToHtml(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  let html = '<div class="lms-excel-workbook">';
  wb.SheetNames.forEach((name, i) => {
    const ws = wb.Sheets[name];
    const sheetHtml = XLSX.utils.sheet_to_html(ws, { id: `sheet-${i}`, editable: false });
    html += `<div class="lms-sheet" data-index="${i}">
  <div class="lms-sheet-name">${escapeHtml(name)}</div>
  ${sheetHtml}
</div>`;
  });
  html += '</div>';
  return html;
}

async function convertToHtml(buffer, mimetype) {
  if (WORD_TYPES.includes(mimetype)) return await convertWordToHtml(buffer);
  if (EXCEL_TYPES.includes(mimetype)) return convertExcelToHtml(buffer);
  return null;
}

// Read buffer from local disk or R2/CDN URL
async function readFileBuffer(fileUrl, localPath) {
  if (localPath) {
    const fs = require('fs');
    return fs.readFileSync(localPath);
  }
  // R2 or external URL — fetch via HTTP
  const https = require('https');
  const http  = require('http');
  return new Promise((resolve, reject) => {
    const mod = fileUrl.startsWith('https') ? https : http;
    mod.get(fileUrl, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { isConvertible, convertToHtml, readFileBuffer };
