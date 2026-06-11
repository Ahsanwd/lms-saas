'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import api from '@/lib/api';
import { Button, Badge, Spinner, Alert } from '@/components/ui';
import { getStripePromise } from '@/lib/stripe';
import { formatDate } from '@/lib/utils';
import { AxiosError } from 'axios';

interface MembershipPlan {
  _id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  courseAccess: 'all' | 'selected';
  features: string[];
  trialDays: number;
  isActive: boolean;
}

interface MembershipSubscription {
  _id: string;
  planId: { _id: string; name: string; monthlyPrice: number; yearlyPrice: number };
  status: 'trial' | 'active' | 'cancelled' | 'expired';
  billingCycle: 'monthly' | 'yearly';
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  autoRenew: boolean;
}

// ── Card form (Stripe) ────────────────────────────────────────────────────────
function MembershipCardForm({
  subscriptionId, clientSecret, amount, onSuccess,
}: {
  subscriptionId: string | null;
  clientSecret: string | null;
  amount: number;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cardName, setCardName] = useState('');

  async function handlePay() {
    if (!subscriptionId) return;
    setError(''); setLoading(true);

    // Mock mode
    if (!stripe || !elements || !clientSecret) {
      try {
        await api.post(`/membership/${subscriptionId}/confirm`);
        onSuccess();
      } catch (e: unknown) {
        setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Payment failed');
      } finally { setLoading(false); }
      return;
    }

    const cardEl = elements.getElement(CardElement);
    if (!cardEl) { setLoading(false); return; }

    const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardEl, billing_details: { name: cardName } },
    });

    if (stripeErr) { setError(stripeErr.message ?? 'Card payment failed'); setLoading(false); return; }

    if (paymentIntent?.status === 'succeeded') {
      try {
        await api.post(`/membership/${subscriptionId}/confirm`);
        onSuccess();
      } catch (e: unknown) {
        setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Activation failed');
      }
    }
    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Cardholder name</label>
        <input value={cardName} onChange={e => setCardName(e.target.value)} placeholder="Jane Smith"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-400" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Card details</label>
        <div className="px-3 py-2.5 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-primary-400">
          <CardElement options={{ style: { base: { fontSize: '14px', color: '#111827', '::placeholder': { color: '#9ca3af' } }, invalid: { color: '#ef4444' } }, hidePostalCode: true }} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2 text-xs text-gray-400 border-t border-gray-100 pt-3">
        <svg className="w-4 h-4 flex-shrink-0 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/>
        </svg>
        Secured by Stripe · 256-bit SSL encryption
      </div>
      <Button className="w-full" loading={loading} disabled={!cardName.trim()} onClick={handlePay}>
        Pay ${amount.toFixed(2)}
      </Button>
    </div>
  );
}

// ── Subscribe modal ───────────────────────────────────────────────────────────
function SubscribeModal({
  plan, onClose, onSuccess,
}: {
  plan: MembershipPlan;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [step, setStep] = useState<'confirm' | 'pay' | 'done'>('confirm');
  const [subId, setSubId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState('');

  const price = cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  const saving = plan.monthlyPrice > 0
    ? Math.round((1 - plan.yearlyPrice / (plan.monthlyPrice * 12)) * 100)
    : 0;

  const initMut = useMutation({
    mutationFn: () => api.post('/membership/initiate', { planId: plan._id, billingCycle: cycle }),
    onSuccess: (res) => {
      const d = res.data.data;
      if (d.free) { onSuccess(); return; }
      setSubId(d.subscriptionId);
      setClientSecret(d.clientSecret ?? null);
      setStep('pay');
    },
    onError: (err: AxiosError<{ message: string }>) =>
      setError(err.response?.data?.message ?? 'Failed to initiate'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">

        {step === 'done' && (
          <>
            <div className="flex flex-col items-center py-4 space-y-3">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900">Membership activated!</p>
              <p className="text-sm text-gray-500 text-center">You now have access to {plan.courseAccess === 'all' ? 'all courses' : 'selected courses'} under the {plan.name} plan.</p>
            </div>
            <Button className="w-full" onClick={() => { onSuccess(); onClose(); }}>Start Learning</Button>
          </>
        )}

        {step === 'confirm' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Subscribe — {plan.name}</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Billing cycle toggle */}
            <div className="flex gap-3">
              {(['monthly', 'yearly'] as const).map(c => (
                <button key={c} onClick={() => setCycle(c)}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                    cycle === c ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'
                  }`}>
                  {c === 'yearly' && saving > 0 ? `Yearly (save ${saving}%)` : c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>

            {/* Price */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">{plan.name}</span>
              <span className="text-lg font-bold text-gray-900">${price.toFixed(2)}<span className="text-sm font-normal text-gray-400">/{cycle === 'yearly' ? 'yr' : 'mo'}</span></span>
            </div>

            {plan.trialDays > 0 && (
              <p className="text-xs text-green-600 font-medium bg-green-50 rounded-lg px-3 py-2">
                {plan.trialDays} day free trial — you won't be charged until the trial ends.
              </p>
            )}

            {error && <Alert variant="error">{error}</Alert>}

            <Button className="w-full" loading={initMut.isPending} onClick={() => initMut.mutate()}>
              {price === 0 ? 'Subscribe Free' : `Continue to Payment`}
            </Button>
            <button onClick={onClose} className="w-full text-sm text-gray-400 hover:text-gray-600">Cancel</button>
          </>
        )}

        {step === 'pay' && (
          <>
            <div className="flex items-center gap-3">
              <button onClick={() => setStep('confirm')} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
              </button>
              <h2 className="text-lg font-semibold text-gray-900 flex-1">Card Payment</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">{plan.name} · {cycle}</span>
              <span className="text-base font-bold text-gray-900">${price.toFixed(2)}</span>
            </div>
            <Elements stripe={getStripePromise()}>
              <MembershipCardForm
                subscriptionId={subId}
                clientSecret={clientSecret}
                amount={price}
                onSuccess={() => setStep('done')}
              />
            </Elements>
          </>
        )}
      </div>
    </div>
  );
}

// ── My Subscription card ──────────────────────────────────────────────────────
function MySubscriptionCard({ sub, onCancelled }: { sub: MembershipSubscription; onCancelled: () => void }) {
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');

  const cancelMut = useMutation({
    mutationFn: () => api.post('/membership/cancel', { reason }),
    onSuccess: () => { setShowCancel(false); onCancelled(); },
  });

  const statusColor = sub.status === 'active' ? 'success' : sub.status === 'trial' ? 'warning' : 'default';
  const daysLeft = Math.max(0, Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86400000));

  return (
    <div className="bg-white rounded-2xl border-2 border-primary-200 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Your Active Membership</p>
          <h2 className="text-xl font-bold text-gray-900 mt-0.5">{sub.planId.name}</h2>
        </div>
        <Badge variant={statusColor}>{sub.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400">Billing Cycle</p>
          <p className="text-sm font-semibold text-gray-900 capitalize mt-0.5">{sub.billingCycle}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400">Renews / Expires</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatDate(sub.currentPeriodEnd)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400">Days Remaining</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{daysLeft} days</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-400">Price</p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">
            ${sub.billingCycle === 'yearly' ? sub.planId.yearlyPrice : sub.planId.monthlyPrice}/{sub.billingCycle === 'yearly' ? 'yr' : 'mo'}
          </p>
        </div>
      </div>

      {!showCancel ? (
        <button onClick={() => setShowCancel(true)}
          className="text-sm text-red-500 hover:text-red-700 font-medium">
          Cancel membership
        </button>
      ) : (
        <div className="border border-red-200 bg-red-50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-red-700">Cancel membership?</p>
          <p className="text-xs text-red-500">You'll keep access until {formatDate(sub.currentPeriodEnd)}.</p>
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Optional: reason for cancelling"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 resize-none bg-white" />
          <div className="flex gap-2">
            <button onClick={() => setShowCancel(false)}
              className="flex-1 py-2 text-sm font-medium text-gray-600 hover:bg-white rounded-lg transition-colors border border-red-200">
              Keep membership
            </button>
            <Button variant="danger" className="flex-1" loading={cancelMut.isPending}
              onClick={() => cancelMut.mutate()}>
              Cancel now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, cycle, hasSubscription, onSubscribe }: {
  plan: MembershipPlan;
  cycle: 'monthly' | 'yearly';
  hasSubscription: boolean;
  onSubscribe: (plan: MembershipPlan) => void;
}) {
  const price = cycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-200 hover:border-primary-300 transition-all flex flex-col">
      <div className="px-6 pt-6 pb-4 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
        {plan.description && <p className="text-sm text-gray-400 mt-1">{plan.description}</p>}
        <div className="mt-4">
          <span className="text-3xl font-bold text-gray-900">${price.toFixed(2)}</span>
          <span className="text-sm text-gray-400 ml-1">/{cycle === 'yearly' ? 'year' : 'month'}</span>
        </div>
        {plan.trialDays > 0 && (
          <p className="text-xs text-green-600 font-medium mt-2">{plan.trialDays} day free trial</p>
        )}
      </div>
      <div className="px-6 py-4 flex-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {plan.courseAccess === 'all' ? 'Access to all courses' : 'Selected courses'}
        </p>
        <ul className="space-y-2">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
              </svg>
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="px-6 pb-6">
        <Button className="w-full" disabled={hasSubscription} onClick={() => onSubscribe(plan)}>
          {hasSubscription ? 'Already subscribed' : price === 0 ? 'Subscribe Free' : 'Subscribe'}
        </Button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MembershipPage() {
  const qc = useQueryClient();
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [subscribingTo, setSubscribingTo] = useState<MembershipPlan | null>(null);

  const { data: plans = [], isLoading: plansLoading } = useQuery<MembershipPlan[]>({
    queryKey: ['membership-plans-student'],
    queryFn: async () => {
      const { data } = await api.get('/membership/plans');
      return data.data.plans;
    },
  });

  const { data: mySub, isLoading: subLoading } = useQuery<MembershipSubscription | null>({
    queryKey: ['my-membership'],
    queryFn: async () => {
      const { data } = await api.get('/membership/my');
      return data.data.subscription;
    },
  });

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ['my-membership'] });
    qc.invalidateQueries({ queryKey: ['membership-plans-student'] });
  };

  if (plansLoading || subLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  const hasActiveSub = !!mySub && (mySub.status === 'active' || mySub.status === 'trial');

  // Yearly savings % across plans for the toggle label
  const avgSaving = plans.length > 0 && plans[0].monthlyPrice > 0
    ? Math.round((1 - plans[0].yearlyPrice / (plans[0].monthlyPrice * 12)) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">Membership Plans</h1>
        <p className="text-gray-500 mt-1">Subscribe once, access courses anytime.</p>
      </div>

      {/* My subscription */}
      {mySub && (
        <MySubscriptionCard sub={mySub} onCancelled={refetch} />
      )}

      {/* Billing cycle toggle */}
      {!hasActiveSub && plans.length > 0 && (
        <div className="flex justify-center">
          <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
            {(['monthly', 'yearly'] as const).map(c => (
              <button key={c} onClick={() => setCycle(c)}
                className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  cycle === c ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {c === 'yearly' && avgSaving > 0 ? `Yearly · Save ${avgSaving}%` : c.charAt(0).toUpperCase() + c.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plans grid */}
      {plans.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-500">No membership plans available yet.</p>
        </div>
      ) : (
        <div className={`grid gap-6 ${plans.length === 1 ? 'max-w-sm mx-auto' : plans.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-2xl mx-auto' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'}`}>
          {plans.map(plan => (
            <PlanCard key={plan._id} plan={plan} cycle={cycle}
              hasSubscription={hasActiveSub}
              onSubscribe={setSubscribingTo} />
          ))}
        </div>
      )}

      {/* Subscribe modal */}
      {subscribingTo && (
        <SubscribeModal
          plan={subscribingTo}
          onClose={() => setSubscribingTo(null)}
          onSuccess={() => { refetch(); setSubscribingTo(null); }}
        />
      )}
    </div>
  );
}
