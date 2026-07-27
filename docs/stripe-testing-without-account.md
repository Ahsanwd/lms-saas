# Stripe Integration Testing — Without Owning a Stripe Account

Context: Pakistan is not on Stripe's list of supported countries for account
creation, so the developer can't sign up for a real Stripe account. This
project doesn't need one — here's why, and how to test end-to-end anyway.

## The system already has a built-in mock-payment mode

Each tenant configures their **own** Stripe secret key (BYO — bring your own).
See `getTenantStripeClient()` in
[apps/api/src/services/stripe/stripe.js](../apps/api/src/services/stripe/stripe.js).

If a tenant has **not** configured a Stripe key yet, the backend automatically
falls back to mock mode:

- [payment.service.js](../apps/api/src/modules/payment/payment.service.js) —
  `stripeClient` resolves to `null`, a fake payment intent (`mock_pi_...`) is
  generated, and confirm always succeeds.
- [CheckoutModal.tsx](../apps/web/components/payment/CheckoutModal.tsx) —
  when no `clientSecret` comes back, `StripeCardForm` skips the card form
  entirely and calls `/confirm` directly against the backend.

Result: the **entire** Buy Now → Pay → Enrolled flow can be clicked through
with zero external dependency on Stripe. This is also what exercises the part
of the app most likely to have real bugs — routing after payment, enrollment
activation, DB updates, UI state — not Stripe's own API.

## How to test right now

1. Leave the tenant's payment gateway settings **unconfigured** (no Stripe
   key) — mock mode activates automatically.
2. Free course → click **Enroll Now** → should land on `/courses/{id}/learn`.
3. Paid course → click **Buy Now** → checkout modal opens → confirm → should
   land on `/courses/{id}/learn`.
4. Open the checkout modal and **cancel/close it** without paying → must
   **not** enroll the student (already handled correctly — `onClose` only
   navigates to `/learn` when `completed` is `true`).

## What mock mode does NOT cover

- Real Stripe webhook signature verification
  ([stripe.webhook.js](../apps/api/src/modules/webhook/stripe.webhook.js))
- Real card decline codes, 3D Secure flow
- Actual Stripe API response quirks

To cover these without a Pakistani Stripe account:

- Create a **free Stripe account in test mode**, selecting a supported
  country (e.g. US/UK) at signup. Stripe only requires ID/business
  verification when you try to **activate live payments** — test mode
  (`sk_test_...` / `pk_test_...` keys) needs none of that. This is a common,
  legitimate practice for developers building an integration for a client in
  a different country. Never attempt to activate real/live payouts on that
  account without genuine identity/business info — stay in test mode only.
- Alternative: ask any contact in a supported country to spin up a free
  Stripe test account (takes ~2 minutes) and share the **test** keys — test
  keys can't move real money, so sharing them is safe.
- Use Stripe's test card numbers (e.g. `4242 4242 4242 4242` for success,
  `4000 0000 0000 9995` for decline) and the Stripe CLI
  (`stripe listen --forward-to <url>/webhook`) to exercise webhook signature
  verification locally.

## At client launch

The client (or their business, registered in a Stripe-supported country)
creates their **own** real Stripe account and pastes their live secret key
into their tenant's payment gateway settings. The app's BYO architecture
already handles this — the developer never needs a personal live Stripe
account.
