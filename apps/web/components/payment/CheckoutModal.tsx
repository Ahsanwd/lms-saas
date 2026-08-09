'use client';

import { useState, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { getStripePromise, loadStripeWithKey } from '@/lib/stripe';

declare global {
  interface Window { paypal?: any }
}

interface WiseAccount {
  accountHolderName: string | null;
  email: string | null;
  iban: string | null;
  swiftBic: string | null;
  accountNumber: string | null;
}

// Loads the PayPal JS SDK once per clientId+currency combination and renders
// its Buttons widget — createOrder just hands back the orderID we already
// created server-side (amount is never client-controlled), onApprove hits
// our capture endpoint which is the actual source of truth for enrollment.
function PaypalButton({
  clientId, currency, orderId, paymentId, confirmUrlBase, onSuccess, onError,
}: {
  clientId: string; currency: string; orderId: string; paymentId: string;
  confirmUrlBase: string; onSuccess: () => void; onError: (msg: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    const existing = document.getElementById('paypal-sdk-script') as HTMLScriptElement | null;
    if (window.paypal) { setSdkReady(true); return; }
    if (existing) { existing.addEventListener('load', () => setSdkReady(true)); return; }

    const script = document.createElement('script');
    script.id = 'paypal-sdk-script';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency.toUpperCase())}&intent=capture`;
    script.onload = () => setSdkReady(true);
    script.onerror = () => onError('Failed to load PayPal — please try again.');
    document.body.appendChild(script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, currency]);

  useEffect(() => {
    if (!sdkReady || !window.paypal || !containerRef.current) return;
    containerRef.current.innerHTML = '';

    const buttons = window.paypal.Buttons({
      style: { layout: 'vertical', shape: 'rect', label: 'pay' },
      createOrder: () => orderId,
      onApprove: async () => {
        try {
          await api.post(`${confirmUrlBase}/${paymentId}/capture-paypal`);
          onSuccess();
        } catch (e: unknown) {
          onError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Payment could not be confirmed');
        }
      },
      onError: () => onError('PayPal encountered an error — please try again.'),
    });
    buttons.render(containerRef.current);

    return () => { try { buttons.close(); } catch { /* already unmounted */ } };
  }, [sdkReady, orderId, paymentId, confirmUrlBase, onSuccess, onError]);

  return (
    <div className="space-y-3">
      {!sdkReady && <div className="flex justify-center py-6"><Spinner /></div>}
      <div ref={containerRef} />
    </div>
  );
}

export interface CouponResult {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  discountAmount: number;
  finalPrice: number;
}

interface ManualAccount {
  type: 'bank' | 'jazzcash' | 'easypaisa';
  label: string | null;
  accountTitle: string;
  accountNumber: string;
  bankName: string | null;
}

const MANUAL_ACCOUNT_TYPE_LABELS: Record<ManualAccount['type'], string> = {
  bank: 'Bank Transfer', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa',
};

function StripeCardForm({
  paymentId, clientSecret, confirmUrlBase, amount, onSuccess,
}: {
  paymentId: string | null; clientSecret: string | null; confirmUrlBase: string;
  amount: number; onSuccess: () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    if (!paymentId) return;
    setError('');
    setLoading(true);

    // Mock mode — confirm directly via backend
    if (!stripe || !elements || !clientSecret) {
      try {
        await api.post(`${confirmUrlBase}/${paymentId}/confirm`);
        onSuccess();
      } catch (e: unknown) {
        setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Payment failed');
      } finally { setLoading(false); }
      return;
    }

    const { error: submitErr } = await elements.submit();
    if (submitErr) { setError(submitErr.message ?? 'Payment form error'); setLoading(false); return; }

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (stripeError) {
      setError(stripeError.message ?? 'Payment failed');
      setLoading(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'processing') {
      try {
        await api.post(`${confirmUrlBase}/${paymentId}/confirm`);
        onSuccess();
      } catch (e: unknown) {
        setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Enrollment failed');
      }
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2 text-xs text-gray-400 border-t border-gray-100 pt-3">
        <svg className="w-4 h-4 flex-shrink-0 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
        </svg>
        <span>Secured by Stripe · Supports cards, Apple Pay, Google Pay</span>
      </div>

      <Button className="w-full" loading={loading} onClick={handlePay}>
        Pay ${amount.toFixed(2)}
      </Button>
    </div>
  );
}

export interface CheckoutModalProps {
  itemLabel: string;
  price: number;
  initiateUrl: string;
  confirmUrlBase: string; // confirm endpoint is `${confirmUrlBase}/${paymentId}/confirm`
  /** Host already resolved a coupon externally (e.g. course page's own coupon UI) */
  couponCode?: string;
  /** Modal owns its own coupon input/apply step (e.g. bundle catalog cards) */
  validateCoupon?: (code: string) => Promise<CouponResult>;
  successTitle?: string;
  successMessage?: string;
  initialStep?: 'method' | 'done';
  onSuccess: () => void;
  /** `completed` is true only when closed from the real success screen — the
   * student is actually enrolled. It's false for every other dismissal
   * (cancelled, or a manual payment still awaiting admin review) — hosts
   * must not treat those as "go view the content" since nothing was granted.
   * `pendingReview` is true specifically when a manual/Wise proof was
   * submitted and is now awaiting admin approval (as opposed to a plain
   * cancel) — hosts can use it to show different messaging/navigation. */
  onClose: (completed: boolean, pendingReview?: boolean) => void;
}

export function CheckoutModal({
  itemLabel, price, initiateUrl, confirmUrlBase, couponCode, validateCoupon,
  successTitle = 'Payment successful!', successMessage = 'You now have access. Enjoy!',
  initialStep = 'method', onSuccess, onClose,
}: CheckoutModalProps) {
  const [paymentStep, setPaymentStep]       = useState<'method' | 'card' | 'manual-proof' | 'wise-proof' | 'paypal' | 'pending-review' | 'done'>(initialStep);
  const [paymentId, setPaymentId]           = useState<string | null>(null);
  const [clientSecret, setClientSecret]     = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);

  const [manualAccounts, setManualAccounts]         = useState<ManualAccount[]>([]);
  const [manualInstructions, setManualInstructions] = useState<string | null>(null);
  const [proofFile, setProofFile]                   = useState<File | null>(null);
  const [proofError, setProofError]                 = useState('');

  const [wiseAccount, setWiseAccount]         = useState<WiseAccount | null>(null);
  const [wiseInstructions, setWiseInstructions] = useState<string | null>(null);

  const [paypalOrderId, setPaypalOrderId]   = useState<string | null>(null);
  const [paypalClientId, setPaypalClientId] = useState<string | null>(null);
  const [paypalCurrency, setPaypalCurrency] = useState('usd');
  const [paypalError, setPaypalError]       = useState('');

  const [couponInput, setCouponInput]           = useState('');
  const [appliedCoupon, setAppliedCoupon]       = useState<CouponResult | null>(null);
  const [couponError, setCouponError]           = useState('');
  const [showCouponInput, setShowCouponInput]   = useState(false);

  const couponMutation = useMutation({
    mutationFn: (code: string) => validateCoupon!(code),
    onSuccess: (result) => { setAppliedCoupon(result); setCouponError(''); },
    onError: (err: AxiosError<{ message: string }>) => {
      setCouponError(err.response?.data?.message ?? 'Invalid coupon code');
      setAppliedCoupon(null);
    },
  });

  const effectiveCouponCode = couponCode ?? appliedCoupon?.code;
  const displayPrice = appliedCoupon?.finalPrice ?? price;

  const initiateMutation = useMutation({
    mutationFn: () => api.post(initiateUrl, { couponCode: effectiveCouponCode }),
    onSuccess: (res) => {
      const d = res.data.data;
      setPaymentId(d.paymentId);
      if (d.provider === 'manual') {
        setManualAccounts(d.accounts ?? []);
        setManualInstructions(d.instructions ?? null);
        setPaymentStep('manual-proof');
        return;
      }
      if (d.provider === 'wise') {
        setWiseAccount(d.account ?? null);
        setWiseInstructions(d.instructions ?? null);
        setPaymentStep('wise-proof');
        return;
      }
      if (d.provider === 'paypal') {
        setPaypalOrderId(d.paypalOrderId);
        setPaypalClientId(d.paypalClientId);
        setPaypalCurrency(d.currency ?? 'usd');
        setPaymentStep('paypal');
        return;
      }
      setClientSecret(d.clientSecret ?? null);
      setPublishableKey(d.publishableKey ?? null);
      setPaymentStep('card');
    },
  });

  const uploadProofMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('proof', proofFile as File);
      return api.post(`${confirmUrlBase}/${paymentId}/proof`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => { setPaymentStep('pending-review'); },
    onError: (err: AxiosError<{ message: string }>) => {
      setProofError(err.response?.data?.message ?? 'Failed to upload proof');
    },
  });

  const onPaymentSuccess = () => {
    setPaymentStep('done');
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">

        {/* ── Success ── */}
        {paymentStep === 'done' && (
          <>
            <div className="flex flex-col items-center py-4 space-y-3">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">{successTitle}</p>
              <p className="text-sm text-gray-500 text-center">{successMessage}</p>
            </div>
            <Button className="w-full" onClick={() => onClose(true)}>Done</Button>
          </>
        )}

        {/* ── Method selector ── */}
        {paymentStep === 'method' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Choose Payment Method</h2>
              <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate">{itemLabel}</span>
              <span className="text-base font-bold text-gray-900 ml-3 flex-shrink-0">${displayPrice.toFixed(2)}</span>
            </div>

            {validateCoupon && !couponCode && (
              appliedCoupon ? (
                <div className="flex items-center justify-between gap-2 text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2">
                  <span><span className="font-mono">{appliedCoupon.code}</span> applied — save ${appliedCoupon.discountAmount.toFixed(2)}</span>
                  <button onClick={() => { setAppliedCoupon(null); setCouponInput(''); }} className="text-green-500 hover:text-green-700 flex-shrink-0">Remove</button>
                </div>
              ) : showCouponInput ? (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Coupon code"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    <Button size="sm" variant="outline" loading={couponMutation.isPending}
                      disabled={!couponInput.trim()}
                      onClick={() => { setCouponError(''); couponMutation.mutate(couponInput.trim()); }}>
                      Apply
                    </Button>
                  </div>
                  {couponError && <p className="text-xs text-red-500">{couponError}</p>}
                </div>
              ) : (
                <button onClick={() => setShowCouponInput(true)} className="text-xs text-primary-600 hover:underline text-left">
                  Have a coupon?
                </button>
              )
            )}

            <div className="space-y-3">
              <button
                onClick={() => initiateMutation.mutate()}
                disabled={initiateMutation.isPending}
                className="w-full py-3.5 rounded-xl border-2 border-gray-200 hover:border-primary-400 bg-white flex items-center gap-4 px-4 transition-all disabled:opacity-50"
              >
                <div className="w-10 h-7 bg-gradient-to-r from-indigo-500 to-purple-600 rounded flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-4 text-white" viewBox="0 0 38 24" fill="currentColor">
                    <rect width="38" height="24" rx="4" fill="none"/>
                    <path d="M35 0H3C1.3 0 0 1.3 0 3v18c0 1.7 1.4 3 3 3h32c1.7 0 3-1.3 3-3V3c0-1.7-1.4-3-3-3zm0 22H3V2h32v20z" fill="currentColor" opacity=".3"/>
                    <path d="M15 14.9c-.5.3-1 .4-1.7.4-1.7 0-2.9-1.2-2.9-2.9 0-1.6 1.2-2.9 2.9-2.9.7 0 1.3.2 1.7.5l.9-1c-.7-.5-1.6-.8-2.6-.8-2.4 0-4.3 1.8-4.3 4.2s1.9 4.2 4.3 4.2c1 0 2-.3 2.7-.9l-.9-.8z" fill="currentColor"/>
                    <path d="M20.4 9.2c-2.4 0-4.3 1.8-4.3 4.2s1.9 4.2 4.3 4.2 4.3-1.8 4.3-4.2-1.9-4.2-4.3-4.2zm0 7c-1.6 0-2.9-1.2-2.9-2.8s1.3-2.8 2.9-2.8 2.9 1.2 2.9 2.8-1.3 2.8-2.9 2.8z" fill="currentColor"/>
                  </svg>
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-gray-900">Credit / Debit Card</p>
                  <p className="text-xs text-gray-400">Visa, Mastercard, Amex</p>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>

            {initiateMutation.isPending && (
              <div className="flex justify-center pt-2"><Spinner /></div>
            )}
            {initiateMutation.isError && (
              <p className="text-sm text-red-600 text-center">
                {(initiateMutation.error as AxiosError<{ message: string }>)?.response?.data?.message ?? 'Failed to start checkout'}
              </p>
            )}
          </>
        )}

        {/* ── Stripe card step ── */}
        {paymentStep === 'card' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setPaymentStep('method')} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-gray-900 flex-1">Card Payment</h2>
              <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate">{itemLabel}</span>
              <span className="text-base font-bold text-gray-900 ml-3 flex-shrink-0">${displayPrice.toFixed(2)}</span>
            </div>

            <Elements
              stripe={publishableKey ? loadStripeWithKey(publishableKey) : getStripePromise()}
              options={clientSecret ? { clientSecret, appearance: { theme: 'stripe' } } : undefined}
            >
              <StripeCardForm
                paymentId={paymentId}
                clientSecret={clientSecret}
                confirmUrlBase={confirmUrlBase}
                amount={displayPrice}
                onSuccess={onPaymentSuccess}
              />
            </Elements>
          </>
        )}

        {/* ── PayPal step ── */}
        {paymentStep === 'paypal' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setPaymentStep('method')} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-gray-900 flex-1">Pay with PayPal</h2>
              <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate">{itemLabel}</span>
              <span className="text-base font-bold text-gray-900 ml-3 flex-shrink-0">${displayPrice.toFixed(2)}</span>
            </div>

            {paypalError && <p className="text-sm text-red-600">{paypalError}</p>}

            {paypalOrderId && paypalClientId && paymentId && (
              <PaypalButton
                clientId={paypalClientId}
                currency={paypalCurrency}
                orderId={paypalOrderId}
                paymentId={paymentId}
                confirmUrlBase={confirmUrlBase}
                onSuccess={onPaymentSuccess}
                onError={setPaypalError}
              />
            )}
          </>
        )}

        {/* ── Manual payment: show accounts, upload proof ── */}
        {paymentStep === 'manual-proof' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setPaymentStep('method')} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-gray-900 flex-1">Bank / Wallet Transfer</h2>
              <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate">{itemLabel}</span>
              <span className="text-base font-bold text-gray-900 ml-3 flex-shrink-0">${displayPrice.toFixed(2)}</span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {manualAccounts.map((acc, i) => (
                <div key={i} className="rounded-xl border border-gray-200 p-3 space-y-1">
                  <p className="text-xs font-semibold text-primary-600">{MANUAL_ACCOUNT_TYPE_LABELS[acc.type]}{acc.label ? ` — ${acc.label}` : ''}</p>
                  {acc.bankName && <p className="text-sm text-gray-700">{acc.bankName}</p>}
                  <p className="text-sm text-gray-700">{acc.accountTitle}</p>
                  <p className="text-sm font-mono text-gray-900">{acc.accountNumber}</p>
                </div>
              ))}
            </div>

            {manualInstructions && (
              <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{manualInstructions}</p>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Upload payment screenshot</label>
              <input type="file" accept="image/*"
                onChange={e => { setProofError(''); setProofFile(e.target.files?.[0] ?? null); }}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
            </div>

            {proofError && <p className="text-sm text-red-600">{proofError}</p>}

            <Button className="w-full" loading={uploadProofMutation.isPending}
              disabled={!proofFile}
              onClick={() => uploadProofMutation.mutate()}>
              Submit for Review
            </Button>
          </>
        )}

        {/* ── Wise payment: show account details, upload proof ── */}
        {paymentStep === 'wise-proof' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setPaymentStep('method')} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-gray-900 flex-1">Pay via Wise</h2>
              <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600 truncate">{itemLabel}</span>
              <span className="text-base font-bold text-gray-900 ml-3 flex-shrink-0">${displayPrice.toFixed(2)}</span>
            </div>

            {wiseAccount && (
              <div className="rounded-xl border border-gray-200 p-3 space-y-1">
                <p className="text-xs font-semibold text-primary-600">Wise Transfer</p>
                {wiseAccount.accountHolderName && <p className="text-sm text-gray-700">{wiseAccount.accountHolderName}</p>}
                {wiseAccount.email && <p className="text-sm font-mono text-gray-900">{wiseAccount.email}</p>}
                {wiseAccount.iban && <p className="text-sm font-mono text-gray-900">IBAN: {wiseAccount.iban}</p>}
                {wiseAccount.swiftBic && <p className="text-sm font-mono text-gray-900">SWIFT/BIC: {wiseAccount.swiftBic}</p>}
                {wiseAccount.accountNumber && <p className="text-sm font-mono text-gray-900">Account: {wiseAccount.accountNumber}</p>}
              </div>
            )}

            {wiseInstructions && (
              <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{wiseInstructions}</p>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Upload payment screenshot</label>
              <input type="file" accept="image/*"
                onChange={e => { setProofError(''); setProofFile(e.target.files?.[0] ?? null); }}
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
            </div>

            {proofError && <p className="text-sm text-red-600">{proofError}</p>}

            <Button className="w-full" loading={uploadProofMutation.isPending}
              disabled={!proofFile}
              onClick={() => uploadProofMutation.mutate()}>
              Submit for Review
            </Button>
          </>
        )}

        {/* ── Manual payment: pending admin review ── */}
        {paymentStep === 'pending-review' && (
          <>
            <div className="flex flex-col items-center py-4 space-y-3">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">Payment submitted — pending review</p>
              <p className="text-sm text-gray-500 text-center">We'll verify your payment and enroll you shortly. You'll get an email once it's approved.</p>
            </div>
            <Button className="w-full" onClick={() => onClose(false, true)}>Close</Button>
          </>
        )}

      </div>
    </div>
  );
}
