import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return Promise.resolve(null); // mock mode — no Stripe key configured
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}
