const AppError = require('../../utils/AppError');

function baseUrl(environment) {
  return environment === 'production' ? 'https://api.getsafepay.com' : 'https://sandbox.api.getsafepay.com';
}

// Creates a payment session ("tracker") for a hosted checkout redirect.
async function createSession({ apiKey, environment, amount, currency, metadata }) {
  const res = await fetch(`${baseUrl(environment)}/order/payments/v3/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_api_key: apiKey,
      intent:      'CYBERSOURCE',
      mode:        'payment',
      entry_mode:  'raw',
      currency,
      amount,
      metadata,
    }),
  });
  const json = await res.json().catch(() => null);
  const token = json?.data?.token;
  if (!res.ok || !token) {
    throw new AppError(json?.status?.message || 'Safepay session creation failed', 502, 'SAFEPAY_SESSION_FAILED');
  }
  return { tracker: token };
}

// Builds the hosted-checkout redirect URL the browser is sent to.
function buildCheckoutUrl({ environment, tracker, redirectUrl, cancelUrl }) {
  const params = new URLSearchParams({
    env:          environment,
    beacon:       tracker,
    source:       'hosted',
    redirect_url: redirectUrl,
    cancel_url:   cancelUrl,
  });
  return `${baseUrl(environment)}/components?${params.toString()}`;
}

// Fetches the current status of a tracker. Always called with the tracker WE stored at
// session-creation time — never a client-supplied value — so this is the source of truth
// for confirming a payment server-side.
async function getPaymentStatus({ secretKey, environment, tracker }) {
  const res = await fetch(`${baseUrl(environment)}/reporter/api/v1/payments/${tracker}`, {
    method:  'GET',
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) {
    throw new AppError(json?.status?.message || 'Failed to fetch Safepay payment status', 502, 'SAFEPAY_STATUS_FAILED');
  }
  return json.data; // { state: 'TRACKER_ENDED' | ..., ... }
}

module.exports = { createSession, buildCheckoutUrl, getPaymentStatus };
