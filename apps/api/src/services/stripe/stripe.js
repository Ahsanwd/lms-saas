const Stripe = require('stripe');

let _stripe = null;

// Returns the Stripe client if STRIPE_SECRET_KEY is set, otherwise null (mock mode).
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' });
  }
  return _stripe;
}

// Fresh Stripe client for a tenant's own BYO secret key (course payments).
// Not cached like getStripe() — each tenant has a different key.
function getTenantStripeClient(secretKey) {
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: '2024-11-20.acacia' });
}

// Returns an existing Stripe customer or creates a new one on the given client.
// Persists stripeCustomerId back to the User document.
async function createOrGetCustomer(stripe, userId, email, name, existingCustomerId) {
  if (!stripe) return null; // mock mode

  if (existingCustomerId) {
    try {
      const cus = await stripe.customers.retrieve(existingCustomerId);
      if (!cus.deleted) return existingCustomerId;
    } catch { /* deleted or invalid — fall through to create */ }
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId: userId.toString() },
  });

  // Persist back to User (fire-and-forget — if it fails we just re-create next time)
  setImmediate(() => {
    const User = require('../../database/models/User.model');
    User.updateOne({ _id: userId }, { stripeCustomerId: customer.id }).catch(() => {});
  });

  return customer.id;
}

module.exports = { getStripe, getTenantStripeClient, createOrGetCustomer };
