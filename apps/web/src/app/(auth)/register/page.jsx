'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const kenyaPhoneRegex = /^(\+254|0|254)?[17]\d{8}$/;

const schema = z.object({
  firstName:  z.string().min(1, 'First name is required'),
  lastName:   z.string().min(1, 'Last name is required'),
  schoolName: z.string().min(3, 'School name must be at least 3 characters'),
  email:      z.string().email('Enter a valid email address'),
  phone:      z.string().trim().regex(kenyaPhoneRegex, 'Enter a valid Kenyan phone number'),
  message:    z.string().optional(),
});

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => api.post('/contact', data),
    onSuccess: () => setSubmitted(true),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (submitted) {
    return (
      <div className="space-y-4 text-center py-4">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">Request received</h1>
          <p className="text-muted-foreground text-sm">
            We'll be in touch within 24 hours to set up your school.
          </p>
        </div>
        <p className="text-sm text-muted-foreground pt-2">
          Questions?{' '}
          <a href="mailto:admin@diraschool.com" className="font-medium text-foreground hover:underline underline-offset-2">
            admin@diraschool.com
          </a>
        </p>
      </div>
    );
  }

  return (
    <>
      {isPending && <div className="fixed inset-x-0 top-0 z-50 h-px bg-foreground" />}

      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="font-display text-[32px] font-bold tracking-tight leading-none">Get started</h1>
          <p className="text-muted-foreground text-sm">
            Tell us about your school and we'll set you up within 24 hours.
          </p>
        </div>

        <form onSubmit={handleSubmit(mutate)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" className="h-10" placeholder="John" {...register('firstName')} />
              {errors.firstName && <p className="text-xs text-bad">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" className="h-10" placeholder="Doe" {...register('lastName')} />
              {errors.lastName && <p className="text-xs text-bad">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schoolName">School name</Label>
            <Input id="schoolName" className="h-10" placeholder="Nairobi Primary School" {...register('schoolName')} />
            {errors.schoolName && <p className="text-xs text-bad">{errors.schoolName.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" className="h-10" placeholder="principal@school.ac.ke" {...register('email')} />
            {errors.email && <p className="text-xs text-bad">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" type="tel" className="h-10" placeholder="0712 345 678" {...register('phone')} />
            {errors.phone && <p className="text-xs text-bad">{errors.phone.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message">
              Anything else we should know{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="message"
              className="min-h-[80px] resize-none"
              placeholder="Number of students, current system you're using, when you want to start..."
              {...register('message')}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-10 bg-foreground text-background hover:bg-foreground/90 mt-2"
            disabled={isPending}
          >
            {isPending ? 'Sending...' : 'Request access'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-foreground hover:underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}
