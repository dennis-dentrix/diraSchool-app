'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { feesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Sparkline SVG (12 data points) ───────────────────────────────────────────
function Sparkline({ data = [], height = 36, width = 120 }) {
  const pts = data.slice(-12);
  if (pts.length < 2 || pts.every((v) => v === 0)) return null;
  const max = Math.max(...pts, 1);
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * width;
    const y = height - (v / max) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.join(' ')}
        className="opacity-70"
      />
      <circle
        cx={coords[coords.length - 1].split(',')[0]}
        cy={coords[coords.length - 1].split(',')[1]}
        r="2.5"
        fill="currentColor"
      />
    </svg>
  );
}

// ── Method pill ───────────────────────────────────────────────────────────────
const METHOD_CLS = {
  mpesa: 'border-ok/30 text-ok',
  bank:  'border-primary/30 text-primary',
  cash:  'border-border text-foreground',
  cheque:'border-muted-foreground/30 text-muted-foreground',
};

function MethodPill({ method }) {
  const m = (method ?? '').toLowerCase();
  const label = m === 'mpesa' ? 'M-Pesa' : m ? m[0].toUpperCase() + m.slice(1) : 'Cash';
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium', METHOD_CLS[m] ?? METHOD_CLS.cash)}>
      {label}
    </span>
  );
}

// ── Time-ledger row ───────────────────────────────────────────────────────────
function LedgerRow({ payment, rank }) {
  const student = payment.studentId;
  const time = payment.paymentDate ?? payment.createdAt;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      <span className="font-mono text-[11px] text-muted-foreground w-5 text-right shrink-0 tabular-nums">{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight truncate">
          {student?.firstName ?? '—'} {student?.lastName ?? ''}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums">{student?.admissionNumber ?? ''}</p>
      </div>
      <MethodPill method={payment.method} />
      <span className="font-mono text-sm tabular-nums text-right shrink-0 font-semibold min-w-[5rem]">
        {formatCurrency(payment.amount)}
      </span>
      <span className="text-[10px] text-muted-foreground w-12 text-right shrink-0 tabular-nums hidden sm:block">
        {time ? new Date(time).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—'}
      </span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FeesPage() {
  const { academicYear: defaultYear, term: defaultTerm } = useSchoolTermDefaults(['fees-overview', 'term-defaults']);
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');

  const year = selectedYear || defaultYear;
  const term = selectedTerm || defaultTerm;

  const { data: summaryRes, isLoading: summaryLoading } = useQuery({
    queryKey: ['fees-dashboard-summary', year, term],
    queryFn: async () => {
      const res = await feesApi.dashboardSummary({ academicYear: year, term });
      return res.data;
    },
  });

  const summary       = summaryRes?.summary ?? summaryRes?.data?.summary ?? {};
  const recentPayments = summaryRes?.recentPayments ?? summaryRes?.data?.recentPayments ?? [];

  const collected = summary?.termToDate?.totalAmount ?? 0;
  const target    = summary?.termFees?.totalAmount ?? 0;
  const variance  = collected - target;

  // Today's payments (API already returns today totals; also filter recent list for ledger rows)
  const todayStr      = new Date().toISOString().slice(0, 10);
  const todayPayments = useMemo(() =>
    recentPayments.filter((p) => String(p.paymentDate ?? p.createdAt ?? '').slice(0, 10) === todayStr),
  [recentPayments, todayStr]);
  const todayTotal = summary?.today?.totalAmount ?? todayPayments.reduce((s, p) => s + (p.amount ?? 0), 0);

  // Defaulters — now returned directly by the API
  const defaulters = summary?.defaulters ?? [];

  // 12-week sparkline from recent payments
  const sparkData = useMemo(() => {
    if (!Array.isArray(recentPayments)) return [];
    const now = Date.now();
    const weeks = Array(12).fill(0);
    for (const p of recentPayments) {
      const ms = new Date(p.paymentDate ?? p.createdAt).getTime();
      const w = Math.floor((now - ms) / (7 * 24 * 60 * 60 * 1000));
      if (w >= 0 && w < 12) weeks[11 - w] += p.amount;
    }
    return weeks;
  }, [recentPayments]);

  return (
    <div className="space-y-5 sm:space-y-6" data-tour="finance-dashboard">

      {/* ── Ledger header ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Fees Overview</p>
            <h1 className="text-2xl font-bold tracking-tight leading-none">Fees &amp; Collections</h1>
          </div>
          <div className="flex gap-2 shrink-0">
            <Select value={term} onValueChange={setSelectedTerm}>
              <SelectTrigger className="h-8 w-28 text-xs rounded-full border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-8 w-24 text-xs rounded-full border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Balance trio */}
        <div className="rounded-lg border bg-card px-4 py-4 sm:px-5">
          {summaryLoading ? (
            <div className="flex gap-8">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-7 w-28" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex gap-5 sm:gap-8 flex-1 flex-wrap">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Collected</p>
                  <p className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-ok">{formatCurrency(collected)}</p>
                </div>
                {target > 0 && (
                  <>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Target</p>
                      <p className="font-mono text-xl sm:text-2xl font-bold tabular-nums">{formatCurrency(target)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Variance</p>
                      <p className={cn('font-mono text-xl sm:text-2xl font-bold tabular-nums', variance >= 0 ? 'text-ok' : 'text-bad')}>
                        {variance >= 0 ? '+' : ''}{formatCurrency(Math.abs(variance))}
                      </p>
                    </div>
                  </>
                )}
              </div>
              {sparkData.some((v) => v > 0) && (
                <div className="shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">12-week trend</p>
                  <Sparkline data={sparkData} className="text-ok" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Today's collections ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Today's Collections
          </p>
          <div className="flex items-center gap-3">
            {todayPayments.length > 0 && (
              <span className="font-mono text-sm tabular-nums font-semibold text-ok">{formatCurrency(todayTotal)}</span>
            )}
            <Link href="/fees/payments" className="text-xs text-primary hover:underline flex items-center gap-0.5">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
        <div className="rounded-lg border bg-card">
          {summaryLoading ? (
            <div className="px-4 divide-y">
              {[...Array(4)].map((_, i) => <div key={i} className="py-2.5"><Skeleton className="h-9 w-full" /></div>)}
            </div>
          ) : todayPayments.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <p className="text-sm">No payments recorded today.</p>
              <Link href="/fees/payments" className="text-xs text-primary hover:underline mt-1 inline-block">
                Record a payment →
              </Link>
            </div>
          ) : (
            <div className="px-4">
              {todayPayments.slice(0, 8).map((p, i) => (
                <LedgerRow key={p._id} payment={p} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Defaulters ──────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Defaulters
            {defaulters.length > 0 && (
              <span className="ml-1.5 font-mono text-bad">({defaulters.length})</span>
            )}
          </p>
        </div>

        {summaryLoading ? (
          <div className="rounded-lg border bg-card px-4 divide-y">
            {[...Array(4)].map((_, i) => <div key={i} className="py-2.5"><Skeleton className="h-8 w-full" /></div>)}
          </div>
        ) : defaulters.length === 0 ? (
          <div className="rounded-lg border bg-card py-10 text-center text-muted-foreground">
            <p className="text-sm">No defaulters — all students are up to date.</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-2 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-8">#</th>
                    <th className="py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Student</th>
                    <th className="py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Class</th>
                    <th className="py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Days</th>
                    <th className="py-2 px-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Outstanding</th>
                    <th className="py-2 px-2 pr-4 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {defaulters.map((d, i) => {
                    const cls = d.classId
                      ? `${d.classId.name}${d.classId.stream ? ` ${d.classId.stream}` : ''}`
                      : d.className ?? '—';
                    const days = d.daysOverdue ?? d.days ?? 0;
                    const daysColor = days >= 30 ? 'text-bad' : days >= 14 ? 'text-warn' : 'text-foreground';
                    return (
                      <tr key={d._id ?? d.studentId ?? i} className="hover:bg-muted/20">
                        <td className="py-2.5 pl-4 pr-2">
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
                        </td>
                        <td className="py-2.5 px-2">
                          <p className="font-medium leading-tight">{d.firstName ?? d.name} {d.lastName ?? ''}</p>
                          <p className="font-mono text-[11px] text-muted-foreground tabular-nums">{d.admissionNumber ?? ''}</p>
                        </td>
                        <td className="py-2.5 px-2 hidden sm:table-cell text-muted-foreground text-xs">{cls}</td>
                        <td className="py-2.5 px-2 hidden md:table-cell">
                          {days > 0 ? (
                            <span className={cn('font-mono text-sm tabular-nums', daysColor)}>{days}</span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="py-2.5 px-2 pr-4 text-right">
                          <span className="font-mono text-sm tabular-nums font-semibold text-bad">
                            {formatCurrency(d.outstanding ?? d.balance ?? 0)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 pr-4 text-right">
                          <Link
                            href={`/students/${d._id ?? d.studentId}`}
                            className="text-primary hover:underline text-xs inline-flex items-center gap-0.5"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div data-tour="finance-reports" className="hidden" />
    </div>
  );
}
