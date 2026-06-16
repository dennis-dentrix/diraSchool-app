import Link from 'next/link';
import { BrandLogo } from '@/components/shared/brand-logo';

export function MarketingNav() {
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
