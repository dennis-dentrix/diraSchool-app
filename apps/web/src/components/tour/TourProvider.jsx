'use client';

import { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { useTour, isTourLocallyDone, clearLocalTourFlag } from '@/hooks/useTour';
import { api } from '@/lib/api';

const TourContext = createContext(null);

const NOOP_CONTEXT = { tourCompleted: true, launchTour: () => {}, markCompleted: () => {} };

export function useTourContext() {
  const ctx = useContext(TourContext);
  return ctx ?? NOOP_CONTEXT;
}

export function TourProvider({ children }) {
  const { user } = useAuthStore();
  const role = user?.role;

  const { startTour } = useTour(role);

  const [tourCompleted, setTourCompleted] = useState(false);
  const [checkedServer, setCheckedServer] = useState(false);
  const autoLaunchFiredRef = useRef(false);

  // Check server-side status once user is loaded
  useEffect(() => {
    if (!user || !role || role === 'superadmin' || role === 'parent') {
      setCheckedServer(true);
      return;
    }

    // If locally marked done, skip the server check
    if (isTourLocallyDone()) {
      setTourCompleted(true);
      setCheckedServer(true);
      return;
    }

    api.get('/onboarding/status')
      .then((res) => {
        const done = res.data?.tour_completed ?? res.data?.data?.tour_completed ?? false;
        setTourCompleted(done);
        if (done) {
          // sync localStorage
          localStorage.setItem('diraschool-tour-completed', '1');
        }
      })
      .catch(() => {})
      .finally(() => setCheckedServer(true));
  }, [user?._id, role]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-launch once: after server check, if not done
  useEffect(() => {
    if (!checkedServer || tourCompleted || autoLaunchFiredRef.current) return;
    if (!user || !role || role === 'superadmin' || role === 'parent') return;

    autoLaunchFiredRef.current = true;

    // Small delay so the page has time to mount its elements
    const timer = setTimeout(() => {
      startTour();
    }, 1800);

    return () => clearTimeout(timer);
  }, [checkedServer, tourCompleted, user, role, startTour]);

  const launchTour = useCallback(() => {
    clearLocalTourFlag();
    startTour();
  }, [startTour]);

  const markCompleted = useCallback(() => {
    setTourCompleted(true);
  }, []);

  return (
    <TourContext.Provider value={{ tourCompleted, launchTour, markCompleted }}>
      {children}
    </TourContext.Provider>
  );
}
