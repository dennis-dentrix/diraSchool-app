'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  Check, ChevronDown, Users, BookOpenCheck, BarChart3, Wallet,
  ClipboardCheck, FileText, ShieldCheck, UserCog, CalendarDays,
  Bus, Infinity, ArrowRight, Zap, Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────
const BASE_FEE = 8500;
const PER_STUDENT = 40;
const VAT = 0.16;
const SCHOOL_FEE_PER_STUDENT = 10000;

const fmt = (n) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

function calcPrice(students, option) {
  const subtotal = BASE_FEE + students * PER_STUDENT;
  const multiplier = option === 'annual' ? 2.55 : option === 'multi-year' ? 2.40 : 1;
  const base = subtotal * multiplier;
  const vat = Math.round(base * VAT);
  const total = base + vat;
  const costPerStudent = subtotal / students;
  const pctOfFee = ((subtotal / (students * SCHOOL_FEE_PER_STUDENT)) * 100);
  return { subtotal, base, vat, total, costPerStudent, pctOfFee, multiplier };
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Starter',
    range: '100 – 250 students',
    description: 'Perfect for emerging schools. Simple setup, full features from day one.',
    highlight: false,
    example: 150,
  },
  {
    name: 'Growth',
    range: '250 – 600 students',
    description: 'For expanding schools. Proven across hundreds of Kenyan CBC schools.',
    highlight: true,
    badge: 'Most Popular',
    example: 400,
  },
  {
    name: 'Professional',
    range: '600+ students',
    description: 'For established schools. Priority support and advanced analytics.',
    highlight: false,
    example: 800,
  },
  {
    name: 'Enterprise',
    range: 'School chains & Govt',
    description: 'Custom pricing and dedicated implementation for chains and tenders.',
    highlight: false,
    custom: true,
    example: null,
  },
];

const EXAMPLE_SIZES = [100, 300, 600, 1000];

const FEATURES = [
  { icon: Users, label: 'Student Records Management' },
  { icon: ClipboardCheck, label: 'Attendance Tracking' },
  { icon: FileText, label: 'CBC Report Card Generation' },
  { icon: Wallet, label: 'Fee Management & Payments' },
  { icon: BarChart3, label: 'Exam Results Entry' },
  { icon: BookOpenCheck, label: 'Parent Portal (Included)' },
  { icon: ShieldCheck, label: 'Audit Logging' },
  { icon: UserCog, label: 'Staff Role Management' },
  { icon: CalendarDays, label: 'Timetable Management' },
  { icon: Bus, label: 'Transport Management' },
  { icon: Infinity, label: 'Unlimited Users per School' },
];

const FAQS = [
  {
    q: 'What is VAT and does my school pay it?',
    a: 'VAT (Value Added Tax) is a government tax of 16%. All services in Kenya charge it. You will see it as a clear line item on your invoice. If your school is registered for VAT with KRA, you can claim it back — check with your accountant. DiraSchool provides all necessary tax documentation.',
  },
  {
    q: 'How is billing aligned with the school calendar?',
    a: "We invoice you 2 weeks before each term starts — right when you're about to collect parent fees. You pay on the first day of term. Term 1: invoice late Dec, due Jan 6. Term 2: invoice mid-Apr, due Apr 28. Term 3: invoice mid-Aug, due Sep 1. DiraSchool is an operating expense, not a cash reserve drain.",
  },
  {
    q: 'What happens if my student numbers change mid-term?',
    a: 'Your next invoice reflects your actual enrollment count. No penalties, no mid-term adjustments. If you grow, the next invoice is higher. If students leave, the next invoice is lower. Simple and fair.',
  },
  {
    q: 'Can we pay monthly instead of per-term?',
    a: 'We recommend per-term billing since it aligns with school cash flow. Monthly billing is available on request but includes a 20% premium — it breaks our operating cycle and requires more administration.',
  },
  {
    q: 'What if we exceed our plan\'s student range?',
    a: 'There are no student limits or tier penalties. You pay KES 40 per actual enrolled student every term. If you grow to 700 students, you simply pay for 700. No surprise charges or forced plan upgrades.',
  },
  {
    q: 'Does the annual discount lock us in?',
    a: 'No. You can downgrade or cancel at the start of any term with 2 weeks\' notice. The annual discount is purely a savings offer, not a contractual commitment.',
  },
  {
    q: 'Are all features available at every plan level?',
    a: 'Core platform pricing is the same for all schools. Optional add-ons are billed per term: Transport (KES 1,500) and Bulk SMS (KES 2,000).',
  },
];

// ─── Nav ──────────────────────────────────────────────────────────────────────
function PricingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-900/50">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="font-bold text-white text-sm tracking-tight">Diraschool</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block">
            Sign in
          </Link>
          <Button asChild size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 shadow-lg shadow-blue-500/20">
            <Link href="/register">Start free trial</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-24 px-4 sm:px-6 text-center">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
          <Zap className="h-3 w-3" />
          Simple, transparent pricing
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
          Fair pricing that grows<br className="hidden sm:block" /> with your school
        </h1>
        <p className="mt-5 text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
          No hidden fees. No tier cliffs. Pay only for the students you have.
        </p>

        {/* Value props */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            ['Under 1% of a student\'s term fees', 'for the whole management system'],
            ['Billed at term start', 'when schools collect fees'],
            ['Optional add-ons', 'transport, bulk SMS'],
          ].map(([bold, sub]) => (
            <div key={bold} className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10">
              <span className="font-semibold text-white">{bold}</span>
              <span className="text-slate-500">{sub}</span>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 shadow-xl shadow-blue-500/25 px-8">
            <Link href="/register">Start 30-day free trial <ArrowRight className="h-4 w-4 ml-1" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="border-white/15 text-slate-300 hover:bg-white/10 hover:text-white bg-transparent">
            <a href="#calculator"><Calculator className="h-4 w-4 mr-2" />Calculate my price</a>
          </Button>
        </div>
        <p className="mt-4 text-xs text-slate-600">No credit card required · 50 students during trial · Full features</p>
      </div>
    </section>
  );
}

// ─── Pricing Table ────────────────────────────────────────────────────────────
function PricingTable() {
  const [previewSize, setPreviewSize] = useState(300);

  return (
    <section className="bg-white py-20 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">One formula, four plans</h2>
          <p className="mt-3 text-slate-500 max-w-lg mx-auto">
            All plans use the same base formula. Optional features can be added as billed add-ons.
          </p>
          {/* Example size toggle */}
          <div className="mt-6 inline-flex items-center gap-2 bg-slate-100 rounded-xl p-1">
            <span className="text-xs text-slate-500 px-2">Show example for</span>
            {EXAMPLE_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => setPreviewSize(s)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150',
                  previewSize === s
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {s} students
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map((plan) => {
            const p = plan.custom ? null : calcPrice(previewSize, 'per-term');
            return (
              <div
                key={plan.name}
                className={cn(
                  'relative rounded-2xl border flex flex-col p-6 transition-shadow duration-200',
                  plan.highlight
                    ? 'bg-gradient-to-b from-blue-600 to-indigo-700 border-transparent text-white shadow-2xl shadow-blue-500/30 scale-[1.02]'
                    : 'bg-white border-slate-200 hover:shadow-lg hover:border-slate-300',
                )}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-400 text-amber-950 text-xs font-bold shadow-sm">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-4">
                  <h3 className={cn('text-lg font-bold', plan.highlight ? 'text-white' : 'text-slate-900')}>
                    {plan.name}
                  </h3>
                  <p className={cn('text-xs mt-0.5', plan.highlight ? 'text-blue-200' : 'text-slate-500')}>
                    {plan.range}
                  </p>
                </div>

                <div className="mb-4 pb-4 border-b border-white/15 border-opacity-20" style={{ borderColor: plan.highlight ? 'rgba(255,255,255,0.15)' : undefined }}>
                  {plan.custom ? (
                    <div>
                      <span className={cn('text-2xl font-bold', plan.highlight ? 'text-white' : 'text-slate-900')}>Custom</span>
                      <p className="text-xs text-slate-500 mt-1">Negotiated per chain/contract</p>
                    </div>
                  ) : (
                    <div>
                      <span className={cn('text-2xl font-bold tabular-nums', plan.highlight ? 'text-white' : 'text-slate-900')}>
                        {fmt(p.total)}
                      </span>
                      <p className={cn('text-xs mt-0.5', plan.highlight ? 'text-blue-200' : 'text-slate-500')}>
                        per term · inc. VAT · {previewSize} students
                      </p>
                    </div>
                  )}
                </div>

                <p className={cn('text-xs leading-relaxed flex-1', plan.highlight ? 'text-blue-100' : 'text-slate-500')}>
                  {plan.description}
                </p>

                {/* Mini breakdown */}
                {!plan.custom && (
                  <div className={cn('mt-4 rounded-lg p-3 text-xs space-y-1', plan.highlight ? 'bg-white/10' : 'bg-slate-50')}>
                    <div className={cn('flex justify-between', plan.highlight ? 'text-blue-100' : 'text-slate-500')}>
                      <span>Base fee</span><span>KES 8,500</span>
                    </div>
                    <div className={cn('flex justify-between', plan.highlight ? 'text-blue-100' : 'text-slate-500')}>
                      <span>{previewSize} × KES 40</span><span>{fmt(previewSize * 40)}</span>
                    </div>
                    <div className={cn('flex justify-between font-semibold pt-1 border-t', plan.highlight ? 'text-white border-white/20' : 'text-slate-700 border-slate-200')}>
                      <span>Total (inc. VAT)</span><span>{fmt(p.total)}</span>
                    </div>
                  </div>
                )}

                <Button
                  asChild
                  className={cn(
                    'mt-5 w-full',
                    plan.highlight
                      ? 'bg-white text-indigo-700 hover:bg-blue-50 font-bold'
                      : plan.custom
                        ? 'bg-slate-900 text-white hover:bg-slate-700'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0',
                  )}
                >
                  <Link href={plan.custom ? 'mailto:contact@diraschool.com' : '/register'}>
                    {plan.custom ? 'Contact Sales' : 'Get Started'}
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>

        {/* Formula callout */}
        <div className="mt-10 rounded-2xl bg-slate-50 border border-slate-200 p-6 text-center">
          <p className="text-sm text-slate-600 font-medium">The formula behind every plan</p>
          <p className="mt-2 text-slate-800 font-mono text-sm">
            ( KES 8,500 base + students × KES 40 ) × 1.16 VAT = your term cost
          </p>
          <p className="mt-2 text-xs text-slate-400">Linear scaling — no step increases, no surprises</p>
        </div>
      </div>
    </section>
  );
}

// ─── Calculator ───────────────────────────────────────────────────────────────
function PriceCalculator() {
  const [students, setStudents] = useState(300);
  const [option, setOption] = useState('per-term');

  const p = calcPrice(students, option);
  const perTerm = calcPrice(students, 'per-term');
  const annual = calcPrice(students, 'annual');
  const saving = option === 'annual' ? (perTerm.total * 3 - annual.total) : null;

  const TABS = [
    { id: 'per-term', label: 'Per Term', sub: '3× per year' },
    { id: 'annual', label: 'Annual', sub: '15% off' },
    { id: 'multi-year', label: '3-Year', sub: '20% off · Enterprise' },
  ];

  return (
    <section id="calculator" className="bg-slate-950 py-20 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white tracking-tight">Calculate your exact price</h2>
          <p className="mt-3 text-slate-400">Adjust students and billing cycle — price updates instantly.</p>
        </div>

        <div className="rounded-2xl bg-white/[0.05] border border-white/10 backdrop-blur-sm overflow-hidden">
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10">
            {/* Left: inputs */}
            <div className="p-8 space-y-8">
              {/* Student count */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-slate-400 font-medium uppercase tracking-wide">Number of Students</label>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setStudents(Math.max(10, students - 10))} className="w-7 h-7 rounded-lg bg-white/10 text-white text-lg leading-none hover:bg-white/20 transition-colors flex items-center justify-center">−</button>
                    <input
                      type="number"
                      min={10}
                      max={5000}
                      value={students}
                      onChange={(e) => {
                        const v = Math.max(10, Math.min(5000, parseInt(e.target.value) || 10));
                        setStudents(v);
                      }}
                      className="w-20 text-center bg-white/10 border border-white/15 rounded-lg text-white text-sm font-bold h-8 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button onClick={() => setStudents(Math.min(5000, students + 10))} className="w-7 h-7 rounded-lg bg-white/10 text-white text-lg leading-none hover:bg-white/20 transition-colors flex items-center justify-center">+</button>
                  </div>
                </div>
                <input
                  type="range"
                  min={10}
                  max={2000}
                  step={10}
                  value={Math.min(students, 2000)}
                  onChange={(e) => setStudents(parseInt(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-slate-600 mt-1">
                  <span>10</span><span>500</span><span>1,000</span><span>2,000</span>
                </div>
              </div>

              {/* Payment option */}
              <div>
                <label className="text-xs text-slate-400 font-medium uppercase tracking-wide block mb-3">Billing Cycle</label>
                <div className="space-y-2">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setOption(tab.id)}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all duration-150',
                        option === tab.id
                          ? 'bg-blue-600/20 border-blue-500/50 text-white'
                          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/8 hover:text-slate-200',
                      )}
                    >
                      <span className="font-semibold">{tab.label}</span>
                      <span className={cn('text-xs', option === tab.id ? 'text-blue-300' : 'text-slate-600')}>{tab.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: output */}
            <div className="p-8 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-5">Price Breakdown</p>

                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Base fee</span>
                    <span className="font-mono">KES 8,500</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>{students.toLocaleString()} × KES 40</span>
                    <span className="font-mono">{fmt(students * PER_STUDENT)}</span>
                  </div>
                  {option !== 'per-term' && (
                    <div className="flex justify-between text-slate-400">
                      <span>× {p.multiplier} ({option === 'annual' ? '15% off' : '20% off'})</span>
                      <span className="font-mono text-emerald-400">discount applied</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-500 text-xs pt-1">
                    <span>Subtotal (ex-VAT)</span>
                    <span className="font-mono">{fmt(p.base / 1.16 * (option !== 'per-term' ? p.multiplier : 1))}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 text-xs">
                    <span>VAT (16%)</span>
                    <span className="font-mono">{fmt(p.vat)}</span>
                  </div>
                </div>

                <div className="mt-5 pt-5 border-t border-white/10">
                  <div className="flex justify-between items-baseline">
                    <span className="text-white font-semibold">
                      {option === 'per-term' ? 'Per term (inc. VAT)' : option === 'annual' ? 'Annual total (inc. VAT)' : '3-year annual (inc. VAT)'}
                    </span>
                    <span className="text-2xl font-bold text-white font-mono">{fmt(p.total)}</span>
                  </div>
                  {option === 'per-term' && (
                    <p className="text-slate-500 text-xs mt-1 text-right">Annual (3 terms): {fmt(p.total * 3)}</p>
                  )}
                  {saving && (
                    <p className="text-emerald-400 text-xs mt-1 text-right font-medium">You save {fmt(saving)} per year vs per-term</p>
                  )}
                </div>
              </div>

              {/* Insight stats */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-slate-400 text-xs mb-1">Cost per student</p>
                  <p className="text-white font-bold font-mono text-sm">{fmt(p.costPerStudent)}</p>
                  <p className="text-slate-600 text-xs">per term</p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <p className="text-slate-400 text-xs mb-1">% of fee income</p>
                  <p className="text-white font-bold font-mono text-sm">{p.pctOfFee.toFixed(2)}%</p>
                  <p className="text-slate-600 text-xs">at KES 10K/student</p>
                </div>
              </div>

              <Button
                asChild
                className="mt-6 w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0"
              >
                <Link href="/register">Start free trial — no credit card</Link>
              </Button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Prices shown include 16% VAT. If your school is VAT-registered with KRA, you can reclaim the VAT portion.
        </p>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
function FeaturesSection() {
  return (
    <section className="bg-white py-20 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Everything included. No exceptions.</h2>
          <p className="mt-3 text-slate-500 max-w-lg mx-auto">
            All features are available at every price point. No premium tiers, no locked modules.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all duration-150 group">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors shrink-0">
                <Icon className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-sm text-slate-700 font-medium leading-tight pt-0.5">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-white">
          <div>
            <p className="font-bold text-lg">Same system. Every school.</p>
            <p className="text-blue-200 text-sm mt-0.5">A 100-student school gets every feature a 1,000-student school does.</p>
          </div>
          <Button asChild variant="outline" className="border-white/30 text-white hover:bg-white/15 bg-transparent shrink-0">
            <Link href="/register">See it in action →</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="w-full flex items-center justify-between py-5 text-left group">
        <span className="font-semibold text-slate-800 pr-4 group-hover:text-blue-600 transition-colors text-sm sm:text-base">
          {q}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </Collapsible.Trigger>
      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <p className="pb-5 text-sm text-slate-500 leading-relaxed">{a}</p>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function FAQSection() {
  return (
    <section className="bg-slate-50 py-20 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Frequently asked questions</h2>
          <p className="mt-3 text-slate-500">Still not sure? Read what schools usually ask us.</p>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 px-6 sm:px-8">
          {FAQS.map((faq) => (
            <FAQItem key={faq.q} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Trial CTA ────────────────────────────────────────────────────────────────
function TrialCTA() {
  return (
    <section className="relative overflow-hidden bg-slate-950 py-24 px-4 sm:px-6 text-center">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto">
        <h2 className="text-4xl font-bold text-white tracking-tight">Start for free today</h2>
        <p className="mt-4 text-slate-400 text-lg">
          Full access. All features. Up to 50 students. No credit card needed.
        </p>
        <p className="mt-2 text-slate-600 text-sm">
          Data retained for 14 days after trial — upgrade anytime to keep everything.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button asChild size="lg" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white border-0 shadow-2xl shadow-blue-500/30 px-10 h-12 text-base">
            <Link href="/register">Start your 30-day free trial <ArrowRight className="h-4 w-4 ml-1.5" /></Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="text-slate-400 hover:text-white hover:bg-white/10">
            <Link href="mailto:contact@diraschool.com">Talk to sales</Link>
          </Button>
        </div>

        {/* Trust badges */}
        <div className="mt-12 flex flex-wrap justify-center gap-6 text-xs text-slate-600">
          {['30-day free trial', 'No credit card required', 'CBC-compliant reports', 'Kenyan VAT documentation', 'Cancel any time'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-emerald-500" />{t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <PricingNav />
      <Hero />
      <PricingTable />
      <PriceCalculator />
      <FeaturesSection />
      <FAQSection />
      <TrialCTA />
    </div>
  );
}
