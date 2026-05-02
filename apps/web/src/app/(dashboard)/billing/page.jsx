'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import {
  CalendarDays, TrendingUp,
  AlertTriangle, CheckCircle2, Clock, Ban,
  ArrowRight, Mail, Calculator, Download, Loader2, Receipt, ExternalLink,
} from 'lucide-react';
import { schoolsApi, studentsApi, exportApi, downloadBlob, subscriptionsApi } from '@/lib/api';
import { FEATURE_ADDONS, FEATURE_ADDON_PRICING } from '@/lib/constants';
import { useAuthStore } from '@/store/auth.store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// ── Only these roles can access billing ─────────────────────────────────────
const BILLING_ROLES = ['school_admin', 'director', 'headteacher'];

// ── Pricing constants ────────────────────────────────────────────────────────
const BASE_FEE = 8500;
const PER_STUDENT = 40;
const VAT = 0.16;
const fmt = (n) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

const ADD_ON_OPTIONS = [
  { key: FEATURE_ADDONS.TRANSPORT, label: 'Transport', price: FEATURE_ADDON_PRICING[FEATURE_ADDONS.TRANSPORT] },
  { key: FEATURE_ADDONS.SMS, label: 'Bulk SMS', price: FEATURE_ADDON_PRICING[FEATURE_ADDONS.SMS] },
];

function calcBill(students, option = 'per-term', addOns = {}) {
  const addOnsPerTerm = ADD_ON_OPTIONS.reduce(
    (sum, item) => sum + (addOns?.[item.key] ? item.price : 0),
    0
  );
  const subtotal = BASE_FEE + students * PER_STUDENT + addOnsPerTerm;
  const multiplier = option === 'annual' ? 2.55 : option === 'multi-year' ? 2.40 : 1;
  const base = subtotal * multiplier;
  const vat = Math.round(base * VAT);
  return { subtotal, base, vat, total: base + vat, multiplier, addOnsPerTerm };
}

// ── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  trial: {
    label: 'Trial',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Clock,
    desc: 'You are on a free trial. All features enabled.',
  },
  active: {
    label: 'Active',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
    desc: 'Subscription active. Full access enabled.',
  },
  suspended: {
    label: 'Suspended',
    color: 'bg-red-50 text-red-700 border-red-200',
    icon: Ban,
    desc: 'Account suspended. Contact support to restore access.',
  },
  expired: {
    label: 'Expired',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: AlertTriangle,
    desc: 'Trial or subscription has expired.',
  },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.trial;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border', cfg.color)}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

// ── Mini Calculator ──────────────────────────────────────────────────────────
function BillingCalculator({ currentStudents, addOns, setAddOns }) {
  const [students, setStudents] = useState(currentStudents || 100);
  const [option, setOption] = useState('per-term');

  const p = calcBill(students, option, addOns);
  const perTermTotal = calcBill(students, 'per-term', addOns).total;
  const saving = option === 'annual' ? Math.round(perTermTotal * 3 - p.total) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Calculator className="h-4 w-4 text-blue-600" />
          Estimate Your Next Invoice
        </CardTitle>
        <CardDescription>Adjust students or billing cycle to see what you'd pay</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Student count */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Students</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setStudents(Math.max(10, students - 10))} className="w-6 h-6 rounded border text-sm flex items-center justify-center hover:bg-muted transition-colors">−</button>
              <input
                type="number" min={10} max={5000} value={students}
                onChange={(e) => setStudents(Math.max(10, Math.min(5000, parseInt(e.target.value) || 10)))}
                className="w-20 text-center border rounded-md text-sm font-bold h-8 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button onClick={() => setStudents(Math.min(5000, students + 10))} className="w-6 h-6 rounded border text-sm flex items-center justify-center hover:bg-muted transition-colors">+</button>
            </div>
          </div>
          <input type="range" min={10} max={2000} step={10} value={Math.min(students, 2000)}
            onChange={(e) => setStudents(parseInt(e.target.value))}
            className="w-full accent-blue-600 cursor-pointer"
          />
        </div>

        {/* Billing cycle */}
        <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-lg">
          {[
            { id: 'per-term', label: 'Per Term' },
            { id: 'annual', label: 'Annual −15%' },
            { id: 'multi-year', label: '3-Year −20%' },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setOption(tab.id)}
              className={cn(
                'py-1.5 px-2 rounded-md text-xs font-semibold transition-all',
                option === tab.id ? 'bg-white shadow-sm text-slate-900' : 'text-muted-foreground hover:text-slate-700',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Add-ons */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Optional Add-ons (per term)</label>
          <div className="grid gap-2">
            {ADD_ON_OPTIONS.map((addOn) => (
              <label key={addOn.key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{addOn.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">{fmt(addOn.price)}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(addOns?.[addOn.key])}
                    onChange={(e) => setAddOns((prev) => ({ ...prev, [addOn.key]: e.target.checked }))}
                  />
                </span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bulk SMS billing is ready here; message delivery feature rollout can be activated later.
          </p>
        </div>

        {/* Breakdown */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Base fee</span><span className="font-mono">KES 8,500</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{students.toLocaleString()} × KES 40</span>
            <span className="font-mono">{fmt(students * PER_STUDENT)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Add-ons total</span>
            <span className="font-mono">{fmt(p.addOnsPerTerm)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground text-xs pt-1 border-t">
            <span>Subtotal (ex-VAT)</span>
            <span className="font-mono">{fmt(p.subtotal * (option !== 'per-term' ? p.multiplier : 1))}</span>
          </div>
          <div className="flex justify-between text-muted-foreground text-xs">
            <span>VAT (16%)</span><span className="font-mono">{fmt(p.vat)}</span>
          </div>
          <div className="flex justify-between font-bold text-base pt-2 border-t">
            <span>{option === 'per-term' ? 'Per term' : option === 'annual' ? 'Annual total' : '3-year annual'}</span>
            <span className="font-mono text-blue-600">{fmt(p.total)}</span>
          </div>
          {saving && (
            <p className="text-xs text-emerald-600 font-medium text-right">You save {fmt(saving)} per year</p>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Cost per student: <span className="font-semibold text-foreground">{fmt(p.subtotal / students)}/term</span>
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/pricing" target="_blank">Full pricing guide <ArrowRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Invoice schedule ─────────────────────────────────────────────────────────
const INVOICE_SCHEDULE = [
  { term: 'Term 1', issued: 'Late December', due: 'January 6' },
  { term: 'Term 2', issued: 'Mid April', due: 'April 28' },
  { term: 'Term 3', issued: 'Mid August', due: 'September 1' },
];

const PAYMENT_STATUS_CONFIG = {
  pending:    { label: 'Pending',    color: 'bg-amber-50 text-amber-700 border-amber-200' },
  processing: { label: 'Processing', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed:  { label: 'Paid',       color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed:     { label: 'Failed',     color: 'bg-red-50 text-red-700 border-red-200' },
  cancelled:  { label: 'Cancelled',  color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function PaymentHistory() {
  const { data, isLoading } = useQuery({
    queryKey: ['billing', 'payments'],
    queryFn: async () => {
      const res = await subscriptionsApi.listPayments({ limit: 20 });
      return res.data?.payments ?? res.data?.data?.payments ?? [];
    },
  });

  const payments = data ?? [];
  const fmtDate = (d) => new Date(d).toLocaleDateString('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const fmtCycle = (c) => ({ 'per-term': 'Per Term', annual: 'Annual', 'multi-year': '3-Year' }[c] ?? c);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4 text-blue-600" />
          Payment History
        </CardTitle>
        <CardDescription>All subscription payments made for this school.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between items-center py-3 border-b last:border-0">
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-40 rounded-full" />
                  <Skeleton className="h-3 w-24 rounded-full" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No subscription payments found.</p>
        ) : (
          <div className="space-y-0">
            {payments.map((p) => {
              const cfg = PAYMENT_STATUS_CONFIG[p.status] ?? PAYMENT_STATUS_CONFIG.pending;
              const addOnsList = Object.entries(p.addOns ?? {})
                .filter(([, v]) => v)
                .map(([k]) => ({ transport: 'Transport', sms: 'Bulk SMS' }[k] ?? k));
              return (
                <div key={p._id} className="py-3 border-b last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border', cfg.color)}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground">{fmtCycle(p.billingCycle)}</span>
                        {p.studentCount && (
                          <span className="text-xs text-muted-foreground">· {p.studentCount} students</span>
                        )}
                        {addOnsList.length > 0 && (
                          <span className="text-xs text-muted-foreground">· {addOnsList.join(', ')}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="text-sm font-semibold">{fmt(p.amount)} {p.currency ?? 'KES'}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(p.createdAt)}</p>
                        {p.initiatedByUserId && (
                          <p className="text-xs text-muted-foreground">
                            by {p.initiatedByUserId.firstName} {p.initiatedByUserId.lastName}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                        {p.merchantReference}
                      </p>
                    </div>
                    {p.status === 'completed' && (
                      <Link
                        href={`/billing/invoice/${p.merchantReference}`}
                        className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Invoice <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [statusToastShown, setStatusToastShown] = useState(false);
  const [addOns, setAddOns] = useState({
    [FEATURE_ADDONS.TRANSPORT]: false,
    [FEATURE_ADDONS.SMS]: false,
  });

  if (!BILLING_ROLES.includes(user?.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
        <Ban className="h-10 w-10 text-muted-foreground" />
        <p className="font-semibold text-lg">Access Restricted</p>
        <p className="text-muted-foreground text-sm max-w-xs">Billing information is only available to the school admin, director, or headteacher.</p>
      </div>
    );
  }

  const { data: schoolData, isLoading: schoolLoading } = useQuery({
    queryKey: ['school', 'me'],
    queryFn: async () => { const r = await schoolsApi.me(); return r.data?.school ?? r.data?.data; },
  });

  const { data: studentsData } = useQuery({
    queryKey: ['students', 'count'],
    queryFn: async () => { const r = await studentsApi.list({ limit: 1, status: 'active' }); return r.data; },
  });

  const school = schoolData;
  const studentCount = studentsData?.meta?.total ?? studentsData?.pagination?.total ?? 0;
  const status = school?.subscriptionStatus ?? 'trial';
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.trial;
  const trialExpiry = school?.trialExpiry ? new Date(school.trialExpiry) : null;
  const daysLeft = trialExpiry ? differenceInDays(trialExpiry, new Date()) : null;
  const planTier = school?.planTier ?? 'trial';

  const bill = studentCount > 0 ? calcBill(studentCount, 'per-term', addOns) : null;
  const merchantReference = useMemo(
    () => searchParams.get('reference') || searchParams.get('merchantReference'),
    [searchParams]
  );

  const createCheckout = useMutation({
    mutationFn: async () => {
      const response = await subscriptionsApi.createCheckout({
        billingCycle: 'per-term',
        studentCount: Math.max(studentCount || 0, 1),
        planTier: planTier === 'trial' ? 'standard' : planTier,
        addOns,
      });
      return response.data?.checkout ?? response.data?.data?.checkout;
    },
    onSuccess: (checkout) => {
      if (!checkout?.redirectUrl) {
        toast.error('Checkout URL was not returned. Please try again.');
        return;
      }
      window.location.assign(checkout.redirectUrl);
    },
    onError: (error) => {
      const message = error?.response?.data?.message || 'Unable to start checkout. Please try again.';
      toast.error(message);
    },
  });

  const { data: paymentStatusData, isFetching: paymentStatusLoading } = useQuery({
    queryKey: ['billing', 'paystack-status', merchantReference],
    enabled: Boolean(merchantReference),
    queryFn: async () => {
      const response = await subscriptionsApi.getStatus(merchantReference);
      return response.data?.payment ?? response.data?.data?.payment;
    },
  });

  useEffect(() => {
    if (statusToastShown || !paymentStatusData) return;
    setStatusToastShown(true);
    if (paymentStatusData.status === 'completed') {
      toast.success('Subscription payment confirmed successfully.');
      queryClient.invalidateQueries({ queryKey: ['school', 'me'] });
      return;
    }
    if (paymentStatusData.status === 'failed' || paymentStatusData.status === 'cancelled') {
      toast.error('Payment was not completed. Please try again.');
      return;
    }
    toast.message('Payment is still processing. We will refresh status automatically.');
  }, [paymentStatusData, queryClient, statusToastShown]);

  if (schoolLoading) {
    return (
      <div>
        <PageHeader title="Billing & Subscription" description="Manage your DiraSchool subscription" />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 mt-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 space-y-3">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-7 w-32 rounded-full" />
              <Skeleton className="h-3 w-48 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Subscription"
        description="View your plan, estimate invoices, and manage your DiraSchool subscription"
      />

      {/* ── Status + expiry alert ─────────────────────────────────────────── */}
      {status === 'trial' && daysLeft !== null && daysLeft <= 14 && (
        <div className={cn(
          'flex items-start gap-3 rounded-xl px-4 py-3.5 border text-sm font-medium',
          daysLeft <= 3 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800',
        )}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">
              {daysLeft <= 0 ? 'Trial expired' : `Trial expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}
            </span>
            <span className="ml-1 font-normal opacity-80">— contact us to activate your subscription and avoid interruption.</span>
          </div>
          <Button asChild size="sm" variant="outline" className="ml-auto shrink-0 border-amber-300 hover:bg-amber-100">
            <a href="mailto:contact@diraschool.com">Contact billing</a>
          </Button>
        </div>
      )}

      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Status */}
        <Card>
          <CardContent className="p-5 space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Status</p>
            <StatusBadge status={status} />
            <p className="text-xs text-muted-foreground">{statusCfg.desc}</p>
          </CardContent>
        </Card>

        {/* Plan tier */}
        <Card>
          <CardContent className="p-5 space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Plan</p>
            <p className="text-2xl font-bold capitalize">{planTier === 'trial' ? 'Free Trial' : planTier}</p>
            <p className="text-xs text-muted-foreground">Base + selected add-ons</p>
          </CardContent>
        </Card>

        {/* Trial / next invoice */}
        <Card>
          <CardContent className="p-5 space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              {status === 'trial' ? 'Trial Expires' : 'Billing Cycle'}
            </p>
            {status === 'trial' && trialExpiry ? (
              <>
                <p className="text-2xl font-bold">{format(trialExpiry, 'dd MMM yyyy')}</p>
                <p className="text-xs text-muted-foreground">{daysLeft > 0 ? `${daysLeft} days remaining` : 'Expired'}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold">Per-Term</p>
                <p className="text-xs text-muted-foreground">3 invoices per year</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Estimated cost */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-5 space-y-2">
            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Est. Per Term</p>
            {bill ? (
              <>
                <p className="text-2xl font-bold text-blue-700">{fmt(bill.total)}</p>
                <p className="text-xs text-blue-600/70">inc. VAT · {studentCount} students</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Enroll students to see estimate</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Main content grid ─────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <BillingCalculator currentStudents={studentCount || 100} addOns={addOns} setAddOns={setAddOns} />

        {/* Billing schedule + contact */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-blue-600" />
                Invoice Schedule
              </CardTitle>
              <CardDescription>Invoices are sent 2 weeks before each term starts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {INVOICE_SCHEDULE.map((s) => (
                  <div key={s.term} className="flex items-center justify-between py-2.5 border-b last:border-0">
                    <div>
                      <p className="text-sm font-semibold">{s.term}</p>
                      <p className="text-xs text-muted-foreground">Issued: {s.issued}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Due</p>
                      <p className="text-sm font-medium">{s.due}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t leading-relaxed">
                Billing aligns with school fee collection — you receive our invoice when you're about to collect from parents.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-0 text-white">
            <CardContent className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-400" />
                <p className="font-semibold">Need to upgrade or have questions?</p>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                Contact our billing team to activate a subscription, discuss annual discounts, or request a custom enterprise quote.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Button asChild className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0">
                  <a href="mailto:contact@diraschool.com">Email billing team</a>
                </Button>
                <Button
                  type="button"
                  onClick={() => createCheckout.mutate()}
                  disabled={createCheckout.isPending || studentCount < 1}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white border-0"
                >
                  {createCheckout.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting checkout…
                    </>
                  ) : (
                    'Proceed to Checkout'
                  )}
                </Button>
                <Button asChild variant="outline" className="border-white/20 text-white hover:bg-white/10 bg-transparent">
                  <Link href="/pricing" target="_blank">View pricing page</Link>
                </Button>
              </div>
              {(merchantReference || paymentStatusLoading) && (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-slate-300">
                    {paymentStatusLoading
                      ? 'Checking payment status...'
                      : `Payment reference: ${merchantReference}`}
                  </p>
                  {!paymentStatusLoading && merchantReference && (
                    <Link
                      href={`/billing/invoice/${merchantReference}`}
                      className="text-xs text-blue-300 underline underline-offset-2 hover:text-blue-200"
                    >
                      View invoice →
                    </Link>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-400">
                Selected add-ons:
                {' '}
                {ADD_ON_OPTIONS.filter((item) => addOns?.[item.key]).map((item) => item.label).join(', ') || 'None'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Data Export ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-blue-600" />
            Export Your Data
          </CardTitle>
          <CardDescription>
            Download full CSV exports at any time. Your data remains accessible for 30 days after cancellation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Students', desc: 'All enrolled students with admission numbers', fn: () => exportApi.students(), file: 'students.csv' },
              { label: 'Payments', desc: 'Full payment history with references', fn: () => exportApi.payments(), file: 'payments.csv' },
              { label: 'Staff', desc: 'All staff accounts and roles', fn: () => exportApi.staff(), file: 'staff.csv' },
            ].map(({ label, desc, fn, file }) => (
              <div key={label} className="flex flex-col gap-2 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <Button variant="outline" size="sm" className="mt-auto w-full"
                  onClick={async () => {
                    try { downloadBlob(await fn(), file); }
                    catch { toast.error('Export failed'); }
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Download CSV
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Payment History ──────────────────────────────────────────────── */}
      <PaymentHistory />

      {/* ── Pricing formula callout ───────────────────────────────────────── */}
      <Card className="bg-muted/40">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <TrendingUp className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold">How your bill is calculated</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                ( KES 8,500 base + enrolled students × KES 40 + selected add-ons ) × 1.16 VAT = term cost
              </p>
            </div>
            <div className="sm:ml-auto flex gap-2 shrink-0">
              <div className="text-center px-3 py-1.5 rounded-lg bg-background border">
                <p className="text-xs text-muted-foreground">Annual −15%</p>
              </div>
              <div className="text-center px-3 py-1.5 rounded-lg bg-background border">
                <p className="text-xs text-muted-foreground">3-Year −20%</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
            If your school is VAT-registered with KRA, you can reclaim the 16% VAT. DiraSchool provides full tax documentation on every invoice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
