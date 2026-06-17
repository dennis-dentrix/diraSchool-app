'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { adminApi } from '@/lib/api';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';

export default function SuperadminLayout({ children }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: inquiryStats } = useQuery({
    queryKey: ['inquiry-stats'],
    queryFn: () => adminApi.inquiryStats().then((r) => r.data.data),
    enabled: !!user && user.role === 'superadmin',
    refetchInterval: 60_000,
  });

  const badges = inquiryStats?.pendingCount > 0
    ? { '/superadmin/inquiries': inquiryStats.pendingCount }
    : {};

  useEffect(() => {
    if (!isLoading && user && user.role !== 'superadmin') {
      router.replace('/dashboard');
    }
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'superadmin') return null;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar user={user} badges={badges} />
      </div>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar user={user} badges={badges} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Header user={user} onMenuClick={() => setMobileOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
