import Link from 'next/link';
import { BrandLogo } from '@/components/shared/brand-logo';

export function MarketingFooter() {
  return (
    <footer className="bg-[#0d1f10] border-t border-white/8 py-12 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pb-10 border-b border-white/8">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <BrandLogo className="w-7 h-7" />
              <span className="text-white font-bold text-sm">Diraschool</span>
            </div>
            <p className="text-white/40 text-xs leading-relaxed max-w-[200px]">
              CBC school management for Kenyan schools.
            </p>
          </div>
          <div>
            <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-4">Product</p>
            <ul className="space-y-2.5 text-xs text-white/40">
              {[['Features', '/#features'], ['Pricing', '/pricing'], ['Start Free Trial', '/register']].map(([label, href]) => (
                <li key={label}><Link href={href} className="hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-4">Resources</p>
            <ul className="space-y-2.5 text-xs text-white/40">
              {[['Blog', '/blog'], ['Sign in', '/login'], ['Register school', '/register']].map(([label, href]) => (
                <li key={label}><Link href={href} className="hover:text-white transition-colors">{label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-white/40 text-xs font-semibold uppercase tracking-widest mb-4">Contact</p>
            <ul className="space-y-2.5 text-xs text-white/40">
              <li>
                <a href="mailto:admin@diraschool.com" className="hover:text-white transition-colors">
                  admin@diraschool.com
                </a>
              </li>
              <li>
                <a href="tel:+254115879589" className="hover:text-white transition-colors">
                  +254 115 879 589
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/30">
          <p>© {new Date().getFullYear()} DiraSchool. Built in Kenya 🇰🇪</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white/60 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white/60 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
