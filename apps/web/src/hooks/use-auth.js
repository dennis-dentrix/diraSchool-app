'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

function isTokenExpired() {
  if (typeof window === 'undefined') return false;
  const expiry = localStorage.getItem('authTokenExpiry');
  if (!expiry) return false;
  return Date.now() > Number(expiry);
}

export function useAuth() {
  const { user, isLoading, setUser, setLoading } = useAuthStore();

  const { data, isLoading: queryLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await authApi.me();
      return res.data.data?.user ?? res.data.user ?? null;
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Proactively log out when the token has expired — checked on mount and
  // whenever the user returns to the tab, so they aren't stuck in a broken state.
  useEffect(() => {
    const check = () => {
      if (!isTokenExpired()) return;
      localStorage.removeItem('authToken');
      localStorage.removeItem('authTokenExpiry');
      document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
      window.location.href = '/login';
    };
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  useEffect(() => {
    if (queryLoading) {
      setLoading(true);
      return;
    }

    // Query succeeded: sync user from server (could be null = not authenticated)
    if (!isError) {
      setUser(data ?? null);
      return;
    }

    // Query errored (401 = not authenticated). Clear all auth state and the
    // same-domain cookie so the middleware stops redirecting back to /dashboard.
    localStorage.removeItem('authToken');
    localStorage.removeItem('authTokenExpiry');
    document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
    setUser(null);
  }, [data, queryLoading, isError, setUser, setLoading]);

  return {
    user: user ?? data ?? null,
    isLoading: queryLoading || isLoading,
    isAuthenticated: !!(user ?? data),
  };
}

export function useLogout() {
  const { logout } = useAuthStore();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    // Clear locally and redirect immediately — no need to wait for the API
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authTokenExpiry');
      document.cookie = 'token=; path=/; max-age=0; SameSite=Lax';
    }
    logout();
    queryClient.clear();
    window.location.href = '/login';
    // Fire-and-forget: clears the server-side cookie on Render (non-blocking)
    authApi.logout().catch(() => {});
  };

  // Return both shapes so callers can use either:
  //   const { logout } = useLogout()   ← object destructure
  //   const logout = useLogout()        ← direct call (wrong usage, but handled)
  return { logout: handleLogout };
}
