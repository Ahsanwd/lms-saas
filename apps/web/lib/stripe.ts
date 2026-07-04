import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return Promise.resolve(null); // mock mode — no Stripe key configured
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

// Each tenant brings their own Stripe publishable key (BYO gateway) — cache one
// promise per key so switching between tenants/courses doesn't reload the SDK.
const tenantStripePromises = new Map<string, Promise<Stripe | null>>();

export function loadStripeWithKey(publishableKey: string | null | undefined): Promise<Stripe | null> {
  if (!publishableKey) return Promise.resolve(null);
  if (!tenantStripePromises.has(publishableKey)) {
    tenantStripePromises.set(publishableKey, loadStripe(publishableKey));
  }
  return tenantStripePromises.get(publishableKey)!;
}
