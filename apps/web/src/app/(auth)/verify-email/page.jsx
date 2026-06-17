'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { authApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';

export default function VerifyEmailPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const email        = searchParams.get('email') || '';
  const { setUser }  = useAuthStore();

  const [digits,          setDigits]          = useState(['', '', '', '', '', '']);
  const [resendCooldown,  setResendCooldown]  = useState(0);
  const refs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const { mutate: verify, isPending } = useMutation({
    mutationFn: (code) => authApi.verifyEmail(email, code),
    onSuccess: (res) => {
      const user  = res.data.user  ?? res.data.data?.user;
      const token = res.data.token ?? res.data.data?.token;
      if (token) {
        localStorage.setItem('authToken', token);
        localStorage.setItem('authTokenExpiry', String(Date.now() + 20 * 60 * 60 * 1000));
        document.cookie = `token=${token}; path=/; max-age=${20 * 60 * 60}; SameSite=Lax`;
      }
      setUser(user);
      toast.success('Email verified! Welcome to Diraschool.');
      if (user?.role === 'parent')     router.push('/portal');
      else if (user?.role === 'superadmin') router.push('/superadmin');
      else router.push('/dashboard');
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: resend, isPending: resending } = useMutation({
    mutationFn: () => authApi.resendVerification(email),
    onSuccess: () => {
      toast.success('New code sent — check your inbox.');
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      refs[0].current?.focus();
    },
    onError: (err) => showApiError(err),
  });

  function handleDigit(index, value) {
    if (value.length === 6 && /^\d{6}$/.test(value)) {
      const arr = value.split('');
      setDigits(arr);
      refs[5].current?.focus();
      verify(value);
      return;
    }
    const char = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    if (char && index < 5) refs[index + 1].current?.focus();
    if (next.every((d) => d !== '') && next.join('').length === 6) verify(next.join(''));
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) refs[index - 1].current?.focus();
  }

  const code   = digits.join('');
  const masked = email.replace(/(.{2}).+(@.+)/, '$1…$2');

  return (
    <>
      {isPending && <div className="fixed inset-x-0 top-0 z-50 h-px bg-foreground" />}

      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-11 h-11 rounded-full bg-muted">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="font-display text-[32px] font-bold tracking-tight leading-none">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to{' '}
              <span className="font-medium text-foreground">{masked || 'your email'}</span>
            </p>
          </div>
        </div>

        {/* OTP boxes */}
        <div className="flex justify-center gap-2">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={refs[i]}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={digit}
              autoFocus={i === 0}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className={`
                w-11 h-12 text-center text-xl font-bold font-mono rounded-md border-2 outline-none transition-all
                ${digit ? 'border-foreground bg-muted/30' : 'border-input bg-background'}
                focus:border-foreground focus:ring-2 focus:ring-foreground/10
              `}
            />
          ))}
        </div>

        <Button
          className="w-full h-10 bg-foreground text-background hover:bg-foreground/90"
          onClick={() => code.length === 6 && verify(code)}
          disabled={isPending || code.length < 6}
        >
          Verify email
        </Button>

        <div className="text-center text-sm text-muted-foreground space-y-2">
          <p>
            Didn't receive the code?{' '}
            {resendCooldown > 0 ? (
              <span>Resend in {resendCooldown}s</span>
            ) : (
              <button
                onClick={() => resend()}
                disabled={resending}
                className="font-medium text-foreground hover:underline underline-offset-2 disabled:opacity-50"
              >
                Resend code
              </button>
            )}
          </p>
          <p className="text-xs">
            Code expires in 30 minutes.{' '}
            <button onClick={() => router.push('/login')} className="hover:underline">
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
