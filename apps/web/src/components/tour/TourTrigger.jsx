'use client';

import { useState, useEffect } from 'react';
import { Rocket, X, PlayCircle, Sparkles } from 'lucide-react';
import { useTourContext } from './TourProvider';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

const DISMISS_KEY = 'diraschool-tour-banner-dismissed';

function isBannerDismissed() {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}
function dismissBanner() {
  try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
}

// ── Getting Started banner ─────────────────────────────────────────────────────
export function TourBanner() {
  const { tourCompleted, launchTour } = useTourContext();
  const [dismissed, setDismissed] = useState(true); // start hidden, check after mount

  useEffect(() => {
    setDismissed(isBannerDismissed());
  }, []);

  if (tourCompleted || dismissed) return null;

  function handleDismiss() {
    dismissBanner();
    setDismissed(true);
  }

  return (
    <div className="relative flex items-center gap-4 rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50 via-indigo-50/60 to-purple-50/40 px-4 py-3.5 shadow-sm overflow-hidden">
      {/* Decorative blob */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-indigo-100/50 blur-2xl" />

      {/* Icon */}
      <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shrink-0 shadow-md shadow-blue-200">
        <Rocket className="h-4.5 w-4.5 h-[18px] w-[18px]" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-blue-900 text-sm leading-tight">
            Getting started with Diraschool
          </p>
          <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
        </div>
        <p className="text-blue-700/70 text-xs mt-0.5 hidden sm:block">
          A quick 2-minute tour — we'll show you exactly what matters for your role.
        </p>
      </div>

      {/* CTA */}
      <Button
        size="sm"
        className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white h-8 px-3.5 text-xs font-semibold shadow-sm shadow-blue-200 transition-all"
        onClick={launchTour}
      >
        <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
        Start tour
      </Button>

      {/* Dismiss */}
      <button
        className="shrink-0 text-blue-300 hover:text-blue-500 p-1 rounded-md transition-colors"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── "Take a Tour" menu item for the header profile dropdown ───────────────────
export function TakeTourMenuItem() {
  const { launchTour } = useTourContext();

  return (
    <DropdownMenuItem onClick={launchTour} data-tour="help-menu">
      <Rocket className="mr-2 h-4 w-4" />
      Take a tour
    </DropdownMenuItem>
  );
}
