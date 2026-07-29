const PDFDocument = require('pdfkit');

function fmt(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Generate a PDF buffer for an invoice.
 * @param {object} invoice  - Populated invoice document
 * @returns {Promise<Buffer>}
 */
function generateInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const tenantName = invoice.tenantId?.name || 'Tenant';
    const planName   = invoice.planId?.name   || 'Plan';

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold').text('INVOICE', 50, 50);
    doc.fontSize(10).font('Helvetica').fillColor('#666666')
      .text(`Invoice #: ${invoice.invoiceNumber}`, 50, 80)
      .text(`Issued: ${fmtDate(invoice.createdAt)}`, 50, 94)
      .text(`Due: ${fmtDate(invoice.dueDate)}`, 50, 108);

    // Status badge (right side)
    const statusColor = invoice.status === 'paid' ? '#16a34a' : invoice.status === 'cancelled' ? '#dc2626' : '#d97706';
    doc.fontSize(12).font('Helvetica-Bold').fillColor(statusColor)
      .text(invoice.status.toUpperCase(), 400, 80, { align: 'right', width: 145 });

    doc.fillColor('#000000');

    // ── Bill To ───────────────────────────────────────────────────────────────
    doc.moveDown(2).fontSize(11).font('Helvetica-Bold').text('Bill To');
    doc.fontSize(10).font('Helvetica').text(tenantName);
    if (invoice.tenantId?.email) doc.text(invoice.tenantId.email);

    // ── Divider ───────────────────────────────────────────────────────────────
    doc.moveDown(1);
    const y = doc.y;
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.moveDown(1);

    // ── Line Items ────────────────────────────────────────────────────────────
    const colLeft  = 50;
    const colRight = 400;
    const colW     = 145;

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#6b7280')
      .text('DESCRIPTION', colLeft, doc.y)
      .text('AMOUNT', colRight, doc.y - doc.currentLineHeight(), { width: colW, align: 'right' });
    doc.moveDown(0.5);

    const divY2 = doc.y;
    doc.moveTo(50, divY2).lineTo(545, divY2).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.5);

    const lineTitle = `${planName} plan (${invoice.billingCycle})`;
    doc.fontSize(10).font('Helvetica').fillColor('#000000')
      .text(lineTitle, colLeft, doc.y);

    const descY = doc.y - doc.currentLineHeight();
    doc.text(fmt(invoice.subtotal), colRight, descY, { width: colW, align: 'right' });

    // upgradePlan()/reactivatePlan() set description to this exact same text,
    // so most invoices would otherwise show it twice in a row.
    if (invoice.description && invoice.description.trim().toLowerCase() !== lineTitle.toLowerCase()) {
      doc.fontSize(9).fillColor('#6b7280').text(invoice.description, colLeft);
    }
    doc.fillColor('#000000');

    // Billing period
    doc.fontSize(9).fillColor('#6b7280')
      .text(`Period: ${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}`, colLeft);
    doc.fillColor('#000000');
    doc.moveDown(1);

    // ── Totals block ──────────────────────────────────────────────────────────
    const totalsX = 350;
    const totalsW = 195;

    const row = (label, value, bold = false) => {
      const rowY = doc.y;
      doc.fontSize(10)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, totalsX, rowY, { width: totalsW / 2 })
        .text(value, totalsX + totalsW / 2, rowY, { width: totalsW / 2, align: 'right' });
      doc.moveDown(0.4);
    };

    row('Subtotal', fmt(invoice.subtotal));
    if (invoice.discountAmount > 0) {
      row(`Discount${invoice.couponCode ? ` (${invoice.couponCode})` : ''}`, `-${fmt(invoice.discountAmount)}`);
    }
    if (invoice.taxRate > 0) {
      row(`${invoice.taxLabel || 'Tax'} (${invoice.taxRate}%)`, fmt(invoice.taxAmount));
    }

    const lineY = doc.y;
    doc.moveTo(totalsX, lineY).lineTo(totalsX + totalsW, lineY).strokeColor('#d1d5db').stroke();
    doc.moveDown(0.4);
    row('Total', fmt(invoice.total), true);

    if (invoice.status === 'paid' && invoice.paidAt) {
      doc.moveDown(0.5).fontSize(9).fillColor('#16a34a')
        .text(`Paid on ${fmtDate(invoice.paidAt)}`, totalsX, doc.y, { width: totalsW, align: 'right' });
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.fillColor('#000000').moveDown(3);
    const footerY = doc.y;
    doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.5).fontSize(8).fillColor('#9ca3af')
      .text('This is a computer-generated invoice. No signature is required.', { align: 'center' });

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
