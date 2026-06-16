import Link from 'next/link';
import { BrandLogo } from '@/components/shared/brand-logo';
import {
  ArrowRight, Check, Users, GraduationCap, CreditCard,
  ClipboardCheck, FileText, BookOpen, Bus,
  Smartphone, Zap, X, ChevronRight,
} from 'lucide-react';
import LandingFAQ from './_components/LandingFAQ';
import { MarketingFooter } from '@/components/marketing/marketing-footer';

export const metadata = {
  title: 'DiraSchool — CBC School Management for Kenyan Schools',
  description:
    'Manage your CBC school digitally. Attendance, fees, CBC report cards, and parent portal built for Kenyan schools. Free 30-day trial, no card needed.',
  alternates: { canonical: 'https://diraschool.com' },
  openGraph: {
    title: 'DiraSchool — Run Your School Without the Paperwork',
    description:
      'The complete CBC school management platform for Kenya. Digital attendance, automated fees, one-click report cards, and a parent portal. Start free for 30 days.',
    url: 'https://diraschool.com',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://diraschool.com/#website',
      name: 'DiraSchool',
      url: 'https://diraschool.com',
    },
    {
      '@type': 'Organization',
      '@id': 'https://diraschool.com/#org',
      name: 'DiraSchool',
      legalName: 'Dirant Technologies Ltd',
      url: 'https://diraschool.com',
      logo: {
        '@type': 'ImageObject',
        url: 'https://diraschool.com/icon',
        width: 512,
        height: 512,
      },
      description: 'CBC school management system for Kenyan schools.',
      address: { '@type': 'PostalAddress', addressLocality: 'Nairobi', addressCountry: 'KE' },
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: 'admin@diraschool.com',
          telephone: '+254115879589',
          availableLanguage: ['English', 'Swahili'],
          areaServed: 'KE',
        },
      ],
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://diraschool.com/#app',
      name: 'DiraSchool',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      url: 'https://diraschool.com',
      publisher: { '@id': 'https://diraschool.com/#org' },
      description:
        'Complete CBC school management system for Kenyan schools including attendance, report cards, fee management, and parent portal.',
      offers: [
        {
          '@type': 'Offer',
          name: 'Base platform fee',
          price: '12000',
          priceCurrency: 'KES',
          description: 'KES 12,000 base fee per term plus KES 55 per enrolled student, plus 16% VAT',
        },
        {
          '@type': 'Offer',
          name: 'Free Trial',
          price: '0',
          priceCurrency: 'KES',
          description: '30-day free trial with full feature access. No credit card required.',
        },
      ],
      featureList: [
        'CBC Report Card Generation — 4-level rubric across all 7 learning areas',
        'M-Pesa C2B auto-reconciliation — payments matched to student accounts in real time',
        'Digital Attendance Tracking with parent SMS alerts',
        'Parent Portal — real-time access to fees, results, and report cards',
        'Fee Management with M-Pesa, bank transfer, and cash payment tracking',
        'Staff Management with 8 role-based permission levels',
        'Timetable Management',
        'Transport Management',
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Is DiraSchool built for the CBC curriculum?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes — every feature is designed around CBC. Report cards cover all 7 learning areas with the correct grade descriptors (Exceeds, Meets, Approaches, Below). Attendance, timetable, and subject management all align with CBC structure.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does pricing work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'You pay KES 12,000 base fee plus KES 55 per enrolled student per term, plus 16% VAT. Annual billing saves 10% and multi-year billing saves 15%. No hidden charges beyond the published formula.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can parents see their children\'s results and fees?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Yes. The parent portal gives guardians real-time access to their child's attendance record, exam results, fee balances, and published report cards. Parents log in with their own credentials — no app download needed.",
          },
        },
        {
          '@type': 'Question',
          name: 'How long does setup take?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Most schools are fully set up in under a day. You can import students via CSV, invite staff by email, and set up classes and subjects in minutes. Our onboarding guide walks you through each step.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is the 30-day trial really free?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes — full access to every feature, unlimited students, no credit card required. At the end of your trial, your data is retained for 14 days while you decide to continue.',
          },
        },
      ],
    },
  ],
};

// ── Nav ────────────────────────────────────────────────────────────────────────
function MarketingNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-[#ddd8d0] bg-white/95 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLogo className="w-8 h-8 shrink-0" />
          <span className="font-bold text-[#1a2e1e] text-sm tracking-tight">Diraschool</span>
        </Link>
        <div className="hidden sm:flex items-center gap-6 text-sm text-[#5c6b60]">
          <Link href="/pricing" className="hover:text-[#1a2e1e] transition-colors">Pricing</Link>
          <Link href="/blog" className="hover:text-[#1a2e1e] transition-colors">Blog</Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="inline-flex items-center px-3 py-2 rounded-lg border border-[#ddd8d0] text-sm text-[#1a2e1e] font-medium hover:bg-[#f7f5f0] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1f5b5e] hover:bg-[#1a4e51] text-white text-sm font-semibold shadow-sm transition-all duration-150 active:scale-[0.98] hidden sm:inline-flex"
          >
            Start free trial
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#f7f5f0] pt-20 pb-28 px-4 sm:px-6">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[#1f5b5e]/8 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-80 h-80 bg-[#1f5b5e]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-64 bg-[#1f5b5e]/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1f5b5e]/10 border border-[#1f5b5e]/20 text-[#1f5b5e] text-xs font-semibold mb-8 tracking-wide">
          <Zap className="h-3 w-3" />
          Built for Kenyan CBC Schools
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-[#0d1f10] tracking-tight leading-[1.05]">
          Less paperwork.<br />
          <span className="text-[#1f5b5e]">
            Better schools.
          </span>
        </h1>

        <p className="mt-7 text-lg sm:text-xl text-[#4a5e50] max-w-2xl mx-auto leading-relaxed">
          DiraSchool replaces your register books, fee ledgers, and typed report cards with one
          digital system — so your team spends less time on admin and more time on education.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-[#1f5b5e] hover:bg-[#1a4e51] text-white font-semibold shadow-lg shadow-[#1f5b5e]/25 transition-all duration-150 active:scale-[0.98] text-base"
          >
            Start free — 30 days <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-[#1f5b5e]/30 text-[#1f5b5e] hover:bg-[#1f5b5e]/5 transition-all duration-150 text-base font-medium"
          >
            See pricing <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-4 text-xs text-[#7a9080] tracking-wide">
          Full access · Unlimited students during trial · No credit card required
        </p>

        <div className="mt-14 flex flex-wrap justify-center gap-x-8 gap-y-3 text-xs text-[#5c6b60]">
          {[
            'CBC-compliant report cards',
            'All 7 learning areas',
            'KES pricing, Kenyan calendar',
            'HTTPS + data encryption',
            'Cancel any time',
          ].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-[#1f5b5e] shrink-0" />{t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Paperwork section ──────────────────────────────────────────────────────────
function PaperworkSection() {
  const replacements = [
    {
      before: '3 teachers, 3 days to type report cards',
      after: 'Click Generate. 40 CBC report cards in under 2 minutes.',
      icon: FileText,
    },
    {
      before: 'Excel fee ledger with broken formulas and missing payments',
      after: 'Automated fee tracking, printed receipts, and M-Pesa integration.',
      icon: CreditCard,
    },
    {
      before: 'Paper attendance registers that get lost or damaged',
      after: 'Digital register on any phone. Class reports in one click.',
      icon: ClipboardCheck,
    },
    {
      before: 'WhatsApp groups for results, fees, and school notices',
      after: 'Parent portal with real-time results, balances, and updates.',
      icon: Smartphone,
    },
  ];

  return (
    <section className="bg-white py-24 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[#1f5b5e] text-xs font-bold uppercase tracking-widest mb-3">The paperwork problem</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0d1f10] tracking-tight leading-tight">
            Your admin team loses 40+ hours<br className="hidden sm:block" /> every single term to paperwork
          </h2>
          <p className="mt-4 text-[#4a5e50] max-w-xl mx-auto text-sm leading-relaxed">
            Every Kenyan school we spoke to described the same end-of-term nightmare: register books
            everywhere, fee chases on WhatsApp, and teachers typing the same report card 40 times.
            DiraSchool was built to end that.
          </p>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-px rounded-xl border border-[#ddd8d0] bg-[#ddd8d0] overflow-hidden mb-12">
          {[
            { n: '40+', label: 'hours saved per term' },
            { n: '2 min', label: 'to generate class report cards' },
            { n: '0', label: 'paper registers needed' },
          ].map(({ n, label }) => (
            <div key={label} className="bg-[#f7f5f0] py-8 text-center">
              <p className="text-4xl font-black text-[#1f5b5e]">{n}</p>
              <p className="text-xs text-[#5c6b60] mt-2 max-w-[120px] mx-auto leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Before / After grid */}
        <div className="grid sm:grid-cols-2 gap-3">
          {replacements.map(({ before, after, icon: Icon }) => (
            <div key={before} className="rounded-xl border border-[#ddd8d0] bg-[#f7f5f0]/60 p-5 space-y-3">
              <div className="flex items-start gap-2.5">
                <X className="h-3.5 w-3.5 text-[#c0392b] shrink-0 mt-0.5" />
                <p className="text-[#7a9080] text-sm">{before}</p>
              </div>
              <div className="h-px bg-[#ddd8d0]" />
              <div className="flex items-start gap-2.5">
                <Check className="h-3.5 w-3.5 text-[#1f5b5e] shrink-0 mt-0.5" />
                <p className="text-[#0d1f10] text-sm font-medium">{after}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-[#1f5b5e] hover:bg-[#1a4e51] text-white font-semibold shadow-md shadow-[#1f5b5e]/20 transition-all text-sm"
          >
            Start eliminating paperwork today <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ── Features ───────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: FileText,
    title: 'CBC Report Cards',
    desc: 'Generate complete CBC report cards for any class in seconds. All 7 learning areas, grade descriptors, teacher remarks — print-ready.',
    color: 'text-[#1f5b5e] bg-[#1f5b5e]/10',
  },
  {
    icon: ClipboardCheck,
    title: 'Digital Attendance',
    desc: 'Teachers take register on any device. Class-level and student-level reports, late arrival tracking, and parent alerts built in.',
    color: 'text-[#2d7a4f] bg-[#2d7a4f]/10',
  },
  {
    icon: CreditCard,
    title: 'Fee Management',
    desc: 'Per-student fee structures, payment recording, balance tracking, and receipt generation. Designed around Kenyan school term billing.',
    color: 'text-[#8a6020] bg-[#8a6020]/10',
  },
  {
    icon: Smartphone,
    title: 'Parent Portal',
    desc: 'Parents log in to see attendance, results, fee balances, and school updates in real time — no WhatsApp groups needed.',
    color: 'text-[#1f5b5e] bg-[#1f5b5e]/10',
  },
  {
    icon: Users,
    title: 'Staff Management',
    desc: 'Invite staff by email with role-based permissions. School admin, headteacher, teachers, accountants — each sees only what they need.',
    color: 'text-[#2d7a4f] bg-[#2d7a4f]/10',
  },
  {
    icon: GraduationCap,
    title: 'Student Records',
    desc: 'Complete learner profiles: guardian contacts, admission history, class transfers, exam results, and CBC report card archive.',
    color: 'text-[#8a6020] bg-[#8a6020]/10',
  },
  {
    icon: BookOpen,
    title: 'Exams & Results',
    desc: 'Create exams, enter scores in bulk, and auto-generate grade summaries. Results feed directly into CBC report card generation.',
    color: 'text-[#1f5b5e] bg-[#1f5b5e]/10',
  },
  {
    icon: Bus,
    title: 'Transport',
    desc: 'Assign students to transport routes, manage pickups, and keep route operations visible to the school office.',
    color: 'text-[#2d7a4f] bg-[#2d7a4f]/10',
  },
];

function Features() {
  return (
    <section className="bg-[#f7f5f0] py-20 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0d1f10] tracking-tight">
            Everything your school needs
          </h2>
          <p className="mt-3 text-[#4a5e50] max-w-lg mx-auto">
            One platform. All modules. No add-ons to unlock — every school gets the full system.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div key={title} className="group bg-white rounded-2xl border border-[#ddd8d0] p-6 hover:shadow-md hover:border-[#1f5b5e]/30 transition-all duration-200">
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4 ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-[#0d1f10] mb-2">{title}</h3>
              <p className="text-[#4a5e50] text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Testimonials ───────────────────────────────────────────────────────────────
function Testimonials() {
  const quotes = [
    {
      body: "End of term used to take our secretarial staff three full days just for report cards. Now the class teacher clicks a button and they're done before lunch.",
      name: 'Head Teacher',
      school: 'Primary school, Nairobi County',
    },
    {
      body: "We were tracking fees on a shared Excel sheet. Balances were always wrong. DiraSchool gives every parent their own portal and the numbers are always right.",
      name: 'School Bursar',
      school: 'Academy, Kiambu County',
    },
    {
      body: "Parents used to call the office asking for results. Now they check the portal themselves. It's cut our admin calls by more than half.",
      name: 'Deputy Principal',
      school: 'Secondary school, Mombasa',
    },
  ];

  return (
    <section className="bg-white py-20 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[#1f5b5e] text-xs font-bold uppercase tracking-widest mb-3">From Kenyan schools</p>
          <h2 className="text-3xl font-bold text-[#0d1f10] tracking-tight">What school leaders are saying</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {quotes.map(({ body, name, school }) => (
            <div key={name} className="rounded-2xl border border-[#ddd8d0] bg-[#f7f5f0] p-7 space-y-4">
              <svg className="h-5 w-5 text-[#1f5b5e]/30" fill="currentColor" viewBox="0 0 32 32">
                <path d="M10 8C6.1 8 3 11.1 3 15v9h9v-9H6c0-2.2 1.8-4 4-4V8zm16 0c-3.9 0-7 3.1-7 7v9h9v-9h-6c0-2.2 1.8-4 4-4V8z" />
              </svg>
              <p className="text-[#4a5e50] text-sm leading-relaxed">{body}</p>
              <div className="pt-1">
                <p className="text-sm font-semibold text-[#0d1f10]">{name}</p>
                <p className="text-xs text-[#7a9080]">{school}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Product Preview ────────────────────────────────────────────────────────────
function ProductPreview() {
  return (
    <section className="bg-[#f7f5f0] py-24 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-[#1f5b5e] text-xs font-bold uppercase tracking-widest mb-3">The platform</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0d1f10] tracking-tight">
            Clean, fast, and built for busy staff
          </h2>
          <p className="mt-3 text-[#4a5e50] max-w-xl mx-auto text-sm leading-relaxed">
            No training required. Teachers take attendance on any phone. Admins generate CBC report cards in clicks.
            Everything is real-time, everything is connected.
          </p>
        </div>

        {/* App mockup — kept dark to reflect the actual app UI */}
        <div className="relative rounded-2xl border border-[#ddd8d0] overflow-hidden bg-[#161a18] shadow-xl shadow-black/15">
          {/* Browser bar */}
          <div className="flex items-center gap-1.5 px-4 py-3 bg-[#1a1e1b] border-b border-white/8">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400/50" />
            <div className="ml-3 h-5 max-w-xs bg-white/5 rounded text-[11px] text-[#6b7870] flex items-center px-3">
              app.diraschool.com/report-cards
            </div>
          </div>

          <div className="flex" style={{ height: '390px' }}>
            {/* Sidebar */}
            <div className="hidden sm:flex w-52 shrink-0 border-r border-white/8 bg-white/[0.015] flex-col p-3 gap-0.5">
              <div className="flex items-center gap-2 px-2 py-3 mb-1">
                <BrandLogo className="w-6 h-6 shrink-0" />
                <span className="text-[#f7f5f0] text-sm font-bold">Diraschool</span>
              </div>
              {[
                ['Dashboard', false],
                ['Students', false],
                ['Attendance', false],
                ['Report Cards', true],
                ['Fees', false],
                ['Staff', false],
                ['Exams', false],
              ].map(([label, active]) => (
                <div key={label}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs ${active ? 'bg-[#1f5b5e]/30 text-[#5bb3b9] font-medium' : 'text-[#6b7870]'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-[#5bb3b9]' : 'bg-[#3a4440]'}`} />
                  {label}
                </div>
              ))}
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0 overflow-hidden p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] text-[#6b7870] uppercase tracking-widest mb-0.5">Academics</p>
                  <h3 className="text-[#f7f5f0] font-semibold text-lg">Report Cards</h3>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-7 px-3 rounded-lg bg-white/5 text-[#8a9590] text-xs flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded bg-[#3a4440] shrink-0" />Filter
                  </div>
                  <div className="h-7 px-3 rounded-lg bg-[#1f5b5e] text-white text-xs flex items-center gap-1 font-medium">
                    + Generate
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total', val: '143' },
                  { label: 'Published', val: '89', color: 'text-[#4ade80]' },
                  { label: 'Draft', val: '54', color: 'text-[#fbbf24]' },
                  { label: 'Avg Grade', val: 'ME', color: 'text-[#5bb3b9]' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5">
                    <p className="text-[9px] text-[#6b7870] uppercase tracking-widest">{label}</p>
                    <p className={`text-xl font-bold font-mono tabular-nums mt-0.5 ${color ?? 'text-[#f7f5f0]'}`}>{val}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-white/8 overflow-hidden">
                <div className="bg-white/[0.04] px-3 py-2 grid grid-cols-5 gap-4 border-b border-white/8">
                  {['Student', 'Class', 'Term', 'Grade', 'Status'].map((h) => (
                    <span key={h} className="text-[9px] font-semibold uppercase tracking-widest text-[#6b7870]">{h}</span>
                  ))}
                </div>
                {[
                  ['Amani Kariuki', 'Grade 5A', 'Term 1', 'ME', 'published', 'text-[#4ade80]'],
                  ['Brian Odhiambo', 'Grade 5B', 'Term 1', 'EE', 'published', 'text-[#4ade80]'],
                  ['Cynthia Wanja', 'Grade 6A', 'Term 1', 'AE', 'draft', 'text-[#fbbf24]'],
                  ['David Mutua', 'Grade 4A', 'Term 1', 'BE', 'draft', 'text-[#fbbf24]'],
                  ['Esther Njoki', 'Grade 5A', 'Term 1', 'EE', 'published', 'text-[#4ade80]'],
                ].map(([name, cls, term, grade, status, statusColor]) => (
                  <div key={name} className="border-t border-white/5 px-3 py-2.5 grid grid-cols-5 gap-4 hover:bg-white/[0.02] transition-colors cursor-default">
                    <span className="text-[#ddd8d0] text-xs font-medium truncate">{name}</span>
                    <span className="text-[#8a9590] text-xs">{cls}</span>
                    <span className="text-[#6b7870] text-xs font-mono">{term}</span>
                    <span className={`text-xs font-bold ${grade === 'EE' ? 'text-[#4ade80]' : grade === 'ME' ? 'text-[#5bb3b9]' : grade === 'AE' ? 'text-[#fbbf24]' : 'text-[#f87171]'}`}>{grade}</span>
                    <span className={`text-xs ${statusColor}`}>{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid sm:grid-cols-3 gap-5">
          {[
            {
              label: 'Works on any device',
              desc: 'Teachers mark attendance on phones. Office staff manage records on laptops. Same data, everywhere, in real time.',
            },
            {
              label: 'CBC report cards in 2 minutes',
              desc: 'Select a class, click Generate. All 40 CBC report cards are ready to print — formatted and signed-off.',
            },
            {
              label: 'Everything in sync',
              desc: 'Fees, marks, and attendance update live. No end-of-week consolidation. No missing registers.',
            },
          ].map(({ label, desc }) => (
            <div key={label} className="rounded-xl border border-[#ddd8d0] bg-white px-5 py-5">
              <div className="w-6 h-6 rounded-lg bg-[#1f5b5e]/15 border border-[#1f5b5e]/25 mb-3" />
              <h3 className="text-[#0d1f10] text-sm font-semibold mb-1.5">{label}</h3>
              <p className="text-[#4a5e50] text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How it works ───────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Register your school',
      desc: 'Sign up in under 5 minutes. Enter your school name and details — no IT team or server setup required. Your 30-day free trial starts immediately.',
    },
    {
      n: '02',
      title: 'Import students & staff',
      desc: 'Upload your student list via CSV or add learners one by one. Invite teaching and admin staff by email with their assigned roles and permissions.',
    },
    {
      n: '03',
      title: 'Go digital from day one',
      desc: 'Take attendance on any device, record fees as they come in, generate CBC report cards, and let parents access everything through their own portal.',
    },
  ];

  return (
    <section className="bg-white py-20 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0d1f10] tracking-tight">
            Up and running in one afternoon
          </h2>
          <p className="mt-3 text-[#4a5e50] max-w-lg mx-auto">
            No implementation project. No consultant. No waiting.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.n} className="relative">
              <div className="text-6xl font-black text-[#1f5b5e]/15 leading-none mb-4 select-none">{step.n}</div>
              <h3 className="text-lg font-bold text-[#0d1f10] mb-2">{step.title}</h3>
              <p className="text-[#4a5e50] text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing teaser ─────────────────────────────────────────────────────────────
function PricingTeaser() {
  return (
    <section className="bg-[#1f5b5e] py-16 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <div className="rounded-2xl bg-white/10 border border-white/20 p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-8">
          <div className="flex-1">
            <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-3">Simple pricing</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              KES 12,000 base +<br className="hidden sm:block" /> KES 55 per student per term
            </h2>
            <p className="mt-3 text-white/70 text-sm leading-relaxed max-w-md">
              Plus 16% VAT, billed 3 times a year when you collect fees.
              Annual billing saves 10%. No hidden costs, ever.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs">
              {['Annual billing: 10% off', 'Simple receipts provided', 'All features included', 'No student limits'].map((t) => (
                <span key={t} className="flex items-center gap-1.5 text-white/70">
                  <Check className="h-3 w-3 text-white/90 shrink-0" />{t}
                </span>
              ))}
            </div>
          </div>
          <div className="shrink-0 flex flex-col gap-3 w-full sm:w-auto">
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-[#1f5b5e] font-semibold shadow-lg transition-all duration-150 active:scale-[0.98] hover:bg-[#f7f5f0] text-sm"
            >
              Calculate my price <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-white/30 text-white hover:bg-white/10 transition-all text-sm font-medium"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────────────────
function FAQSection() {
  return (
    <section className="bg-[#f7f5f0] py-20 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[#0d1f10] tracking-tight">Common questions</h2>
          <p className="mt-3 text-[#4a5e50]">Everything you need to know before signing up.</p>
        </div>
        <LandingFAQ />
      </div>
    </section>
  );
}

// ── Final CTA ──────────────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-[#1f5b5e] py-28 px-4 sm:px-6 text-center">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-white/5 rounded-full blur-3xl" />
      </div>
      <div className="relative max-w-2xl mx-auto">
        <h2 className="text-4xl sm:text-5xl font-bold text-white tracking-tight leading-tight">
          Your school deserves<br /> better tools
        </h2>
        <p className="mt-5 text-white/70 text-lg leading-relaxed">
          Join Kenyan schools already running on DiraSchool. Full CBC compliance, no setup fee, 30 days free.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-white text-[#1f5b5e] font-bold shadow-xl hover:bg-[#f7f5f0] transition-all duration-150 active:scale-[0.98] text-base"
          >
            Start your free trial <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="mailto:admin@diraschool.com"
            className="text-white/60 hover:text-white transition-colors text-sm"
          >
            Questions? Email us →
          </a>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-6 text-xs text-white/60">
          {['30-day free trial', 'No credit card', 'Full CBC compliance', 'Unlimited students', 'Cancel any time'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <Check className="h-3 w-3 text-white/80" />{t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── About ──────────────────────────────────────────────────────────────────────
function AboutSection() {
  return (
    <section className="bg-white py-20 px-4 sm:px-6 border-t border-[#ede9e2]">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[#1f5b5e] text-xs font-semibold uppercase tracking-widest mb-3">About DiraSchool</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0d1f10] tracking-tight">
            Built in Kenya, for Kenyan schools
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-10 text-[#4a5e50] text-sm leading-relaxed">
          <div className="space-y-4">
            <p>
              DiraSchool was built by educators and engineers who saw firsthand how much time Kenyan school
              administrators lose to manual registers, paper fee records, and end-of-term report card marathons.
            </p>
            <p>
              We set out to build the simplest possible tool that handles the full admin loop — attendance,
              fees, CBC report cards, and the parent portal — without requiring expensive hardware, IT staff,
              or a steep learning curve.
            </p>
          </div>
          <div className="space-y-4">
            <p>
              Our pricing is intentionally transparent: a flat base fee plus a small per-student charge, so
              growing schools never face a sudden billing cliff. There are no hidden modules, no annual
              lock-in, and no surprise upgrades.
            </p>
            <p>
              We are a small, focused team headquartered in Nairobi. Every feature request, support email,
              and bug report lands directly with the people who wrote the code.
            </p>
            <p className="text-[#7a9080] text-xs pt-1">
              Questions?{' '}
              <a href="mailto:admin@diraschool.com" className="text-[#1f5b5e] hover:text-[#1a4e51] transition-colors underline underline-offset-2">
                admin@diraschool.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}


// ── Page ───────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-white">
        <MarketingNav />
        <Hero />
        <PaperworkSection />
        <Features />
        <Testimonials />
        <ProductPreview />
        <HowItWorks />
        <PricingTeaser />
        <FAQSection />
        <AboutSection />
        <FinalCTA />
      </div>
      <MarketingFooter />
    </>
  );
}
