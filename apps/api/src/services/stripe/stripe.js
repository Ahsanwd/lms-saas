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

// Returns an existing Stripe customer or creates a new one.
// Persists stripeCustomerId back to the User document.
async function createOrGetCustomer(userId, email, name, existingCustomerId) {
  const stripe = getStripe();
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

module.exports = { getStripe, createOrGetCustomer };
