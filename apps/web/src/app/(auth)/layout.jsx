import { Suspense } from 'react';
import { BrandLogo } from '@/components/shared/brand-logo';

export const metadata = {
  title: {
    default: 'Sign In — DiraSchool',
    template: '%s — DiraSchool',
  },
  description: 'Sign in to DiraSchool to manage your CBC school — attendance, fees, report cards, and parent communication.',
  robots: { index: false, follow: false },
};

const FEATURES = [
  'CBC-aligned assessment & report cards',
  'M-Pesa fee collection & reconciliation',
  'SMS parent notifications',
  'Attendance with geo-fencing',
  'Timetable & lesson plans',
  'Multi-role staff access',
];

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-background flex relative">
      {/* Brand mark — top-left of viewport */}
      <div className="absolute top-6 left-6 flex items-center gap-2 z-10">
        <BrandLogo className="w-8 h-8" />
        <span className="font-display font-bold text-sm tracking-tight">Diraschool</span>
      </div>

      {/* Form column */}
      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-[360px]">
          <Suspense fallback={null}>
            {children}
          </Suspense>
        </div>
      </div>

      {/* Marketing strip — hidden below md */}
      <aside className="hidden md:flex w-[420px] shrink-0 border-l bg-muted/20 flex-col justify-center px-12 py-16 gap-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            CBC School Management
          </p>
          <h2 className="font-display text-2xl font-bold tracking-tight leading-snug">
            Everything your school needs, in one place.
          </h2>
          <p className="text-muted-foreground text-sm mt-3 leading-relaxed">
            Trusted by Kenyan schools to manage fees, academics, staff, and parents — built for the CBC curriculum.
          </p>
        </div>

        <ul className="space-y-2.5">
          {FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-ok/15 flex items-center justify-center">
                <span className="block h-1.5 w-1.5 rounded-full bg-ok" />
              </span>
              {f}
            </li>
          ))}
        </ul>

        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm italic text-muted-foreground leading-relaxed">
            "Diraschool cut our fee collection follow-ups by half and our parents love the SMS receipts."
          </p>
          <p className="text-xs font-medium mt-2">— School Administrator, Nairobi</p>
        </div>
      </aside>
    </div>
  );
}
