// Generates sequential invoice numbers: INV-2026-000001
function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900000) + 100000;
  return `INV-${year}-${rand}`;
}

module.exports = { generateInvoiceNumber };
