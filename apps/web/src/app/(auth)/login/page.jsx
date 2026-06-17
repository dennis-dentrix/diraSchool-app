'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { authApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

function GoogleSignInButton({ onSuccess, disabled }) {
  const [loading, setLoading] = useState(false);

  const { mutate } = useMutation({
    mutationFn: (accessToken) => authApi.googleLogin(accessToken),
    onSuccess: (res) => { setLoading(false); onSuccess(res); },
    onError: (err) => { setLoading(false); showApiError(err); },
  });

  const signIn = useGoogleLogin({
    onSuccess: ({ access_token }) => mutate(access_token),
    onError: () => { setLoading(false); toast.error('Google sign-in was cancelled.'); },
    onNonOAuthError: () => { setLoading(false); toast.error('Could not open Google sign-in.'); },
  });

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full h-10 gap-2.5"
      disabled={loading || disabled}
      onClick={() => { setLoading(true); signIn(); }}
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
        </svg>
      ) : (
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      )}
      Continue with Google
    </Button>
  );
}

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const nextPath     = searchParams.get('next') || '/dashboard';
  const { setUser }  = useAuthStore();
  const queryClient  = useQueryClient();
  const [showPassword,    setShowPassword]    = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url         = new URL(window.location.href);
    const allowedNext = url.searchParams.get('next');
    const unsafeParams = [...url.searchParams.keys()].some((k) => k !== 'next');
    if (!unsafeParams) return;
    const clean = new URL('/login', window.location.origin);
    if (allowedNext) clean.searchParams.set('next', allowedNext);
    window.history.replaceState(null, '', clean.toString());
  }, []);

  const { register, handleSubmit, getValues, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  // Shared handler for post-auth token storage + redirect
  const handleAuthSuccess = (res) => {
    const user  = res.data.user  ?? res.data.data?.user;
    const token = res.data.token ?? res.data.data?.token;
    if (!user) { toast.error('Login failed: no user data received'); return; }
    if (token && typeof window !== 'undefined') {
      localStorage.setItem('authToken', token);
      localStorage.setItem('authTokenExpiry', String(Date.now() + 20 * 60 * 60 * 1000));
      document.cookie = `token=${token}; path=/; max-age=${20 * 60 * 60}; SameSite=Lax`;
    }
    setUser(user);
    queryClient.setQueryData(['auth', 'me'], user);
    if (user.role === 'parent') router.push('/portal');
    else if (user.role === 'superadmin') router.push('/superadmin');
    else router.push(nextPath);
  };

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => authApi.login(data),
    onSuccess: handleAuthSuccess,
    onError: (err) => {
      const status  = err.response?.status;
      const message = getErrorMessage(err);
      if (status === 403 && message.toLowerCase().includes('verify')) {
        setUnverifiedEmail(getValues('email'));
      } else {
        showApiError(err);
      }
    },
  });

  if (unverifiedEmail) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
            <MailCheck className="h-6 w-6 text-foreground" />
          </div>
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">Verify your email first</h2>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-foreground">{unverifiedEmail}</span>
          </p>
        </div>
        <Button
          className="w-full h-10 bg-foreground text-background hover:bg-foreground/90"
          onClick={() => router.push(`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`)}
        >
          Enter verification code
        </Button>
        <button
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          onClick={() => setUnverifiedEmail(null)}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <>
      {isPending && <div className="fixed inset-x-0 top-0 z-50 h-px bg-foreground" />}

      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-[32px] font-bold tracking-tight leading-none">Welcome back</h1>
          <p className="text-muted-foreground text-sm">Sign in to access your school dashboard</p>
        </div>

        <form onSubmit={handleSubmit(mutate)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@school.ac.ke"
              className="h-10"
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-bad">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-10 pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-bad">{errors.password.message}</p>}
          </div>

          <Button
            type="submit"
            className="w-full h-10 bg-foreground text-background hover:bg-foreground/90 mt-2"
            disabled={isPending}
          >
            Sign in
          </Button>
        </form>

        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <>
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground shrink-0">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <GoogleSignInButton onSuccess={handleAuthSuccess} disabled={isPending} />
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          New school?{' '}
          <Link href="/register" className="font-medium text-foreground hover:underline underline-offset-2">
            Register here
          </Link>
        </p>
      </div>
    </>
  );
}
