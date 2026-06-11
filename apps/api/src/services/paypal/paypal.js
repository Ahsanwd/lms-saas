// PayPal REST API v2 client — uses Node 18+ native fetch, no extra dependency needed.
// Set PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET to enable real mode.
// When either var is missing the service runs in mock mode (all calls succeed instantly).

let _token      = null;
let _tokenExpiry = 0;

function getBase() {
  return process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

function isConfigured() {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function getAccessToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res  = await fetch(`${getBase()}/v1/oauth2/token`, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth: ${data.error_description || data.error}`);
  _token       = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

// amountCents — integer cents (same unit used by Stripe)
async function createOrder(amountCents, currency = 'USD', referenceId = '') {
  if (!isConfigured()) {
    return { id: `MOCK_PP_${Date.now()}`, status: 'CREATED' };
  }
  const token = await getAccessToken();
  const res   = await fetch(`${getBase()}/v2/checkout/orders`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: referenceId || undefined,
        amount: { currency_code: currency.toUpperCase(), value: (amountCents / 100).toFixed(2) },
      }],
      application_context: {
        brand_name:  process.env.APP_NAME || 'LMS Platform',
        landing_page: 'NO_PREFERENCE',
        user_action:  'PAY_NOW',
        return_url:   `${process.env.APP_URL}/paypal/return`,
        cancel_url:   `${process.env.APP_URL}/paypal/cancel`,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal createOrder: ${JSON.stringify(data)}`);
  return data; // { id, status: 'CREATED', links: [...] }
}

async function captureOrder(orderId) {
  if (!isConfigured()) {
    return {
      id: orderId, status: 'COMPLETED',
      purchase_units: [{ payments: { captures: [{ id: `MOCK_CAP_${Date.now()}`, status: 'COMPLETED' }] } }],
    };
  }
  const token = await getAccessToken();
  const res   = await fetch(`${getBase()}/v2/checkout/orders/${orderId}/capture`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `cap_${orderId}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal captureOrder: ${JSON.stringify(data)}`);
  return data; // { id, status: 'COMPLETED', purchase_units: [...] }
}

// ── Refund a captured payment ─────────────────────────────────────────────────
// amountCents: pass 0 or null for a full refund; partial refund otherwise.
async function refundCapture(captureId, amountCents = 0, currency = 'USD') {
  if (!isConfigured()) {
    return { id: `MOCK_REF_${Date.now()}`, status: 'COMPLETED' };
  }
  const token = await getAccessToken();
  const body  = amountCents > 0
    ? { amount: { value: (amountCents / 100).toFixed(2), currency_code: currency.toUpperCase() } }
    : {};
  const res = await fetch(`${getBase()}/v2/payments/captures/${captureId}/refund`, {
    method:  'POST',
    headers: {
      Authorization:     `Bearer ${token}`,
      'Content-Type':    'application/json',
      'PayPal-Request-Id': `ref_${captureId}_${Date.now()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal refund: ${JSON.stringify(data)}`);
  return data; // { id, status: 'COMPLETED' }
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

// Ensure a PayPal product exists (idempotent — keyed by a stable ID derived from name).
async function _ensureProduct(name) {
  const token     = await getAccessToken();
  const productId = `LMS_${name.replace(/[^A-Z0-9]/gi, '_').toUpperCase().slice(0, 40)}`;
  const getRes    = await fetch(`${getBase()}/v1/catalogs/products/${productId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (getRes.ok) return productId;
  const res  = await fetch(`${getBase()}/v1/catalogs/products`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': productId },
    body:    JSON.stringify({ id: productId, name, type: 'SERVICE', category: 'SOFTWARE' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal createProduct: ${JSON.stringify(data)}`);
  return data.id;
}

// Create a billing plan for a given price + interval.
// intervalUnit: 'MONTH' | 'YEAR'
async function createBillingPlan(name, amountCents, currency = 'USD', intervalUnit = 'MONTH') {
  if (!isConfigured()) {
    return { id: `MOCK_PLAN_${Date.now()}`, status: 'ACTIVE' };
  }
  const token     = await getAccessToken();
  const productId = await _ensureProduct(name);
  const res = await fetch(`${getBase()}/v1/billing/plans`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      product_id: productId,
      name,
      status: 'ACTIVE',
      billing_cycles: [{
        frequency:      { interval_unit: intervalUnit, interval_count: 1 },
        tenure_type:    'REGULAR',
        sequence:       1,
        total_cycles:   0, // unlimited
        pricing_scheme: { fixed_price: { value: (amountCents / 100).toFixed(2), currency_code: currency.toUpperCase() } },
      }],
      payment_preferences: {
        auto_bill_outstanding:    true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal createBillingPlan: ${JSON.stringify(data)}`);
  return data; // { id, status: 'ACTIVE' }
}

// Create a subscription against an existing plan — returns approval URL for redirect.
async function createSubscription(planId, subscriberEmail, subscriberName = '') {
  if (!isConfigured()) {
    return {
      id:     `MOCK_SUB_${Date.now()}`,
      status: 'APPROVAL_PENDING',
      links:  [{ rel: 'approve', href: '#mock-paypal-approve' }],
    };
  }
  const token      = await getAccessToken();
  const [firstName, ...rest] = subscriberName.trim().split(' ');
  const res = await fetch(`${getBase()}/v1/billing/subscriptions`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      plan_id: planId,
      subscriber: {
        name:          { given_name: firstName || subscriberEmail, surname: rest.join(' ') || '' },
        email_address: subscriberEmail,
      },
      application_context: {
        brand_name:          process.env.APP_NAME || 'LMS Platform',
        locale:              'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action:         'SUBSCRIBE_NOW',
        return_url:          `${process.env.APP_URL}/billing/paypal-return`,
        cancel_url:          `${process.env.APP_URL}/billing`,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal createSubscription: ${JSON.stringify(data)}`);
  return data; // { id, status, links: [{ rel: 'approve', href }] }
}

async function getSubscription(subscriptionId) {
  if (!isConfigured()) {
    return { id: subscriptionId, status: 'ACTIVE' };
  }
  const token = await getAccessToken();
  const res   = await fetch(`${getBase()}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal getSubscription: ${JSON.stringify(data)}`);
  return data;
}

async function cancelSubscription(subscriptionId, reason = 'Cancelled by user') {
  if (!isConfigured()) return { success: true };
  const token = await getAccessToken();
  const res   = await fetch(`${getBase()}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ reason }),
  });
  if (res.status === 204) return { success: true }; // 204 No Content = success
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal cancelSubscription: ${JSON.stringify(data)}`);
  return { success: true };
}

async function verifyWebhookSignature(headers, rawBody) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || !isConfigured()) return true; // mock mode — skip verification

  const token = await getAccessToken();
  const res   = await fetch(`${getBase()}/v1/notifications/verify-webhook-signature`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      auth_algo:         headers['paypal-auth-algo'],
      cert_url:          headers['paypal-cert-url'],
      client_id:         process.env.PAYPAL_CLIENT_ID,
      transmission_id:   headers['paypal-transmission-id'],
      transmission_sig:  headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id:        webhookId,
      webhook_event:     typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody,
    }),
  });
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

module.exports = {
  isConfigured, createOrder, captureOrder, verifyWebhookSignature,
  refundCapture,
  createBillingPlan, createSubscription, getSubscription, cancelSubscription,
};
