const jwt        = require('jsonwebtoken');
const StripeConnect = require('../../database/models/StripeConnect.model');
const { getStripe } = require('../../services/stripe/stripe');
const AppError    = require('../../utils/AppError');

// Use the encryption key as HMAC secret for state JWTs (just needs to be consistent & secret)
function stateSecret() {
  const s = process.env.ENCRYPTION_KEY || process.env.STRIPE_CONNECT_STATE_SECRET;
  if (!s) throw new Error('No secret available for Stripe Connect state signing');
  return s;
}

// ─── Build the Stripe OAuth URL ───────────────────────────────────────────────
function getAuthUrl(tenantId, userId) {
  if (!getStripe()) throw new AppError('Stripe is not configured on this server', 503);
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) throw new AppError('STRIPE_CONNECT_CLIENT_ID is not set', 503);

  const state = jwt.sign(
    { tenantId: tenantId.toString(), userId: userId.toString() },
    stateSecret(),
    { expiresIn: '15m' }
  );

  const redirectUri = `${process.env.APP_URL}/stripe-connect/callback`;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     clientId,
    scope:         'read_write',
    redirect_uri:  redirectUri,
    state,
  });

  return `https://connect.stripe.com/oauth/authorize?${params}`;
}

// ─── Exchange OAuth code for the connected account ────────────────────────────
async function exchangeToken(code, stateToken, requestingUserId) {
  const stripe = getStripe();
  if (!stripe) throw new AppError('Stripe is not configured on this server', 503);

  // Verify state JWT
  let payload;
  try {
    payload = jwt.verify(stateToken, stateSecret());
  } catch {
    throw new AppError('Invalid or expired state token', 400, 'STATE_INVALID');
  }

  if (payload.userId !== requestingUserId.toString())
    throw new AppError('State token user mismatch', 403);

  const tenantId = payload.tenantId;

  // Exchange code → connected account ID
  let oauthResponse;
  try {
    oauthResponse = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });
  } catch (err) {
    throw new AppError(`Stripe OAuth failed: ${err.message}`, 400, 'STRIPE_OAUTH_FAILED');
  }

  const stripeAccountId = oauthResponse.stripe_user_id;

  // Fetch live account details (charges/payouts status)
  let account;
  try {
    account = await stripe.accounts.retrieve(stripeAccountId);
  } catch {
    account = { email: null, charges_enabled: false, payouts_enabled: false };
  }

  await StripeConnect.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        stripeAccountId,
        accountEmail:   account.email ?? null,
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        connectedAt:    new Date(),
        connectedBy:    requestingUserId,
      },
    },
    { upsert: true, new: true }
  );

  return { stripeAccountId, accountEmail: account.email };
}

// ─── Connection status ────────────────────────────────────────────────────────
async function getStatus(tenantId) {
  const record = await StripeConnect.findOne({ tenantId });
  if (!record) return { connected: false };

  // Refresh account flags from Stripe (non-blocking)
  const stripe = getStripe();
  if (stripe) {
    try {
      const account = await stripe.accounts.retrieve(record.stripeAccountId);
      record.chargesEnabled = account.charges_enabled;
      record.payoutsEnabled = account.payouts_enabled;
      await record.save();
    } catch {
      // Account may have been deauthorised on Stripe side — keep stale data
    }
  }

  return {
    connected:       true,
    stripeAccountId: record.stripeAccountId,
    accountEmail:    record.accountEmail,
    chargesEnabled:  record.chargesEnabled,
    payoutsEnabled:  record.payoutsEnabled,
    connectedAt:     record.connectedAt,
  };
}

// ─── Disconnect ───────────────────────────────────────────────────────────────
async function disconnect(tenantId) {
  const record = await StripeConnect.findOne({ tenantId });
  if (!record) throw new AppError('No Stripe account connected', 404);

  const stripe = getStripe();
  if (stripe && process.env.STRIPE_CONNECT_CLIENT_ID) {
    try {
      await stripe.oauth.deauthorize({
        client_id:       process.env.STRIPE_CONNECT_CLIENT_ID,
        stripe_user_id:  record.stripeAccountId,
      });
    } catch {
      // Already deauthorised on Stripe side — continue deleting our record
    }
  }

  await StripeConnect.deleteOne({ tenantId });
}

// ─── Utility: get connected account ID for payment routing ───────────────────
async function getConnectedAccountId(tenantId) {
  const record = await StripeConnect.findOne({ tenantId }, { stripeAccountId: 1 });
  return record?.stripeAccountId ?? null;
}

module.exports = { getAuthUrl, exchangeToken, getStatus, disconnect, getConnectedAccountId };
