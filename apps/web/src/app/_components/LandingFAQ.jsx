'use client';

import { useState } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const FAQS = [
  {
    q: 'Is DiraSchool built for the CBC curriculum?',
    a: 'Yes — every feature is designed around CBC. Report cards cover all 7 learning areas with the correct grade descriptors (Exceeds, Meets, Approaches, Below). Attendance, timetable, and subject management all align with CBC structure.',
  },
  {
    q: 'How does pricing work?',
    a: 'You pay KES 12,000 base fee plus KES 55 per enrolled student per term, plus 16% VAT. Annual billing saves 10% and multi-year billing saves 15%. No hidden charges beyond the published formula. Schools with signed agreements can have custom pricing terms.',
  },
  {
    q: 'Can parents see their children\'s results and fees?',
    a: "Yes. The parent portal gives guardians real-time access to their child's attendance record, exam results, fee balances, and published report cards. Parents log in with their own credentials — no app download needed.",
  },
  {
    q: 'How long does setup take?',
    a: 'Most schools are fully set up in under a day. You can import students via CSV, invite staff by email, and set up classes and subjects in minutes. Our onboarding guide walks you through each step.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Your data remains accessible for 30 days after cancellation so you can export everything. We provide full CSV and PDF exports. After 30 days, data is permanently deleted from our servers.',
  },
  {
    q: 'Is the 30-day trial really free?',
    a: 'Yes — full access to every feature, unlimited students, no credit card required. At the end of your trial, your data is retained for 14 days while you decide to continue.',
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="w-full flex items-center justify-between py-5 text-left group">
        <span className="font-semibold text-[#0d1f10] pr-8 group-hover:text-[#1f5b5e] transition-colors">
          {q}
        </span>
        <ChevronDown className={cn(
          'h-4 w-4 text-[#7a9080] shrink-0 transition-transform duration-200',
          open && 'rotate-180',
        )} />
      </Collapsible.Trigger>
      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0">
        <p className="pb-5 text-[#4a5e50] leading-relaxed text-sm sm:text-base">{a}</p>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export default function LandingFAQ() {
  return (
    <div className="rounded-2xl bg-white border border-[#ddd8d0] divide-y divide-[#ede9e2] px-6 sm:px-8">
      {FAQS.map((faq) => (
        <FAQItem key={faq.q} {...faq} />
      ))}
    </div>
  );
}
