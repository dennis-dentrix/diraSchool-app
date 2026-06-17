'use client';

import { useRouter, useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { authApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const schema = z.object({
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export default function AcceptInvitePage() {
  const params        = useParams();
  const token         = Array.isArray(params?.token) ? params.token[0] : params?.token;
  const tokenTail     = token ? token.slice(-8) : '';
  const router        = useRouter();
  const { setUser }   = useAuthStore();
  const [showPwd,     setShowPwd]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: ({ confirmPassword, ...data }) => authApi.acceptInvite(token, data),
    onSuccess: (res) => {
      const user  = res.data?.user  ?? res.data?.data?.user  ?? null;
      const token = res.data?.token ?? res.data?.data?.token ?? null;
      if (token) {
        localStorage.setItem('authToken', token);
        localStorage.setItem('authTokenExpiry', String(Date.now() + 20 * 60 * 60 * 1000));
        document.cookie = `token=${token}; path=/; max-age=${20 * 60 * 60}; SameSite=Lax`;
      }
      setUser(user);
      toast.success('Account activated! Welcome.');
      router.push('/dashboard');
    },
    onError: (err) => showApiError(err),
  });

  return (
    <>
      {isPending && <div className="fixed inset-x-0 top-0 z-50 h-px bg-foreground" />}

      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-[32px] font-bold tracking-tight leading-none">Activate your account</h1>
          <p className="text-muted-foreground text-sm">
            Your name has been set by your administrator. Create a password to get started.
          </p>
          {tokenTail && (
            <p className="text-xs font-mono text-muted-foreground/50 pt-1">invite: …{tokenTail}</p>
          )}
        </div>

        <form onSubmit={handleSubmit(mutate)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Create password</Label>
            <div className="relative">
              <Input id="password" type={showPwd ? 'text' : 'password'} className="h-10 pr-10" placeholder="Min. 8 characters" {...register('password')} />
              <button type="button" onClick={() => setShowPwd((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-bad">{errors.password.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <Input id="confirmPassword" type={showConfirm ? 'text' : 'password'} className="h-10 pr-10" placeholder="••••••••" {...register('confirmPassword')} />
              <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && <p className="text-xs text-bad">{errors.confirmPassword.message}</p>}
          </div>

          <Button
            type="submit"
            className="w-full h-10 bg-foreground text-background hover:bg-foreground/90"
            disabled={isPending || !token}
          >
            Activate account
          </Button>
        </form>
      </div>
    </>
  );
}
