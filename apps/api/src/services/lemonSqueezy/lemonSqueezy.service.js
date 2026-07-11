const crypto = require('crypto');
const AppError = require('../../utils/AppError');

const LS_API_BASE = 'https://api.lemonsqueezy.com/v1';

function getHeaders() {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) throw new AppError('Lemon Squeezy not configured', 500);
  return {
    'Authorization': `Bearer ${key}`,
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
  };
}

async function lsRequest(method, path, body) {
  const res = await fetch(`${LS_API_BASE}${path}`, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json?.errors?.[0]?.detail || 'Lemon Squeezy API error';
    throw new AppError(msg, res.status);
  }
  return json;
}

// Create a hosted checkout URL for the given variant. `extraCustom` merges extra
// keys into checkout_data.custom (echoed back on the webhook's meta.custom_data) —
// used by one-time top-up purchases to carry a `purchase_type`/`topup_type` marker
// alongside the usual tenant_id, without a subscription's billingCycle.
async function createCheckout({ variantId, tenantId, email, name, billingCycle, successUrl, cancelUrl, extraCustom }) {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) throw new AppError('LEMONSQUEEZY_STORE_ID not set', 500);

  const payload = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_options: {
          embed: false,
          media: true,
          logo: true,
          desc: true,
          discount: true,
          button_color: '#4F46E5',
        },
        checkout_data: {
          email,
          name,
          custom: {
            tenant_id: tenantId.toString(),
            ...(billingCycle ? { billing_cycle: billingCycle } : {}),
            ...(extraCustom || {}),
          },
        },
        product_options: {
          redirect_url:         successUrl,
          receipt_link_url:     successUrl,
          receipt_button_text:  'Go to Dashboard',
          receipt_thank_you_note: 'Thank you for choosing Coursel!',
        },
      },
      relationships: {
        store:   { data: { type: 'stores',   id: String(storeId)   } },
        variant: { data: { type: 'variants', id: String(variantId) } },
      },
    },
  };

  const result = await lsRequest('POST', '/checkouts', payload);
  return result.data.attributes.url;
}

// Get subscription details from LS
async function getSubscription(lsSubscriptionId) {
  return lsRequest('GET', `/subscriptions/${lsSubscriptionId}`);
}

// Cancel a subscription in LS
async function cancelSubscription(lsSubscriptionId) {
  return lsRequest('DELETE', `/subscriptions/${lsSubscriptionId}`);
}

// Verify LS webhook signature
function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) throw new AppError('LEMONSQUEEZY_WEBHOOK_SECRET not set', 500);
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (hash !== signatureHeader) throw new AppError('Invalid webhook signature', 401);
}

// Map LS subscription status → our Subscription status
function mapLsStatus(lsStatus) {
  const map = {
    active:      'active',
    on_trial:    'trial',
    paused:      'past_due',
    past_due:    'past_due',
    unpaid:      'past_due',
    cancelled:   'cancelled',
    expired:     'expired',
  };
  return map[lsStatus] || 'active';
}

module.exports = { createCheckout, getSubscription, cancelSubscription, verifyWebhookSignature, mapLsStatus };
