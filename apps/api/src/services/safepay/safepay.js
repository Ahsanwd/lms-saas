const AppError = require('../../utils/AppError');

function baseUrl(environment) {
  return environment === 'production' ? 'https://api.getsafepay.com' : 'https://sandbox.api.getsafepay.com';
}

// The hosted-checkout page is served at `/checkout/pay/` on the SAME host as
// the API (confirmed live: `sandbox.getsafepay.com`, as literally written in
// Safepay support's example URL, doesn't resolve in DNS at all — it's a typo
// for `sandbox.api.getsafepay.com`, which serves the real Safepay Checkout
// React app at that path). Reuses baseUrl() rather than a separate host.

// Creates a payment session ("tracker") for a hosted checkout redirect.
// `orderId` is OUR OWN payment record's id — Safepay's `metadata` field only
// accepts a fixed allowlist of keys (confirmed live: an arbitrary key like
// `tenantId` gets rejected with "unsupported meta key tenantId"), and
// `order_id` is the one documented/accepted key. We never need Safepay to
// hand this back to us anyway — the tracker id we store locally is the
// source of truth for confirming payment status.
async function createSession({ apiKey, environment, amount, currency, orderId }) {
  const res = await fetch(`${baseUrl(environment)}/order/payments/v3/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant_api_key: apiKey,
      // Clicking "Credit/Debit Card" on the hosted checkout page redirects
      // to getsafepay.pk instead of showing a card form — confirmed live
      // with BOTH CYBERSOURCE and MPGS intents, so it's an account-wide
      // activation issue on Safepay's side, not specific to one processor.
      // Reported to Safepay support; reverted to CYBERSOURCE (the default)
      // while waiting on their reply.
      intent:      'CYBERSOURCE',
      mode:        'payment',
      entry_mode:  'raw',
      currency,
      amount,
      metadata: { order_id: orderId },
    }),
  });
  const json = await res.json().catch(() => null);
  // Confirmed live against a real sandbox response: the tracker token sits
  // at data.tracker.token, not data.token as originally assumed.
  const token = json?.data?.tracker?.token;
  if (!res.ok || !token) {
    throw new AppError(json?.status?.message || 'Safepay session creation failed', 502, 'SAFEPAY_SESSION_FAILED');
  }
  return { tracker: token };
}

// Fetches the short-lived "tbt" (authentication) token the checkout URL needs
// alongside the tracker. Per Safepay's Express Checkout docs, this is a SEPARATE
// call from session creation — POST /client/passport/v1/token, authenticated with
// the SECRET key (not the public merchant_api_key used for createSession above).
// Their docs only show this via the @sfpy/node-core SDK (`authType: 'secret'`), no
// raw HTTP example published. Confirmed live against a real sandbox account: a
// `Bearer <secretKey>` Authorization header 401s with "merchant webhook secret not
// found in the request header" — the secret key must go in a plain
// `x-sfpy-merchant-secret` header instead. Token lasts 1 hour per the docs, fetched
// fresh per checkout here rather than cached.
async function getPassportToken({ secretKey, environment }) {
  const res = await fetch(`${baseUrl(environment)}/client/passport/v1/token`, {
    method:  'POST',
    headers: { 'x-sfpy-merchant-secret': secretKey },
  });
  const json = await res.json().catch(() => null);
  const tbt = json?.data;
  if (!res.ok || !tbt) {
    throw new AppError(json?.status?.message || 'Safepay authentication failed', 502, 'SAFEPAY_AUTH_FAILED');
  }
  return tbt;
}

// Builds the hosted-checkout redirect URL the browser is sent to.
// Param names here are NOT what Safepay's docs show (those describe their SDK's
// JS function signature — tracker/tbt/environment — which the SDK itself
// translates before building the real URL; the docs never publish that mapping).
// Confirmed by pulling and reading the actual deployed checkout app's JS bundle
// (main.*.chunk.js from this exact /checkout/pay/ path): its own query-param
// parser reads `env` (not `environment`), `beacon` (not `tracker` — must contain
// "track_"), and `auth_token` (not `tbt`) into React state. `env` and `beacon`
// must be present or the app immediately shows a "missing" error screen before
// ever reaching a payment form; `auth_token` isn't in that same initial gate for
// the /pay/ path but is parsed for later use, so it's included regardless.
function buildCheckoutUrl({ environment, tracker, tbt, redirectUrl, cancelUrl }) {
  const params = new URLSearchParams({
    env:          environment,
    beacon:       tracker,
    auth_token:   tbt,
    source:       'hosted',
    redirect_url: redirectUrl,
    cancel_url:   cancelUrl,
  });
  return `${baseUrl(environment)}/checkout/pay/?${params.toString()}`;
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

module.exports = { createSession, getPassportToken, buildCheckoutUrl, getPaymentStatus };
