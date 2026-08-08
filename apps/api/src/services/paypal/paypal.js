const AppError = require('../../utils/AppError');

// Per-tenant BYO PayPal Business app (REST API v2) — no caching of the
// access token across tenants/requests since each tenant has its own
// clientId/secret, unlike the platform-level services in this folder.

function baseUrl(mode) {
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

// OAuth2 client-credentials grant — also doubles as the "are these
// credentials valid" check when saving gateway settings.
async function getAccessToken(clientId, clientSecret, mode) {
  const res = await fetch(`${baseUrl(mode)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const json = await res.json();
  if (!res.ok) throw new AppError(json.error_description || 'PayPal credentials rejected', 422, 'PAYPAL_AUTH_FAILED');
  return json.access_token;
}

// amount is in the smallest currency unit (cents) to match the rest of the
// payment module — PayPal's Orders API wants a decimal string instead.
function centsToDecimalString(cents) {
  return (cents / 100).toFixed(2);
}

async function createOrder(clientId, clientSecret, mode, amountCents, currency, metadata = {}) {
  const token = await getAccessToken(clientId, clientSecret, mode);
  const res = await fetch(`${baseUrl(mode)}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: { currency_code: currency.toUpperCase(), value: centsToDecimalString(amountCents) },
        custom_id: metadata.paymentId || undefined,
      }],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new AppError(json.message || 'Failed to create PayPal order', 502, 'PAYPAL_ORDER_FAILED');
  return json; // { id, status, links, ... }
}

async function captureOrder(clientId, clientSecret, mode, orderId) {
  const token = await getAccessToken(clientId, clientSecret, mode);
  const res = await fetch(`${baseUrl(mode)}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const json = await res.json();
  if (!res.ok) throw new AppError(json.message || 'Failed to capture PayPal order', 502, 'PAYPAL_CAPTURE_FAILED');
  return json; // { id, status, purchase_units: [{ payments: { captures: [{ id, status, ... }] } }] }
}

async function refundCapture(clientId, clientSecret, mode, captureId, amountCents = null, currency = 'usd') {
  const token = await getAccessToken(clientId, clientSecret, mode);
  const body = amountCents
    ? { amount: { currency_code: currency.toUpperCase(), value: centsToDecimalString(amountCents) } }
    : undefined;
  const res = await fetch(`${baseUrl(mode)}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new AppError(json.message || 'Failed to refund PayPal capture', 502, 'PAYPAL_REFUND_FAILED');
  return json;
}

module.exports = { getAccessToken, createOrder, captureOrder, refundCapture };
