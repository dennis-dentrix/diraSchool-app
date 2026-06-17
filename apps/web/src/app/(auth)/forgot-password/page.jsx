'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { authApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const schema = z.object({ email: z.string().email('Enter a valid email') });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: ({ email }) => authApi.forgotPassword(email),
    onSuccess: () => setSent(true),
    onError:   (err) => showApiError(err),
  });

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <CheckCircle2 className="h-10 w-10 text-ok" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            We sent a password reset link. The link expires in 1 hour.
          </p>
        </div>
        <Link href="/login">
          <Button className="w-full h-10 bg-foreground text-background hover:bg-foreground/90">
            Back to sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      {isPending && <div className="fixed inset-x-0 top-0 z-50 h-px bg-foreground" />}

      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-[32px] font-bold tracking-tight leading-none">Forgot password?</h1>
          <p className="text-muted-foreground text-sm">Enter your email and we'll send you a reset link</p>
        </div>

        <form onSubmit={handleSubmit(mutate)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" className="h-10" placeholder="you@school.ac.ke" {...register('email')} />
            {errors.email && <p className="text-xs text-bad">{errors.email.message}</p>}
          </div>
          <Button
            type="submit"
            className="w-full h-10 bg-foreground text-background hover:bg-foreground/90"
            disabled={isPending}
          >
            Send reset link
          </Button>
        </form>

        <div className="text-center">
          <Link href="/login" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3 w-3" /> Back to sign in
          </Link>
        </div>
      </div>
    </>
  );
}
