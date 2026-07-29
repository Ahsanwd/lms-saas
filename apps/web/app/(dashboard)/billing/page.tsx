'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import api from '@/lib/api';
import { connectSocket } from '@/lib/socket';
import { Badge, Button, Spinner, Alert } from '@/components/ui';
import { formatDate, cn } from '@/lib/utils';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripePromise } from '@/lib/stripe';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Plan {
  _id: string;
  name: string;
  slug: string;
  price: { monthly: number; yearly: number };
  limits: { students: number; instructors: number; courses: number; storageGB: number };
  features: string[];
}

interface Subscription {
  _id: string;
  planId: Plan;
  status: 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired';
  billingCycle: 'monthly' | 'yearly' | 'manual';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  isOnTrial: boolean;
  trialEnd: string | null;
  autoRenew: boolean;
  gracePeriodEndsAt: string | null;
}

interface Invoice {
  _id: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  discountAmount: number;
  taxRate?: number;
  taxLabel?: string;
  taxAmount?: number;
  total: number;
  currency?: string;
  status: 'unpaid' | 'paid' | 'cancelled' | 'refunded' | 'pending';
  dueDate: string;
  paidAt: string | null;
  billingCycle: string;
  description?: string;
}

interface CouponResult {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  description: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  active: 'success', trial: 'warning', past_due: 'warning',
  cancelled: 'default', expired: 'danger',
};

const INVOICE_BADGE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  paid: 'success', unpaid: 'warning', pending: 'warning',
  cancelled: 'default', refunded: 'default',
};

function limitLabel(val: number) { return val === -1 ? 'Unlimited' : val.toString(); }
function fmt(n: number, currency?: string) {
  const code = (currency || 'usd').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(n ?? 0);
  } catch {
    return `${code} ${Number(n ?? 0).toFixed(2)}`;
  }
}

function applyDiscount(subtotal: number, coupon: CouponResult | null): number {
  if (!coupon) return 0;
  return coupon.discountType === 'percentage'
    ? Math.round((subtotal * coupon.discountValue) / 100)
    : Math.min(coupon.discountValue, subtotal);
}

/** Returns 'upgrade' | 'downgrade' | 'same' relative to the current plan's monthly price */
function planDirection(targetPlan: Plan | undefined, currentPlan?: Plan): 'upgrade' | 'downgrade' | 'same' {
  if (!targetPlan || !currentPlan) return 'upgrade';
  if (targetPlan._id === currentPlan._id) return 'same';
  return targetPlan.price.monthly > currentPlan.price.monthly ? 'upgrade' : 'downgrade';
}

// ── Stripe Payment Element form for subscription payments ─────────────────────

function BillingStripeCardForm({
  clientSecret,
  planName,
  total,
  onSuccess,
  onBack,
}: {
  clientSecret: string | null;
  planName: string;
  total: number;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const stripe   = useStripe();
  const elements = useElements();
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    setError('');
    setLoading(true);

    // Mock mode — activate directly without Stripe
    if (!stripe || !elements || !clientSecret) {
      try { onSuccess(); } finally { setLoading(false); }
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
        await api.post('/billing/subscription/payment/confirm', { paymentIntentId: paymentIntent.id });
        onSuccess();
      } catch (e: unknown) {
        setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Activation failed');
      }
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between border border-gray-100">
        <span className="text-sm text-gray-600">{planName} plan</span>
        <span className="text-base font-bold text-gray-900">{fmt(total)}</span>
      </div>

      <PaymentElement options={{ layout: 'tabs' }} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2 text-xs text-gray-400 pt-1">
        <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
        </svg>
        Secured by Stripe · Supports cards, Apple Pay, Google Pay
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onBack} className="flex-shrink-0">Back</Button>
        <Button className="flex-1" loading={loading} onClick={handlePay}>
          Pay {fmt(total)}
        </Button>
      </div>
    </div>
  );
}

// ── Change Plan Modal ─────────────────────────────────────────────────────────

function ChangePlanModal({
  plans,
  currentPlan,
  currentCycle,
  preselectedPlanId,
  onClose,
}: {
  plans: Plan[];
  currentPlan?: Plan;
  currentCycle?: string;
  preselectedPlanId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState(preselectedPlanId ?? '');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>(
    currentCycle === 'yearly' ? 'yearly' : 'monthly'
  );
  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<CouponResult | null>(null);
  const [couponError, setCouponError] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [error, setError] = useState('');
  // step: 'select' → plan/coupon picker | 'payment' → Stripe card | 'success' → done
  const [step, setStep] = useState<'select' | 'payment' | 'success'>('select');
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const { data: billingInfo } = useQuery({
    queryKey: ['billing', 'info'],
    queryFn: async () => { const { data } = await api.get('/billing/info'); return data.data as { taxRate: number; taxLabel: string; currency: string }; },
    staleTime: 5 * 60 * 1000,
  });

  const selectedPlan = plans.find(p => p._id === selectedPlanId);
  const direction = selectedPlan ? planDirection(selectedPlan, currentPlan) : 'upgrade';
  const isDowngrade = direction === 'downgrade';

  const subtotal = selectedPlan
    ? (cycle === 'yearly' ? selectedPlan.price.yearly : selectedPlan.price.monthly)
    : 0;
  const discount = applyDiscount(subtotal, coupon);
  const discountedTotal = Math.max(0, subtotal - discount);
  const taxRate   = billingInfo?.taxRate  ?? 0;
  const taxLabel  = billingInfo?.taxLabel ?? 'Tax';
  const taxAmount = taxRate > 0 ? Math.round(discountedTotal * taxRate) / 100 : 0;
  const total     = discountedTotal + taxAmount;

  function selectPlan(id: string) {
    setSelectedPlanId(id);
    setCoupon(null);
    setCouponCode('');
    setCouponError('');
    setError('');
  }

  function selectCycle(c: 'monthly' | 'yearly') {
    setCycle(c);
    setCoupon(null);
    setCouponCode('');
    setCouponError('');
  }

  async function handleValidateCoupon() {
    if (!couponCode.trim()) return;
    setCouponError('');
    setCoupon(null);
    setValidatingCoupon(true);
    try {
      const { data } = await api.post('/billing/coupons/validate', {
        code: couponCode.trim().toUpperCase(),
        planId: selectedPlanId || undefined,
      });
      setCoupon(data.data);
    } catch (err) {
      const e = err as AxiosError<{ message: string }>;
      setCouponError(e.response?.data?.message ?? 'Invalid coupon');
    } finally {
      setValidatingCoupon(false);
    }
  }

  const changeMutation = useMutation({
    mutationFn: () => api.post('/billing/subscription/upgrade', {
      planId: selectedPlanId,
      billingCycle: cycle,
      couponCode: coupon?.code || undefined,
    }),
    onSuccess: (res) => {
      if (res.data.data?.requiresPayment && res.data.data?.clientSecret) {
        // Stripe payment required — show card form
        setClientSecret(res.data.data.clientSecret);
        setStep('payment');
      } else {
        // Free plan or full discount — activated immediately
        qc.invalidateQueries({ queryKey: ['billing', 'subscription'] });
        qc.invalidateQueries({ queryKey: ['billing', 'invoices'] });
        setStep('success');
      }
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Plan change failed. Please try again.'),
  });

  // ── Success screen ──
  if (step === 'success') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
          <div className={cn(
            'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5',
            isDowngrade ? 'bg-amber-100' : 'bg-green-100'
          )}>
            <svg className={cn('w-8 h-8', isDowngrade ? 'text-amber-600' : 'text-green-600')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {isDowngrade ? 'Plan changed' : 'Plan upgraded!'}
          </h3>
          <p className="text-sm text-gray-600 mb-6">
            You&apos;re now on the <strong>{selectedPlan?.name}</strong> plan ({cycle}).
          </p>
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      </div>
    );
  }

  // ── Payment step (Stripe card collection) ──
  if (step === 'payment') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Complete Payment</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-xl leading-none">
              &times;
            </button>
          </div>
          <div className="p-6">
            <Elements
              stripe={getStripePromise()}
              options={clientSecret ? { clientSecret, appearance: { theme: 'stripe' } } : undefined}
            >
              <BillingStripeCardForm
                clientSecret={clientSecret}
                planName={selectedPlan?.name ?? ''}
                total={total}
                onSuccess={() => {
                  qc.invalidateQueries({ queryKey: ['billing', 'subscription'] });
                  qc.invalidateQueries({ queryKey: ['billing', 'invoices'] });
                  setStep('success');
                }}
                onBack={() => setStep('select')}
              />
            </Elements>
          </div>
        </div>
      </div>
    );
  }

  const otherPlans = plans.filter(p => p._id !== currentPlan?._id);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Change Plan</h2>
            {currentPlan && (
              <p className="text-xs text-gray-400 mt-0.5">Currently on <span className="font-medium text-gray-600">{currentPlan.name}</span></p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {error && <Alert variant="error">{error}</Alert>}

          {/* Plan selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Select plan
            </label>
            <div className="space-y-2">
              {otherPlans
                .sort((a, b) => a.price.monthly - b.price.monthly)
                .map(p => {
                  const dir = planDirection(p, currentPlan);
                  const isSelected = selectedPlanId === p._id;
                  return (
                    <label
                      key={p._id}
                      className={cn(
                        'flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all',
                        isSelected
                          ? dir === 'downgrade'
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-primary-500 bg-primary-50'
                          : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white'
                      )}
                    >
                      <input
                        type="radio"
                        name="plan"
                        value={p._id}
                        checked={isSelected}
                        onChange={() => selectPlan(p._id)}
                        className={cn('mt-0.5 shrink-0', dir === 'downgrade' ? 'accent-amber-500' : 'accent-primary-600')}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                            <span className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide',
                              dir === 'downgrade'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            )}>
                              {dir === 'downgrade' ? '↓ Downgrade' : '↑ Upgrade'}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-gray-900">
                              {p.price.monthly === 0 ? 'Free' : (
                                cycle === 'monthly' ? fmt(p.price.monthly) : fmt(p.price.yearly)
                              )}
                            </span>
                            {p.price.monthly > 0 && (
                              <span className="text-xs text-gray-400">/{cycle === 'monthly' ? 'mo' : 'yr'}</span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {limitLabel(p.limits.students)} students · {limitLabel(p.limits.instructors)} instructors · {limitLabel(p.limits.courses)} courses · {p.limits.storageGB} GB
                        </p>
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>

          {/* Billing cycle — only show if plan has a price */}
          {selectedPlan && selectedPlan.price.monthly > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Billing cycle
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['monthly', 'yearly'] as const).map(c => {
                  const saving = selectedPlan.price.monthly > 0
                    ? Math.round((1 - selectedPlan.price.yearly / (selectedPlan.price.monthly * 12)) * 100)
                    : 0;
                  return (
                    <button
                      key={c}
                      onClick={() => selectCycle(c)}
                      className={cn(
                        'py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all text-left',
                        cycle === c
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200 hover:bg-white'
                      )}
                    >
                      <span className="block font-semibold capitalize">{c}</span>
                      <span className="text-xs font-normal opacity-70">
                        {c === 'monthly'
                          ? fmt(selectedPlan.price.monthly) + '/mo'
                          : fmt(selectedPlan.price.yearly) + '/yr'
                        }
                        {c === 'yearly' && saving > 0 && (
                          <span className="ml-1.5 text-green-600 font-semibold">Save {saving}%</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Downgrade warning */}
          {selectedPlan && isDowngrade && (
            <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-sm">
                <p className="font-semibold text-amber-800 mb-1">Downgrade to {selectedPlan.name}</p>
                <p className="text-amber-700 text-xs leading-relaxed">
                  Your limits will reduce to {limitLabel(selectedPlan.limits.students)} students,&nbsp;
                  {limitLabel(selectedPlan.limits.instructors)} instructors, and {limitLabel(selectedPlan.limits.courses)} courses.
                  Any data exceeding these limits will become read-only.
                </p>
              </div>
            </div>
          )}

          {/* Coupon code — only for paid plans */}
          {selectedPlan && selectedPlan.price.monthly > 0 && !isDowngrade && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Coupon code <span className="normal-case font-normal text-gray-400">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value.toUpperCase().replace(/\s/g, '')); setCoupon(null); setCouponError(''); }}
                  placeholder="e.g. SUMMER20"
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono bg-gray-50 focus:bg-white transition-colors"
                />
                <Button
                  size="sm" variant="outline"
                  loading={validatingCoupon}
                  disabled={!couponCode.trim()}
                  onClick={handleValidateCoupon}
                >
                  Apply
                </Button>
              </div>
              {couponError && (
                <p className="mt-2 text-xs text-red-600 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {couponError}
                </p>
              )}
              {coupon && (
                <p className="mt-2 text-xs text-green-700 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <strong>{coupon.code}</strong>&nbsp;—&nbsp;
                  {coupon.discountType === 'percentage' ? `${coupon.discountValue}% off` : `$${coupon.discountValue} off`}
                  {coupon.description ? ` · ${coupon.description}` : ''}
                </p>
              )}
            </div>
          )}

          {/* Price summary */}
          {selectedPlan && selectedPlan.price.monthly > 0 && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm border border-gray-100">
              <div className="flex justify-between text-gray-500">
                <span>{selectedPlan.name} ({cycle})</span>
                <span>{fmt(subtotal)}</span>
              </div>
              {coupon && discount > 0 && (
                <div className="flex justify-between text-green-700 font-medium">
                  <span>Coupon discount ({coupon.code})</span>
                  <span>− {fmt(discount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>{taxLabel} ({taxRate}%)</span>
                  <span>+ {fmt(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200 text-base">
                <span>Total due</span>
                <span>{fmt(total)}</span>
              </div>
              <p className="text-xs text-gray-400 pt-1 leading-relaxed">
                An invoice will be created pending admin payment confirmation. Your plan changes immediately.
              </p>
            </div>
          )}

          {selectedPlan && selectedPlan.price.monthly === 0 && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500 border border-gray-100">
              This plan is <strong className="text-gray-700">free</strong> — no invoice will be created.
              Your plan changes immediately.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant={isDowngrade ? 'outline' : 'primary'}
            className={isDowngrade ? 'border-amber-400 text-amber-700 hover:bg-amber-50' : ''}
            loading={changeMutation.isPending}
            disabled={!selectedPlanId}
            onClick={() => changeMutation.mutate()}
          >
            {isDowngrade ? `Downgrade to ${selectedPlan?.name}` : `Upgrade to ${selectedPlan?.name ?? '—'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Expired / Past-Due Reactivation Banner ────────────────────────────────────

function ReactivateBanner({
  sub,
  plans,
  onReactivated,
}: {
  sub: Subscription;
  plans: Plan[];
  onReactivated: () => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'banner' | 'payment' | 'success'>('banner');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reactivateMutation = useMutation({
    mutationFn: () => api.post('/billing/subscription/reactivate'),
    onSuccess: (res) => {
      if (res.data.data?.requiresPayment && res.data.data?.clientSecret) {
        setClientSecret(res.data.data.clientSecret);
        setStep('payment');
      } else {
        qc.invalidateQueries({ queryKey: ['billing', 'subscription'] });
        qc.invalidateQueries({ queryKey: ['billing', 'invoices'] });
        setStep('success');
      }
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Reactivation failed. Please try again.'),
  });

  const currentPlan = plans.find(p => p._id === sub.planId._id);
  const planName = sub.planId?.name ?? 'your plan';

  if (step === 'success') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-800">Subscription reactivated!</p>
          <p className="text-xs text-green-700 mt-0.5">Your platform is active again.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onReactivated}>View plan</Button>
      </div>
    );
  }

  if (step === 'payment' && clientSecret) {
    const subtotal = currentPlan
      ? (sub.billingCycle === 'yearly' ? currentPlan.price.yearly : currentPlan.price.monthly)
      : 0;
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Complete Payment to Reactivate</h3>
        <Elements
          stripe={getStripePromise()}
          options={{ clientSecret, appearance: { theme: 'stripe' } }}
        >
          <BillingStripeCardForm
            clientSecret={clientSecret}
            planName={planName}
            total={subtotal}
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ['billing', 'subscription'] });
              qc.invalidateQueries({ queryKey: ['billing', 'invoices'] });
              setStep('success');
            }}
            onBack={() => setStep('banner')}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-800">
            {sub.status === 'past_due' ? 'Your subscription is past due' : 'Your subscription has expired'}
          </p>
          <p className="text-xs text-red-700 mt-1 leading-relaxed">
            {sub.status === 'past_due'
              ? <>
                  Your grace period is active.{' '}
                  {sub.gracePeriodEndsAt && (
                    <span className="font-semibold">
                      Access ends {formatDate(sub.gracePeriodEndsAt)}.
                    </span>
                  )}{' '}
                  Reactivate now to avoid losing access.
                </>
              : `Access to ${planName} features has been suspended. Reactivate to restore full platform access.`}
          </p>
          {error && <p className="text-xs text-red-600 mt-2 font-medium">{error}</p>}
        </div>
        <Button
          size="sm"
          loading={reactivateMutation.isPending}
          onClick={() => reactivateMutation.mutate()}
          className="shrink-0 bg-red-600 hover:bg-red-700 text-white border-0"
        >
          Reactivate Now
        </Button>
      </div>
    </div>
  );
}

// ── Current Plan Card ─────────────────────────────────────────────────────────

function CurrentPlanCard({
  sub, plans, onChangePlan,
}: { sub: Subscription; plans: Plan[]; onChangePlan: () => void }) {
  const plan = sub.planId;
  const daysLeft = Math.ceil(
    (new Date(sub.currentPeriodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const portalMutation = useMutation({
    mutationFn: () => api.post('/billing/portal-session'),
    onSuccess: (res) => {
      const url = res.data?.data?.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    },
  });

  // Are there any other plans the tenant could switch to?
  const otherPlans = plans.filter(p => p._id !== plan._id);
  const hasHigherPlan = otherPlans.some(p => p.price.monthly > plan.price.monthly);
  const buttonLabel = hasHigherPlan ? 'Upgrade Plan' : otherPlans.length > 0 ? 'Change Plan' : null;

  return (
    <div className="bg-white rounded-xl border border-primary-100 shadow-sm overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-primary-500 to-primary-600" />
      <div className="p-6">
      {/* Top row */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Current Plan</p>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">{plan.name}</h2>
            {!hasHigherPlan && otherPlans.length === 0 && (
              <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-semibold">
                Highest tier
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 capitalize mt-0.5">{sub.billingCycle} billing</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={STATUS_BADGE[sub.status] ?? 'default'} className="capitalize">
            {sub.status.replace('_', ' ')}
          </Badge>
          {sub.isOnTrial && sub.trialEnd && (
            <span className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">
              Trial ends {formatDate(sub.trialEnd)}
            </span>
          )}
        </div>
      </div>

      {/* Limits grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-4 border-t border-b border-gray-100 mb-4">
        {[
          { label: 'Students',    value: limitLabel(plan.limits.students) },
          { label: 'Instructors', value: limitLabel(plan.limits.instructors) },
          { label: 'Courses',     value: limitLabel(plan.limits.courses) },
          { label: 'Storage',     value: `${plan.limits.storageGB} GB` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-gray-50 rounded-lg px-3 py-2.5">
            <p className="text-xs text-gray-500 mb-0.5">{label}</p>
            <p className="text-sm font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-gray-500">
          <span className="text-gray-400 text-xs">Period</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-medium text-gray-700">{formatDate(sub.currentPeriodStart)}</span>
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <span className={cn('font-medium', daysLeft <= 7 ? 'text-red-600' : 'text-gray-700')}>
              {formatDate(sub.currentPeriodEnd)}
            </span>
            {daysLeft > 0 && daysLeft <= 30 && (
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full ml-1 font-medium',
                daysLeft <= 7 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
              )}>
                {daysLeft}d left
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline"
            loading={portalMutation.isPending}
            onClick={() => portalMutation.mutate()}>
            Manage Card
          </Button>
          {buttonLabel && (
            <Button size="sm" variant={hasHigherPlan ? 'primary' : 'outline'} onClick={onChangePlan}>
              {buttonLabel}
            </Button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function NoSubscriptionCard({ onChangePlan }: { onChangePlan: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <div className="w-14 h-14 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      </div>
      <p className="text-gray-900 font-semibold text-base">No active subscription</p>
      <p className="text-gray-500 text-sm mt-1 mb-5">Choose a plan below to get started.</p>
      <Button onClick={onChangePlan}>Choose a Plan</Button>
    </div>
  );
}

// ── Plans Grid (Lemon Squeezy checkout) ──────────────────────────────────────

function PlanCard({ plan, currentPlan }: { plan: Plan; currentPlan?: Plan }) {
  const [cycle, setCycle]       = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const isCurrent = plan._id === currentPlan?._id;
  const dir       = planDirection(plan, currentPlan);
  const price     = cycle === 'yearly' ? plan.price.yearly : plan.price.monthly;

  async function handleCheckout() {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/billing/ls/checkout', { planSlug: plan.slug, billingCycle: cycle });
      window.location.href = data.data.checkoutUrl;
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Could not open checkout');
      setLoading(false);
    }
  }

  return (
    <div className={cn(
      'bg-white rounded-xl border-2 p-5 relative flex flex-col transition-all',
      isCurrent ? 'border-primary-300 shadow-sm' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
    )}>
      {isCurrent && (
        <span className="absolute top-3 right-3 text-xs bg-primary-100 text-primary-700 px-2.5 py-0.5 rounded-full font-semibold">
          Current
        </span>
      )}

      <h3 className="text-base font-semibold text-gray-900 mb-1">{plan.name}</h3>

      {/* Billing cycle toggle */}
      {!isCurrent && plan.price.monthly > 0 && (
        <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1 w-fit">
          {(['monthly', 'yearly'] as const).map(c => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={cn(
                'text-xs px-3 py-1 rounded-md font-medium transition-all capitalize',
                cycle === c ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {c}
              {c === 'yearly' && <span className="ml-1 text-green-600">-17%</span>}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4">
        {plan.price.monthly === 0 ? (
          <span className="text-3xl font-bold text-gray-900">Free</span>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-gray-900">${price}</span>
            <span className="text-sm text-gray-400">/{cycle === 'yearly' ? 'yr' : 'mo'}</span>
          </div>
        )}
      </div>

      <ul className="space-y-2 mb-5 flex-1">
        {(() => {
          const limitLines = [
            `${limitLabel(plan.limits.students)} students`,
            `${limitLabel(plan.limits.instructors)} instructors`,
            `${limitLabel(plan.limits.courses)} courses`,
            `${plan.limits.storageGB} GB storage`,
          ];
          const seen = new Set(limitLines.map(l => l.toLowerCase()));
          const extraFeatures = plan.features.filter(f => {
            const key = f.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return [...limitLines, ...extraFeatures];
        })().map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
            <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {item}
          </li>
        ))}
      </ul>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      {!isCurrent && plan.price.monthly > 0 && (
        <Button
          onClick={handleCheckout}
          loading={loading}
          className={cn(
            'w-full py-2 text-sm font-semibold',
            dir === 'upgrade'
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'bg-white border-2 border-amber-300 text-amber-700 hover:bg-amber-50'
          )}
        >
          {dir === 'upgrade' ? `↑ Upgrade to ${plan.name}` : `↓ Switch to ${plan.name}`}
        </Button>
      )}
    </div>
  );
}

function PlansGrid({
  plans, currentPlan,
}: { plans: Plan[]; currentPlan?: Plan }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...plans].sort((a, b) => a.price.monthly - b.price.monthly).map(plan => (
        <PlanCard key={plan._id} plan={plan} currentPlan={currentPlan} />
      ))}
    </div>
  );
}

// ── Invoice Table ─────────────────────────────────────────────────────────────

function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(inv: Invoice) {
    setDownloadingId(inv._id);
    try {
      const response = await api.get(`/billing/invoices/${inv._id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${inv.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 py-14 text-center">
        <p className="text-gray-400 text-3xl mb-2">🧾</p>
        <p className="text-gray-500 text-sm">No invoices yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Description</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Amount</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
            <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
            <th className="px-5 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {invoices.map(inv => (
            <tr key={inv._id} className="hover:bg-gray-50 transition-colors">
              <td className="px-5 py-3.5 font-mono text-xs text-gray-600">{inv.invoiceNumber}</td>
              <td className="px-5 py-3.5 text-gray-600 text-xs max-w-[220px] truncate">
                {inv.description || `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}`}
              </td>
              <td className="px-5 py-3.5 font-semibold text-gray-900">
                {fmt(inv.total, inv.currency)}
                {inv.discountAmount > 0 && (
                  <span className="ml-1.5 text-xs text-green-600 font-normal">(-{fmt(inv.discountAmount, inv.currency)})</span>
                )}
                {inv.taxAmount && inv.taxAmount > 0 ? (
                  <span className="ml-1.5 text-xs text-gray-400 font-normal">+{fmt(inv.taxAmount)} {inv.taxLabel || 'tax'}</span>
                ) : null}
              </td>
              <td className="px-5 py-3.5">
                <Badge variant={INVOICE_BADGE[inv.status] ?? 'default'} className="capitalize">
                  {inv.status}
                </Badge>
              </td>
              <td className="px-5 py-3.5 text-gray-400 text-xs">
                {inv.paidAt ? formatDate(inv.paidAt) : formatDate(inv.dueDate)}
              </td>
              <td className="px-5 py-3.5 text-right">
                <Button
                  size="sm" variant="outline"
                  loading={downloadingId === inv._id}
                  onClick={() => handleDownload(inv)}
                >
                  PDF
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Saved Payment Methods ─────────────────────────────────────────────────────

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

const BRAND_LABEL: Record<string, string> = {
  visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex',
  discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay',
};

function SavedPaymentMethodsCard() {
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ paymentMethods: PaymentMethod[] }>({
    queryKey: ['billing', 'payment-methods'],
    queryFn: async () => {
      const { data } = await api.get('/billing/payment-methods');
      return data.data;
    },
  });

  const methods = data?.paymentMethods ?? [];

  async function handleDelete(pmId: string) {
    setDeletingId(pmId);
    try {
      await api.delete(`/billing/payment-methods/${pmId}`);
      qc.invalidateQueries({ queryKey: ['billing', 'payment-methods'] });
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) return null;
  if (methods.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Saved Payment Methods</h3>
      <ul className="divide-y divide-gray-100">
        {methods.map(pm => (
          <li key={pm.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-7 bg-gray-100 rounded flex items-center justify-center shrink-0">
                <svg className="w-5 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {BRAND_LABEL[pm.brand] ?? pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)} ···· {pm.last4}
                </p>
                <p className="text-xs text-gray-400">
                  Expires {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}
                </p>
              </div>
            </div>
            <Button
              size="sm" variant="outline"
              loading={deletingId === pm.id}
              onClick={() => handleDelete(pm.id)}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 shrink-0"
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
        Cards are saved automatically after payment and can be reused on your next upgrade.
      </p>
    </div>
  );
}

// ── Cloudflare Stream Usage ───────────────────────────────────────────────────

interface CfStreamStatus {
  connected: boolean;
  planAllows: boolean;
  storage: { used: number; limit: number; topup: number };
  viewer:  { used: number; limit: number; topup: number };
}

function streamPct(used: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, Math.round((used / cap) * 100));
}

function streamBarColor(p: number): string {
  if (p >= 100) return 'bg-red-500';
  if (p >= 80) return 'bg-yellow-400';
  return 'bg-orange-500';
}

function StreamUsageBar({ label, used, cap, unit }: { label: string; used: number; cap: number; unit: string }) {
  const p = streamPct(used, cap);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className={cn('text-xs font-medium', p >= 100 ? 'text-red-600' : p >= 80 ? 'text-yellow-600' : 'text-gray-500')}>
          {used.toFixed(1)} / {cap} {unit}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-300', streamBarColor(p))} style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

function StreamUsageCard() {
  const [buying, setBuying] = useState<'storage_500' | 'viewer_5000' | null>(null);
  const [error, setError] = useState('');

  const { data } = useQuery<CfStreamStatus>({
    queryKey: ['cf-stream-status'],
    queryFn: () => api.get('/tenant/cloudflare-stream/status').then(r => r.data.data),
    staleTime: 60_000,
  });

  async function buyTopup(topupType: 'storage_500' | 'viewer_5000') {
    setError('');
    setBuying(topupType);
    try {
      const { data } = await api.post('/billing/ls/checkout-topup', { topupType });
      window.location.href = data.data.checkoutUrl;
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Could not open checkout');
      setBuying(null);
    }
  }

  if (!data?.connected) return null; // platform hasn't configured Cloudflare Stream yet

  if (!data.planAllows) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">🔒 Cloudflare Stream video</h3>
          <p className="text-xs text-gray-500 mt-0.5">Available on Basic &amp; Pro — adaptive HLS streaming, no file size limit.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <h3 className="text-sm font-semibold text-gray-900">Cloudflare Stream Video Usage</h3>

      <div className="space-y-4">
        <StreamUsageBar label="Storage" used={data.storage.used} cap={data.storage.limit + data.storage.topup} unit="min" />
        <StreamUsageBar label="Viewer minutes (this cycle)" used={data.viewer.used} cap={data.viewer.limit + data.viewer.topup} unit="min" />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={() => buyTopup('storage_500')} loading={buying === 'storage_500'}
          className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:border-orange-300 hover:text-orange-700">
          +500 storage-min — $7
        </Button>
        <Button onClick={() => buyTopup('viewer_5000')} loading={buying === 'viewer_5000'}
          className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:border-orange-300 hover:text-orange-700">
          +5,000 viewer-min — $12
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [showModal, setShowModal] = useState(false);
  const [preselectedPlanId, setPreselectedPlanId] = useState<string | undefined>();
  const [lsSuccess, setLsSuccess] = useState(false);
  const qcPage = useQueryClient();

  // Detect return from Lemon Squeezy checkout
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('ls_success') === '1') {
      setLsSuccess(true);
      window.history.replaceState({}, '', '/billing');
      qcPage.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      qcPage.invalidateQueries({ queryKey: ['billing', 'invoices'] });
      qcPage.invalidateQueries({ queryKey: ['cf-stream-status'] });
    }
  }, [qcPage]);

  // Real-time billing refresh — invalidate queries when server pushes billing:updated
  useEffect(() => {
    const socket = connectSocket();
    function onBillingUpdated() {
      qcPage.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      qcPage.invalidateQueries({ queryKey: ['billing', 'invoices'] });
      qcPage.invalidateQueries({ queryKey: ['billing', 'payment-methods'] });
    }
    socket.on('billing:updated', onBillingUpdated);
    return () => {
      socket.off('billing:updated', onBillingUpdated);
      // Not disconnectSocket() — this is the one shared app-wide socket
      // (notifications, sidebar unread badges, chat, etc.), so tearing it
      // down when this component unmounts would break those elsewhere.
    };
  }, [qcPage]);

  function openModal(planId?: string) {
    setPreselectedPlanId(planId);
    setShowModal(true);
  }

  const { data: sub, isLoading: subLoading } = useQuery<Subscription | null>({
    queryKey: ['billing', 'subscription'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/billing/subscription');
        return data.data.subscription;
      } catch (err: unknown) {
        if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
        throw err;
      }
    },
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ['billing', 'plans'],
    queryFn: async () => {
      const { data } = await api.get('/billing/plans');
      return data.data.plans ?? [];
    },
  });

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ['billing', 'invoices'],
    queryFn: async () => {
      const { data } = await api.get('/billing/invoices');
      return data.data;
    },
  });

  if (subLoading || plansLoading || invoicesLoading) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your plan, apply coupons, and view invoices.</p>
      </div>

      {/* Lemon Squeezy payment success banner */}
      {lsSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <span className="text-green-500 text-xl">✓</span>
          <div>
            <p className="font-semibold text-green-800 text-sm">Payment successful!</p>
            <p className="text-green-700 text-xs mt-0.5">
              Your subscription has been activated. It may take a few seconds to reflect below.
            </p>
          </div>
          <button onClick={() => setLsSuccess(false)} className="ml-auto text-green-400 hover:text-green-600 text-lg leading-none">×</button>
        </div>
      )}

      {/* Expired / past-due reactivation banner */}
      {sub && (sub.status === 'expired' || sub.status === 'past_due') && (
        <ReactivateBanner
          sub={sub}
          plans={plans}
          onReactivated={() => {
            qcPage.invalidateQueries({ queryKey: ['billing', 'subscription'] });
          }}
        />
      )}

      {/* Current subscription */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Subscription</h2>
        {sub
          ? <CurrentPlanCard sub={sub} plans={plans} onChangePlan={() => openModal()} />
          : <NoSubscriptionCard onChangePlan={() => openModal()} />
        }
      </section>

      {/* Available plans */}
      {plans.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Available Plans</h2>
          <PlansGrid
            plans={plans}
            currentPlan={sub?.planId}
          />
        </section>
      )}

      {/* Cloudflare Stream video usage + top-ups */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Video Streaming</h2>
        <StreamUsageCard />
      </section>

      {/* Saved payment methods */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Payment Methods</h2>
        <SavedPaymentMethodsCard />
      </section>

      {/* Invoice history */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Invoice History</h2>
        <InvoiceTable invoices={invoiceData?.invoices ?? []} />
      </section>

      {/* Modal */}
      {showModal && (
        <ChangePlanModal
          plans={plans}
          currentPlan={sub?.planId}
          currentCycle={sub?.billingCycle}
          preselectedPlanId={preselectedPlanId}
          onClose={() => { setShowModal(false); setPreselectedPlanId(undefined); }}
        />
      )}
    </div>
  );
}
