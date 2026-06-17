'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/shared/brand-logo';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  Check, ChevronDown, Users, BookOpenCheck, BarChart3, Wallet,
  ClipboardCheck, FileText, ShieldCheck, UserCog, CalendarDays,
  Bus, Infinity, ArrowRight, Zap, Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────
const BASE_FEE = 12000;
const PER_STUDENT = 55;
const SCHOOL_FEE_PER_STUDENT = 10000;

const fmt = (n) => `KES ${Math.round(n).toLocaleString('en-KE')}`;

const VAT_RATE = 0.16;

function calcPrice(students, option) {
  const subtotal = BASE_FEE + students * PER_STUDENT;
  const multiplier = option === 'annual' ? 2.70 : option === 'multi-year' ? 2.55 : 1;
  const subtotalExVat = Math.round(subtotal * multiplier);
  const vatAmount = Math.round(subtotalExVat * VAT_RATE);
  const total = subtotalExVat + vatAmount;
  const costPerStudent = subtotal / students;
  const pctOfFee = ((subtotal / (students * SCHOOL_FEE_PER_STUDENT)) * 100);
  return { subtotal, subtotalExVat, vatAmount, total, costPerStudent, pctOfFee, multiplier };
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
    q: 'Do prices include VAT?',
    a: 'Yes. All displayed prices include 16% VAT. There are no additional taxes or hidden charges at checkout — what you see is the final amount due.',
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
    q: "What if we exceed our plan's student range?",
    a: 'There are no student limits or tier penalties. You pay KES 55 per actual enrolled student every term. If you grow to 700 students, you simply pay for 700. No surprise charges or forced plan upgrades.',
  },
  {
    q: 'Does the annual discount lock us in?',
    a: "No. You can downgrade or cancel at the start of any term with 2 weeks' notice. The annual discount is purely a savings offer, not a contractual commitment.",
  },
  {
    q: 'Are all features available at every plan level?',
    a: 'Yes. Every feature is available at every price point — no locked modules, no premium tiers. The same system that powers a 1,000-student school powers a 100-student school.',
  },
];

// ─── Nav ──────────────────────────────────────────────────────────────────────
function PricingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-[#ddd8d0] bg-white/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLogo className="w-8 h-8 shrink-0" />
          <span className="font-bold text-[#1a2e1e] text-sm tracking-tight">Diraschool</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[#5c6b60] hover:text-[#1a2e1e] transition-colors hidden sm:block">
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1f5b5e] hover:bg-[#1a4e51] text-white text-sm font-semibold shadow-sm transition-all duration-150 active:scale-[0.98]"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#f7f5f0] py-24 px-4 sm:px-6 text-center">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#1f5b5e]/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1f5b5e]/10 border border-[#1f5b5e]/20 text-[#1f5b5e] text-xs font-medium mb-6">
          <Zap className="h-3 w-3" />
          Simple, transparent pricing
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-[#0d1f10] tracking-tight leading-tight">
          Fair pricing that grows<br className="hidden sm:block" /> with your school
        </h1>
        <p className="mt-5 text-lg text-[#4a5e50] max-w-xl mx-auto leading-relaxed">
          No hidden fees. No tier cliffs. Pay only for the students you have.
        </p>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm max-w-xl mx-auto w-full">
          {[
            ["Under 1% of a student's term fees", 'for the whole management system'],
            ['Billed at term start', 'when schools collect fees'],
          ].map(([bold, sub]) => (
            <div key={bold} className="flex flex-col items-center gap-1 px-4 py-3 rounded-xl bg-white border border-[#ddd8d0]">
              <span className="font-semibold text-[#0d1f10]">{bold}</span>
              <span className="text-[#7a9080]">{sub}</span>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-[#1f5b5e] hover:bg-[#1a4e51] text-white font-semibold shadow-lg shadow-[#1f5b5e]/25 transition-all duration-150 active:scale-[0.98] text-base"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#calculator"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[#1f5b5e]/30 text-[#1f5b5e] hover:bg-[#1f5b5e]/5 transition-all duration-150 text-base font-medium"
          >
            <Calculator className="h-4 w-4" />Calculate my price
          </a>
        </div>
        <p className="mt-4 text-xs text-[#7a9080]">No credit card required · Unlimited students during trial · Full features</p>
      </div>
    </section>
  );
}

// ─── Pricing Table ────────────────────────────────────────────────────────────
function PricingTable() {
  return (
    <section className="bg-white py-20 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[#0d1f10] tracking-tight">One formula, four plans</h2>
          <p className="mt-3 text-[#4a5e50] max-w-lg mx-auto">
            Same pricing formula for every school — your plan is just your size bracket. Use the calculator below to get your exact number.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map((plan) => {
            const p = plan.custom ? null : calcPrice(plan.example, 'per-term');
            return (
              <div
                key={plan.name}
                className={cn(
                  'relative rounded-2xl border flex flex-col p-6 transition-shadow duration-200',
                  plan.highlight
                    ? 'bg-[#1f5b5e] border-transparent text-white shadow-2xl shadow-[#1f5b5e]/30 scale-[1.02]'
                    : 'bg-white border-[#ddd8d0] hover:shadow-lg hover:border-[#1f5b5e]/30',
                )}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-400 text-amber-950 text-xs font-bold shadow-sm">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-4">
                  <h3 className={cn('text-lg font-bold', plan.highlight ? 'text-white' : 'text-[#0d1f10]')}>
                    {plan.name}
                  </h3>
                  <p className={cn('text-xs mt-0.5', plan.highlight ? 'text-white/70' : 'text-[#7a9080]')}>
                    {plan.range}
                  </p>
                </div>

                <div
                  className="mb-4 pb-4 border-b"
                  style={{ borderColor: plan.highlight ? 'rgba(255,255,255,0.2)' : '#ede9e2' }}
                >
                  {plan.custom ? (
                    <div>
                      <span className={cn('text-2xl font-bold', plan.highlight ? 'text-white' : 'text-[#0d1f10]')}>Custom</span>
                      <p className="text-xs text-[#7a9080] mt-1">Negotiated per chain/contract</p>
                    </div>
                  ) : (
                    <div>
                      <span className={cn('text-2xl font-bold tabular-nums', plan.highlight ? 'text-white' : 'text-[#0d1f10]')}>
                        {fmt(p.total)}
                      </span>
                      <p className={cn('text-xs mt-0.5', plan.highlight ? 'text-white/70' : 'text-[#7a9080]')}>
                        per term incl. VAT · e.g. {plan.example} students
                      </p>
                    </div>
                  )}
                </div>

                <p className={cn('text-xs leading-relaxed flex-1', plan.highlight ? 'text-white/80' : 'text-[#4a5e50]')}>
                  {plan.description}
                </p>

                {!plan.custom && (
                  <div className={cn('mt-4 rounded-lg p-3 text-xs space-y-1', plan.highlight ? 'bg-white/10' : 'bg-[#f7f5f0]')}>
                    <div className={cn('flex justify-between', plan.highlight ? 'text-white/70' : 'text-[#5c6b60]')}>
                      <span>Base fee</span><span>KES 12,000</span>
                    </div>
                    <div className={cn('flex justify-between', plan.highlight ? 'text-white/70' : 'text-[#5c6b60]')}>
                      <span>{plan.example} × KES 55</span><span>{fmt(plan.example * PER_STUDENT)}</span>
                    </div>
                    <div
                      className={cn('flex justify-between pt-1 border-t', plan.highlight ? 'text-white/70 border-white/20' : 'text-[#5c6b60] border-[#ddd8d0]')}
                    >
                      <span>Subtotal ex VAT</span><span>{fmt(p.subtotalExVat)}</span>
                    </div>
                    <div className={cn('flex justify-between', plan.highlight ? 'text-white/70' : 'text-[#5c6b60]')}>
                      <span>VAT 16%</span><span>{fmt(p.vatAmount)}</span>
                    </div>
                    <div
                      className={cn('flex justify-between font-semibold pt-1 border-t', plan.highlight ? 'text-white border-white/20' : 'text-[#0d1f10] border-[#ddd8d0]')}
                    >
                      <span>Total per term</span><span>{fmt(p.total)}</span>
                    </div>
                  </div>
                )}

                <Link
                  href={plan.custom ? 'mailto:admin@diraschool.com' : '/register'}
                  className={cn(
                    'mt-5 w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
                    plan.highlight
                      ? 'bg-white text-[#1f5b5e] hover:bg-[#f7f5f0]'
                      : plan.custom
                        ? 'bg-[#0d1f10] text-white hover:bg-[#1a2e1e]'
                        : 'bg-[#1f5b5e] text-white hover:bg-[#1a4e51]',
                  )}
                >
                  {plan.custom ? 'Contact Sales' : 'Get Started'}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl bg-[#f7f5f0] border border-[#ddd8d0] p-6 text-center">
          <p className="text-sm text-[#4a5e50] font-medium">The formula behind every plan</p>
          <p className="mt-2 text-[#0d1f10] font-mono text-sm">
            KES 12,000 base + students × KES 55 + 16% VAT = your term cost
          </p>
          <p className="mt-2 text-xs text-[#7a9080]">Linear scaling — no step increases, no surprises</p>
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
    { id: 'annual', label: 'Annual', sub: '10% off' },
    { id: 'multi-year', label: '3-Year', sub: '15% off · Enterprise' },
  ];

  return (
    <section id="calculator" className="bg-[#f7f5f0] py-20 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[#0d1f10] tracking-tight">Calculate your exact price</h2>
          <p className="mt-3 text-[#4a5e50]">Adjust students and billing cycle — price updates instantly.</p>
        </div>

        <div className="rounded-2xl bg-white border border-[#ddd8d0] overflow-hidden shadow-sm">
          <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#ede9e2]">
            {/* Left: inputs */}
            <div className="p-8 space-y-8">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-[#7a9080] font-medium uppercase tracking-wide">Number of Students</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setStudents(Math.max(10, students - 10))}
                      className="w-7 h-7 rounded-lg bg-[#1f5b5e]/10 text-[#1f5b5e] text-lg leading-none hover:bg-[#1f5b5e]/20 transition-colors flex items-center justify-center font-bold"
                    >−</button>
                    <input
                      type="number"
                      min={10}
                      max={5000}
                      value={students}
                      onChange={(e) => {
                        const v = Math.max(10, Math.min(5000, parseInt(e.target.value) || 10));
                        setStudents(v);
                      }}
                      className="w-20 text-center bg-[#f7f5f0] border border-[#ddd8d0] rounded-lg text-[#0d1f10] text-sm font-bold h-8 focus:outline-none focus:ring-1 focus:ring-[#1f5b5e]"
                    />
                    <button
                      onClick={() => setStudents(Math.min(5000, students + 10))}
                      className="w-7 h-7 rounded-lg bg-[#1f5b5e]/10 text-[#1f5b5e] text-lg leading-none hover:bg-[#1f5b5e]/20 transition-colors flex items-center justify-center font-bold"
                    >+</button>
                  </div>
                </div>
                <input
                  type="range"
                  min={10}
                  max={2000}
                  step={10}
                  value={Math.min(students, 2000)}
                  onChange={(e) => setStudents(parseInt(e.target.value))}
                  className="w-full accent-[#1f5b5e] cursor-pointer"
                />
                <div className="flex justify-between text-xs text-[#7a9080] mt-1">
                  <span>10</span><span>500</span><span>1,000</span><span>2,000</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#7a9080] font-medium uppercase tracking-wide block mb-3">Billing Cycle</label>
                <div className="space-y-2">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setOption(tab.id)}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all duration-150',
                        option === tab.id
                          ? 'bg-[#1f5b5e]/10 border-[#1f5b5e]/30 text-[#0d1f10]'
                          : 'bg-[#f7f5f0] border-[#ddd8d0] text-[#5c6b60] hover:border-[#1f5b5e]/20 hover:text-[#0d1f10]',
                      )}
                    >
                      <span className="font-semibold">{tab.label}</span>
                      <span className={cn('text-xs', option === tab.id ? 'text-[#1f5b5e]' : 'text-[#7a9080]')}>{tab.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: output */}
            <div className="p-8 flex flex-col justify-between">
              <div>
                <p className="text-xs text-[#7a9080] font-medium uppercase tracking-wide mb-5">Price Breakdown</p>

                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between text-[#5c6b60]">
                    <span>Base fee</span>
                    <span className="font-mono">KES 12,000</span>
                  </div>
                  <div className="flex justify-between text-[#5c6b60]">
                    <span>{students.toLocaleString()} × KES 55</span>
                    <span className="font-mono">{fmt(students * PER_STUDENT)}</span>
                  </div>
                  {option !== 'per-term' && (
                    <div className="flex justify-between text-[#5c6b60]">
                      <span>× {p.multiplier} ({option === 'annual' ? '10% off' : '15% off'})</span>
                      <span className="font-mono text-[#2d7a4f]">discount applied</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[#5c6b60]">
                    <span>Subtotal ex VAT</span>
                    <span className="font-mono">{fmt(p.subtotalExVat)}</span>
                  </div>
                  <div className="flex justify-between text-[#5c6b60]">
                    <span>VAT 16%</span>
                    <span className="font-mono">{fmt(p.vatAmount)}</span>
                  </div>
                </div>

                <div className="mt-5 pt-5 border-t border-[#ddd8d0]">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[#0d1f10] font-semibold">
                      {option === 'per-term' ? 'Per term incl. VAT' : option === 'annual' ? 'Annual total incl. VAT' : '3-year total incl. VAT'}
                    </span>
                    <span className="text-2xl font-bold text-[#0d1f10] font-mono">{fmt(p.total)}</span>
                  </div>
                  {option === 'per-term' && (
                    <p className="text-[#7a9080] text-xs mt-1 text-right">Annual (3 terms): {fmt(p.total * 3)}</p>
                  )}
                  {saving && (
                    <p className="text-[#2d7a4f] text-xs mt-1 text-right font-medium">You save {fmt(saving)} per year vs per-term</p>
                  )}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#f7f5f0] border border-[#ddd8d0] p-3">
                  <p className="text-[#7a9080] text-xs mb-1">Cost per student</p>
                  <p className="text-[#0d1f10] font-bold font-mono text-sm">{fmt(p.costPerStudent)}</p>
                  <p className="text-[#7a9080] text-xs">per term</p>
                </div>
                <div className="rounded-xl bg-[#f7f5f0] border border-[#ddd8d0] p-3">
                  <p className="text-[#7a9080] text-xs mb-1">% of fee income</p>
                  <p className="text-[#0d1f10] font-bold font-mono text-sm">{p.pctOfFee.toFixed(2)}%</p>
                  <p className="text-[#7a9080] text-xs">at KES 10K/student</p>
                </div>
              </div>

              <Link
                href="/register"
                className="mt-6 w-full inline-flex items-center justify-center px-4 py-3 rounded-xl bg-[#1f5b5e] hover:bg-[#1a4e51] text-white font-semibold text-sm transition-all"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-[#7a9080] mt-4">
          All prices include 16% VAT. No additional taxes at checkout.
        </p>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────
function FeaturesSection() {
  return (
    <section className="bg-white py-20 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[#0d1f10] tracking-tight">Everything included. No exceptions.</h2>
          <p className="mt-3 text-[#4a5e50] max-w-lg mx-auto">
            All features are available at every price point. No premium tiers, no locked modules.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-start gap-3 p-4 rounded-xl border border-[#ede9e2] hover:border-[#1f5b5e]/25 hover:bg-[#f7f5f0] transition-all duration-150 group">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1f5b5e]/10 group-hover:bg-[#1f5b5e]/15 transition-colors shrink-0">
                <Icon className="h-4 w-4 text-[#1f5b5e]" />
              </div>
              <span className="text-sm text-[#1a2e1e] font-medium leading-tight pt-0.5">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-[#1f5b5e] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-white">
          <div>
            <p className="font-bold text-lg">Same system. Every school.</p>
            <p className="text-white/70 text-sm mt-0.5">A 100-student school gets every feature a 1,000-student school does.</p>
          </div>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/30 text-white hover:bg-white/10 transition-all text-sm font-medium shrink-0"
          >
            See it in action →
          </Link>
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
        <span className="font-semibold text-[#0d1f10] pr-4 group-hover:text-[#1f5b5e] transition-colors text-sm sm:text-base">
          {q}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-[#7a9080] shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </Collapsible.Trigger>
      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <p className="pb-5 text-sm text-[#4a5e50] leading-relaxed">{a}</p>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function FAQSection() {
  return (
    <section className="bg-[#f7f5f0] py-20 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[#0d1f10] tracking-tight">Frequently asked questions</h2>
          <p className="mt-3 text-[#4a5e50]">Still not sure? Read what schools usually ask us.</p>
        </div>

        <div className="rounded-2xl bg-white border border-[#ddd8d0] divide-y divide-[#ede9e2] px-6 sm:px-8">
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
    <section className="relative overflow-hidden bg-[#1f5b5e] py-24 px-4 sm:px-6 text-center">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-white/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto">
        <h2 className="text-4xl font-bold text-white tracking-tight">Ready to get started?</h2>
        <p className="mt-4 text-white/70 text-lg">
          Tell us about your school and we'll have you set up within 24 hours. Full access, all features.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-white text-[#1f5b5e] font-bold shadow-xl hover:bg-[#f7f5f0] transition-all duration-150 active:scale-[0.98] text-base"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="mailto:admin@diraschool.com"
            className="text-white/60 hover:text-white transition-colors text-sm"
          >
            Questions? Email us →
          </a>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-6 text-xs text-white/50">
          {['30-day free trial', 'CBC-compliant reports', 'Nairobi support', 'Unlimited students', 'Cancel any time'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-white/80" />{t}
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
    <div className="min-h-screen bg-white">
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
