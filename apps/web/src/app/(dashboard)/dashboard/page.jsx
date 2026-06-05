'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle, AlertTriangle, ArrowRight, BookOpen, Calendar,
  CalendarCheck, CheckCircle2, Clock, CreditCard, Wallet,
  FileText, Plus, Smartphone, TrendingUp, Users, UserPlus,
  Bell, ClipboardList, X, Rocket,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { dashboardApi, settingsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatCurrency, formatDate, feeColor } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/shared/refresh-button';
import { StatCard } from '@/components/shared/stat-card';
import { SectionCard } from '@/components/shared/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckInWidget } from '@/components/shared/check-in-widget';
import { AddEventButton } from '@/components/shared/add-event-button';
import { cn } from '@/lib/utils';

// ── Role groups ───────────────────────────────────────────────────────────────

const ADMIN_ROLES   = ['school_admin', 'director', 'headteacher', 'deputy_headteacher'];
const TEACHER_ROLES = ['teacher', 'department_head'];

const METHOD_LABELS = {
  cash:          'Cash',
  mpesa:         'M-Pesa',
  cheque:        'Cheque',
  bank_transfer: 'Bank Transfer',
  bank:          'Bank',
};

// ── Shared primitives ─────────────────────────────────────────────────────────

/** Left-rail card for admin — date + fee big number + actions */
function TodayRail({
  dateLabel, feeCollectionPct, totalCollected, totalTarget,
  studentsOverdue, termWeek, termTotalWeeks, router,
}) {
  return (
    <div className="space-y-3">
      {/* Date display */}
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">Today</p>
        <p className="font-display text-base font-semibold text-foreground">{dateLabel}</p>
        {termWeek != null && termTotalWeeks != null && (
          <p className="text-xs text-muted-foreground mt-0.5 font-mono tabular-nums">
            Week {termWeek} of {termTotalWeeks}
          </p>
        )}
      </div>

      {/* Fee big number */}
      <div className="rounded-lg border border-border bg-card px-4 py-4">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Term Collection</p>
        <p className={cn(
          'font-mono text-5xl font-bold tabular-nums leading-none',
          feeCollectionPct >= 80 ? 'text-ok' : feeCollectionPct >= 50 ? 'text-warn' : 'text-bad',
        )}>
          {feeCollectionPct}%
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {formatCurrency(totalCollected)} of {formatCurrency(totalTarget)}
        </p>
        {/* Segmented progress bar */}
        <div className="mt-3 h-2 rounded-full bg-border overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              feeCollectionPct >= 80 ? 'bg-ok' : feeCollectionPct >= 50 ? 'bg-warn' : 'bg-bad',
            )}
            style={{ width: `${Math.min(100, feeCollectionPct)}%` }}
          />
        </div>
        {studentsOverdue > 0 && (
          <button
            type="button"
            onClick={() => router.push('/fees')}
            className="mt-2 text-xs text-warn hover:underline text-left"
          >
            {studentsOverdue} students overdue →
          </button>
        )}
      </div>

      {/* Primary actions */}
      <div className="space-y-2">
        <Button className="w-full justify-start gap-2" onClick={() => router.push('/fees/payments')}>
          <CreditCard className="h-4 w-4 shrink-0" /> Record Payment
        </Button>
        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => router.push('/students')}>
          <UserPlus className="h-4 w-4 shrink-0" /> Enroll Student
        </Button>
        <Button variant="outline" className="w-full justify-start gap-2" onClick={() => router.push('/attendance')}>
          <CalendarCheck className="h-4 w-4 shrink-0" /> Attendance
        </Button>
      </div>
    </div>
  );
}

function CollectionProgressBar({ collected, target, percent }) {
  const { bar, text } = feeColor(percent);
  return (
    <div className="rounded-lg border border-border bg-card px-3 sm:px-4 md:px-6 py-3 sm:py-4">
      <div className="flex items-center justify-between mb-3 flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Term Fee Collection</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatCurrency(collected)} collected of {formatCurrency(target)} target
          </p>
        </div>
        <span className={cn('font-mono text-2xl font-bold tabular-nums', text)}>{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className={cn('h-2 rounded-full transition-all duration-500', bar)} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

function UpcomingEventsCard({ events = [], pastEvents = [] }) {
  return (
    <SectionCard
      title="Upcoming Events"
      icon={Clock}
      action={
        <div className="flex items-center gap-3">
          <AddEventButton label="Add" />
          <Link href="/settings" className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">Manage</Link>
        </div>
      }
    >
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev._id} className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{ev.name}</p>
                {ev.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{ev.description}</p>}
              </div>
              <Badge variant="outline" className="shrink-0 text-xs font-mono tabular-nums">{formatDate(ev.date)}</Badge>
            </div>
          ))}
          {pastEvents.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Recent</p>
              {pastEvents.map((ev) => (
                <div key={ev._id} className="flex items-center justify-between gap-3 py-1.5 opacity-60">
                  <p className="text-xs text-foreground">{ev.name}</p>
                  <span className="text-xs text-muted-foreground shrink-0">{formatDate(ev.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="py-6 text-center">
          <p className="text-sm text-muted-foreground">No upcoming events scheduled.</p>
          <Link href="/settings" className="mt-1 text-xs text-primary hover:underline">Add an event</Link>
        </div>
      )}
    </SectionCard>
  );
}

function FeeByClassCard({ byClass = {} }) {
  if (!Object.keys(byClass).length) return (
    <SectionCard title="Fee Status by Class" icon={Wallet}>
      <p className="text-sm text-muted-foreground">No fee data available.</p>
    </SectionCard>
  );
  return (
    <SectionCard
      title="Fee Status by Class"
      icon={Wallet}
      action={
        <Link href="/fees/payments" className="text-xs font-medium text-bad hover:underline flex items-center gap-1">
          View overdue <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="space-y-3">
        {Object.entries(byClass)
          .sort(([, a], [, b]) => a.percent - b.percent)
          .map(([className, d]) => {
            const { bar, text } = feeColor(d.percent);
            return (
              <div key={className}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-sm font-medium text-foreground">{className}</p>
                  <p className={cn('text-xs font-semibold font-mono tabular-nums', text)}>{d.percent}% paid</p>
                </div>
                <div className="h-1.5 rounded-full bg-border" role="progressbar" aria-valuenow={d.percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className={cn('h-1.5 rounded-full transition-all', bar)} style={{ width: `${Math.min(100, d.percent)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.paidCount}/{d.total} students
                  {d.collected != null ? ` · ${formatCurrency(d.collected)} collected` : ''}
                </p>
              </div>
            );
          })}
      </div>
    </SectionCard>
  );
}

function AdminWorkQueue({ tasks = [] }) {
  return (
    <SectionCard title="Needs Attention" icon={Bell}>
      {tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.slice(0, 6).map((task) => {
            const Icon = task.icon;
            const styles = {
              high:   'border-bad/30 bg-bad/5 text-bad',
              medium: 'border-warn/30 bg-warn/5 text-warn',
              low:    'border-border bg-muted/30 text-muted-foreground',
            }[task.priority] ?? 'border-border bg-muted/30 text-muted-foreground';

            return (
              <button
                key={`${task.href}-${task.title}`}
                type="button"
                onClick={() => task.onClick?.()}
                className={cn('w-full rounded-md border p-3 text-left transition hover:opacity-80', styles)}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{task.title}</p>
                      <span className="shrink-0 text-xs font-medium">{task.cta}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{task.detail}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-md border border-ok/30 bg-ok/5 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
          <div>
            <p className="text-sm font-semibold text-foreground">No urgent issues</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Students, fees, staff, and check-in look ready.</p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function RecentPaymentsCard({ payments = [] }) {
  return (
    <SectionCard
      title="Recent Collections"
      icon={CreditCard}
      action={<Link href="/fees/payments" className="text-xs font-medium text-primary hover:underline">View all</Link>}
    >
      {payments.length > 0 ? (
        <div className="divide-y divide-border">
          {payments.slice(0, 5).map((payment, i) => (
            <div
              key={payment.receiptNumber ?? `${payment.name}-${i}`}
              className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{payment.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {METHOD_LABELS[payment.method] ?? payment.method}
                  {payment.date || payment.time ? ` · ${[payment.date, payment.time].filter(Boolean).join(' ')}` : ''}
                </p>
              </div>
              <div className="ml-3 shrink-0 text-right">
                <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{formatCurrency(payment.amount)}</p>
                {payment.receiptNumber && <p className="text-[10px] text-muted-foreground font-mono">{payment.receiptNumber}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center">
          <p className="text-sm text-muted-foreground">No recent collections yet.</p>
          <Link href="/fees/payments" className="mt-1 inline-flex text-xs text-primary hover:underline">
            Record the first payment
          </Link>
        </div>
      )}
    </SectionCard>
  );
}

// ── Onboarding Checklist ──────────────────────────────────────────────────────

function SetupChecklist({ schoolId, totalStudents, staffCount, classCount, hasFees }) {
  const key = `setup_dismissed_${schoolId}`;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(localStorage.getItem(key) === '1');
    }
  }, [key]);

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(key, '1');
    setDismissed(true);
  };

  const steps = [
    { label: 'Add staff',            hint: 'Create teacher and operations staff accounts first', href: '/staff',           done: staffCount > 1                    },
    { label: 'Create your first class', hint: 'Group students by year or stream',                href: '/classes',         done: classCount > 0 || totalStudents > 0 },
    { label: 'Enroll students',      hint: 'Add or import your student roster',                  href: '/students',        done: totalStudents > 0                 },
    { label: 'Set up fee structures',hint: 'Define what each class owes per term',               href: '/fees/structures', done: hasFees                           },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4" data-tour="setup-checklist">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="font-semibold text-sm text-foreground">Set up your school</p>
            <p className="text-xs text-muted-foreground">{completed} of {steps.length} steps completed</p>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1.5">
        {steps.map((step) => (
          <Link
            key={step.href}
            href={step.href}
            className={cn(
              'flex items-center gap-3 rounded-md border p-2.5 transition',
              step.done
                ? 'border-ok/20 bg-ok/5 opacity-60'
                : 'border-border bg-card hover:bg-muted/30',
            )}
          >
            {step.done
              ? <CheckCircle2 className="h-4 w-4 text-ok shrink-0" />
              : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium', step.done ? 'line-through text-muted-foreground' : 'text-foreground')}>
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground">{step.hint}</p>
            </div>
            {!step.done && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Loading / Error ───────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-3.5 w-64 rounded-full" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-4 space-y-3">
            <Skeleton className="h-2.5 w-20 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-2.5 w-24 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function DashboardError({ title, error }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
      <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Dashboard data could not be loaded.</p>
        {error && (
          <p className="text-xs font-mono bg-muted rounded p-2 text-bad text-left">
            {error?.response?.data?.message ?? error?.message ?? 'Unknown error'}
          </p>
        )}
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Refresh page</Button>
      </div>
    </div>
  );
}

// ── Unified Dashboard ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router   = useRouter();

  const role         = user?.role;
  const isAdmin      = ADMIN_ROLES.includes(role);
  const isAccountant = role === 'accountant';
  const isSecretary  = role === 'secretary';
  const isTeacher    = TEACHER_ROLES.includes(role);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['dashboard-summary', role],
    queryFn: async () => {
      const res     = await dashboardApi.get();
      const payload = res.data?.data ?? res.data;
      if (payload && typeof payload === 'object' && 'fees' in payload) return payload;
      const { status: _s, data: _d, ...rest } = res.data ?? {};
      return rest.fees ? rest : payload;
    },
    enabled: !isTeacher && !!user?._id,
  });

  const { data: teacherData, isLoading: teacherLoading } = useQuery({
    queryKey: ['teacher-dashboard'],
    queryFn: async () => {
      const res = await dashboardApi.getTeacher();
      return res.data?.data ?? res.data;
    },
    enabled: isTeacher && !!user?._id,
  });

  const { data: schoolSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Derived values ────────────────────────────────────────────────────────

  const now       = new Date();
  const dateLabel = now.toLocaleDateString('en-KE', { weekday: 'long', month: 'short', day: 'numeric' });

  const upcomingEvents = (schoolSettings?.holidays ?? [])
    .filter((h) => new Date(h.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);
  const pastEvents = (schoolSettings?.holidays ?? [])
    .filter((h) => new Date(h.date) < now)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 2);

  const feeData            = summary?.fees ?? {};
  const totalCollected     = feeData.totalCollected ?? 0;
  const totalTarget        = feeData.totalTarget ?? 0;
  const feeCollectionPct   = feeData.feeCollectionPercent ?? (totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0);
  const studentsOverdue    = feeData.studentsOverdue ?? feeData.studentsToFollowUp ?? 0;
  const amountOverdue      = feeData.amountOverdue ?? 0;
  const pendingReceipts    = feeData.pendingReceipts ?? 0;
  const methodBreakdown    = feeData.methodBreakdown ?? {};
  const topDefaulters      = feeData.topDefaulters ?? [];
  const recentPayments     = feeData.recentPayments ?? [];
  const mpesaToday         = feeData.mpesaToday ?? 0;
  const mpesaTodayAmount   = feeData.mpesaTodayAmount ?? 0;

  const studentData            = summary?.students ?? {};
  const staffData              = summary?.staff ?? {};
  const activeStudents         = studentData.byStatus?.active ?? studentData.total ?? 0;
  const totalStudents          = studentData.total ?? 0;
  const classCount             = summary?.classes?.total ?? 0;
  const staffAwaitingFirstLogin = summary?.alerts?.staffAwaitingFirstLogin ?? staffData.pendingOnboarding ?? 0;

  const secretaryData  = summary?.secretary ?? {};
  const attendance     = secretaryData.attendance ?? {};
  const recentStudents = secretaryData.recentStudents ?? [];
  const attendancePct  = attendance.percent ?? null;

  const todaySlots           = teacherData?.todaySlots ?? [];
  const myClass              = teacherData?.myClass ?? null;
  const lessonPlansThisWeek  = teacherData?.lessonPlansThisWeek ?? 0;
  const att                  = myClass?.attendanceToday ?? null;

  const configuredTerms = Array.isArray(schoolSettings?.terms) ? schoolSettings.terms : [];
  const currentTerm = configuredTerms.find(
    (term) => now >= new Date(term.startDate) && now <= new Date(term.endDate),
  );
  const hasGeofence = Number.isFinite(Number(schoolSettings?.geofence?.latitude)) &&
    Number.isFinite(Number(schoolSettings?.geofence?.longitude));

  const msPerWeek   = 7 * 24 * 60 * 60 * 1000;
  const termWeek    = currentTerm
    ? Math.min(
        Math.max(1, Math.ceil((now - new Date(currentTerm.startDate)) / msPerWeek)),
        Math.max(1, Math.ceil((new Date(currentTerm.endDate) - new Date(currentTerm.startDate)) / msPerWeek)),
      )
    : null;
  const termTotalWeeks = currentTerm
    ? Math.max(1, Math.ceil((new Date(currentTerm.endDate) - new Date(currentTerm.startDate)) / msPerWeek))
    : null;

  const pendingTasks = [];
  if (myClass && !att) pendingTasks.push({ label: `Mark today's attendance for ${myClass.fullName}`, href: '/attendance', urgent: true });
  if (myClass && att && !att.submitted) pendingTasks.push({ label: `Submit attendance register for ${myClass.fullName}`, href: '/attendance', urgent: true });
  if (lessonPlansThisWeek === 0) pendingTasks.push({ label: 'No lesson plan uploaded this week', href: '/lesson-plans', urgent: false });

  const adminTasks = [
    (staffData.total ?? 0) <= 1 && { icon: Users, title: 'Add staff first', detail: 'Create accounts for teachers and key operations staff before adding classes and learners.', href: '/staff', cta: 'Add staff', priority: 'high' },
    classCount === 0 && { icon: BookOpen, title: 'Create your first class', detail: 'Classes should be ready before students are enrolled into the system.', href: '/classes', cta: 'Create class', priority: 'high' },
    totalStudents === 0 && { icon: UserPlus, title: 'Enroll students', detail: 'Add learners after staff and classes are in place.', href: '/students', cta: 'Enroll', priority: 'high' },
    totalTarget <= 0 && { icon: Wallet, title: "Set this year's fee structures", detail: 'No fee target is configured, so collection progress cannot be measured.', href: '/fees/structures', cta: 'Set fees', priority: 'high' },
    configuredTerms.length === 0 && { icon: Calendar, title: 'Add term dates', detail: 'Term dates power attendance, fees, exams, and report periods.', href: '/settings', cta: 'Open settings', priority: 'high' },
    studentsOverdue > 0 && { icon: AlertTriangle, title: `${studentsOverdue} students need fee follow-up`, detail: amountOverdue > 0 ? `${formatCurrency(amountOverdue)} remains outstanding.` : 'Open the fees list and follow up with parents.', href: '/fees', cta: 'Review', priority: studentsOverdue > 20 ? 'high' : 'medium' },
    staffAwaitingFirstLogin > 0 && { icon: Users, title: `${staffAwaitingFirstLogin} staff accounts not activated`, detail: 'These users have not completed their first login yet.', href: '/staff', cta: 'Follow up', priority: 'medium' },
    !hasGeofence && { icon: CalendarCheck, title: 'Set staff check-in location', detail: 'Drop the school pin and radius so staff check-ins can be verified.', href: '/settings', cta: 'Set location', priority: 'low' },
    summary?.alerts?.trialExpiringSoon && { icon: AlertCircle, title: 'Trial is ending soon', detail: summary?.school?.trialDaysLeft === 0 ? 'Your trial expires today. Review billing to avoid interruption.' : `${summary?.school?.trialDaysLeft} day${summary?.school?.trialDaysLeft === 1 ? '' : 's'} left in the trial.`, href: '/billing', cta: 'Billing', priority: 'medium' },
  ]
    .filter(Boolean)
    .map((task) => ({ ...task, onClick: () => router.push(task.href) }));

  // ── Loading / error guards ────────────────────────────────────────────────

  const isLoading  = summaryLoading || teacherLoading || (isAdmin && settingsLoading);
  const displayName = user?.firstName ?? 'there';
  const adminTitle  = summary?.school?.name ? `Today at ${summary.school.name}` : `Welcome, ${displayName}`;

  if (isLoading) return <DashboardSkeleton />;
  if (!isTeacher && !summary) return <DashboardError title={`Welcome, ${displayName}`} error={summaryError} />;

  // ── Render ────────────────────────────────────────────────────────────────

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  if (isAdmin) {
    return (
      <div className="space-y-4">
        {/* Page title row */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin</p>
            <h1 className="font-display text-xl font-semibold text-foreground mt-0.5">{adminTitle}</h1>
          </div>
          <RefreshButton queryKeys={[['dashboard-summary', role]]} />
        </div>

        {/* 3-column grid — stacked on mobile, all 3 cols from lg */}
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_240px] xl:grid-cols-[280px_1fr_300px] gap-4" data-tour="dashboard-header">
          {/* LEFT: Today rail — hidden on mobile */}
          <div className="hidden lg:block space-y-3">
            <TodayRail
              dateLabel={dateLabel}
              feeCollectionPct={feeCollectionPct}
              totalCollected={totalCollected}
              totalTarget={totalTarget}
              studentsOverdue={studentsOverdue}
              termWeek={termWeek}
              termTotalWeeks={termTotalWeeks}
              router={router}
            />
          </div>

          {/* CENTER: main content */}
          <div className="space-y-4">
            <SetupChecklist
              schoolId={summary?.school?._id ?? user?._id}
              totalStudents={totalStudents}
              staffCount={staffData.total ?? 0}
              classCount={classCount}
              hasFees={totalTarget > 0}
            />
            <div data-tour="admin-work-queue">
              <AdminWorkQueue tasks={adminTasks} />
            </div>
            {/* Ledger stat strip — 1 col mobile, 2 sm, 3 md, 4 lg */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-tour="stats-grid">
              <div data-tour="staff-attendance-widget">
                <StatCard
                  label="Today's Collections"
                  value={formatCurrency(feeData.todayAmount ?? 0)}
                  hint={`${formatCurrency(totalCollected)} of ${formatCurrency(totalTarget)} target`}
                  tone={feeCollectionPct >= 80 ? 'green' : feeCollectionPct >= 50 ? 'amber' : 'red'}
                  onClick={() => router.push('/fees/payments')}
                />
              </div>
              <StatCard label="Active Students" value={activeStudents} hint={`${Math.max(0, totalStudents - activeStudents)} inactive`} tone="blue" onClick={() => router.push('/students')} />
              <StatCard label="Staff" value={staffData.active ?? staffData.total ?? 0} hint={`${staffAwaitingFirstLogin} awaiting first login`} tone={staffAwaitingFirstLogin > 0 ? 'amber' : 'neutral'} onClick={() => router.push('/staff')} />
              <StatCard label="Defaulters" value={studentsOverdue} hint={amountOverdue > 0 ? `${formatCurrency(amountOverdue)} outstanding` : 'Students with unpaid fees'} tone={studentsOverdue > 20 ? 'red' : studentsOverdue > 5 ? 'amber' : 'neutral'} onClick={() => router.push('/fees')} />
            </div>
            <div data-tour="fee-health-widget">
              <FeeByClassCard byClass={feeData.byClass} />
            </div>
            <RecentPaymentsCard payments={recentPayments} />
          </div>

          {/* RIGHT: calendar + collections by method */}
          <div className="space-y-4">
            <UpcomingEventsCard events={upcomingEvents} pastEvents={pastEvents} />
            {Object.keys(methodBreakdown).length > 0 && (
              <SectionCard title="Collections by Method" icon={CreditCard}>
                <div className="space-y-3">
                  {Object.entries(methodBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([method, amount]) => {
                      const pct = totalCollected > 0 ? Math.round((amount / totalCollected) * 100) : 0;
                      return (
                        <div key={method}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="text-xs font-medium text-foreground">{METHOD_LABELS[method] ?? method}</p>
                            <p className="font-mono text-xs tabular-nums text-foreground">{formatCurrency(amount)}</p>
                          </div>
                          <div className="h-1.5 rounded-full bg-border">
                            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{pct}% of total</p>
                        </div>
                      );
                    })}
                </div>
              </SectionCard>
            )}
          </div>
        </div>

        {/* Check-in widget */}
        <div data-tour="checkin-widget">
          <CheckInWidget hideButton />
        </div>
      </div>
    );
  }

  // ── ACCOUNTANT ────────────────────────────────────────────────────────────
  if (isAccountant) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Finance</p>
            <h1 className="font-display text-xl font-semibold text-foreground mt-0.5">Welcome, {displayName}</h1>
          </div>
          <RefreshButton queryKeys={[['dashboard-summary', role]]} />
        </div>

        {pendingReceipts > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-bad/30 bg-bad/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-bad mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">{pendingReceipts} payments awaiting confirmation</p>
                <p className="text-xs text-muted-foreground">Review and confirm these pending transactions.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => router.push('/fees/payments')} className="shrink-0">Review pending</Button>
          </div>
        )}

        <div data-tour="fee-health-widget">
          {totalTarget > 0 && <CollectionProgressBar collected={totalCollected} target={totalTarget} percent={feeCollectionPct} />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-tour="stats-grid">
          <StatCard label="Today's Collections" value={formatCurrency(feeData.todayAmount ?? 0)} hint={`${feeData.todayCount ?? 0} payments today`} tone="green" onClick={() => router.push('/fees/payments')} />
          <StatCard label="This Week" value={formatCurrency(feeData.weekAmount ?? 0)} hint="Completed payments this week" tone="blue" onClick={() => router.push('/fees/payments')} />
          <StatCard label="This Month" value={formatCurrency(feeData.monthAmount ?? 0)} hint={`${feeData.monthCount ?? 0} transactions`} tone="neutral" onClick={() => router.push('/fees/payments')} />
          <StatCard label="Defaulters" value={studentsOverdue} hint="Students with outstanding fees" tone={studentsOverdue > 20 ? 'red' : studentsOverdue > 5 ? 'amber' : 'neutral'} onClick={() => router.push('/fees')} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div data-tour="mpesa-setup-card">
            <SectionCard title="M-Pesa Reconciliation" icon={Smartphone}>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div className="rounded-md border border-border p-3 text-center">
                    <p className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-foreground">{mpesaToday}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">M-Pesa payments today</p>
                  </div>
                  <div className="rounded-md border border-border p-3 text-center">
                    <p className="font-mono text-lg sm:text-xl font-bold tabular-nums text-ok">{formatCurrency(mpesaTodayAmount)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total received today</p>
                  </div>
                </div>
                <div className="rounded-md border border-ok/30 bg-ok/5 p-3 flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-ok shrink-0" />
                  <p className="text-xs text-muted-foreground">M-Pesa payments are recorded against student accounts manually.</p>
                </div>
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => router.push('/fees/payments')}>
                  <Smartphone className="h-4 w-4" /> View all M-Pesa payments
                </Button>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Collections by Method" icon={CreditCard}>
            {Object.keys(methodBreakdown).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(methodBreakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, amount]) => {
                    const pct = totalCollected > 0 ? Math.round((amount / totalCollected) * 100) : 0;
                    return (
                      <div key={method}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-sm font-medium text-foreground">{METHOD_LABELS[method] ?? method}</p>
                          <p className="font-mono text-sm tabular-nums text-foreground">{formatCurrency(amount)}</p>
                        </div>
                        <div className="h-1.5 rounded-full bg-border">
                          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{pct}% of total</p>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            )}
          </SectionCard>
        </div>

        {Object.keys(feeData.byClass ?? {}).length > 0 && (
          <SectionCard
            title="Fee Arrears by Class"
            icon={Wallet}
            action={<Link href="/fees/payments" className="text-xs font-medium text-bad hover:underline flex items-center gap-1">View overdue <ArrowRight className="h-3 w-3" /></Link>}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(feeData.byClass)
                .sort(([, a], [, b]) => a.percent - b.percent)
                .map(([className, d]) => {
                  const { bar, text } = feeColor(d.percent);
                  return (
                    <div key={className}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium text-foreground">{className}</p>
                        <p className={cn('text-xs font-semibold font-mono tabular-nums', text)}>{d.percent}% paid</p>
                      </div>
                      <div className="h-1.5 rounded-full bg-border">
                        <div className={cn('h-1.5 rounded-full transition-all', bar)} style={{ width: `${Math.min(100, d.percent)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{d.paidCount}/{d.total} students · {formatCurrency(d.collected ?? 0)} collected</p>
                    </div>
                  );
                })}
            </div>
          </SectionCard>
        )}

        {topDefaulters.length > 0 && (
          <SectionCard
            title="Top Defaulters"
            icon={AlertCircle}
            action={<Link href="/fees" className="text-xs font-medium text-bad hover:underline flex items-center gap-1">Full list <ArrowRight className="h-3 w-3" /></Link>}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['Student', 'Class', 'Paid', 'Outstanding', 'Last Payment'].map((h) => (
                      <th key={h} className={cn('py-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground', h === 'Student' || h === 'Class' ? 'text-left' : 'text-right')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {topDefaulters.map((d) => (
                    <tr key={d._id} className="hover:bg-muted/30">
                      <td className="py-2.5 px-1"><p className="font-medium text-foreground">{d.name}</p><p className="text-[10px] font-mono text-muted-foreground">{d.admissionNumber}</p></td>
                      <td className="py-2.5 px-1 text-muted-foreground">{d.className}</td>
                      <td className="py-2.5 px-1 text-right font-mono tabular-nums text-foreground">{formatCurrency(d.paid)}</td>
                      <td className="py-2.5 px-1 text-right font-mono tabular-nums font-semibold text-bad">{formatCurrency(d.outstanding)}</td>
                      <td className="py-2.5 px-1 text-right text-xs text-muted-foreground">
                        {d.lastPaymentDate
                          ? new Date(d.lastPaymentDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
                          : <span className="text-bad">Never</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        <SectionCard
          title="Recent Transactions"
          icon={CreditCard}
          action={<Link href="/fees/payments" className="text-xs font-medium text-primary hover:underline">View all</Link>}
        >
          {recentPayments.length > 0 ? (
            <div className="divide-y divide-border">
              {recentPayments.map((payment, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{payment.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{METHOD_LABELS[payment.method] ?? payment.method} · {payment.date} {payment.time}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{formatCurrency(payment.amount)}</p>
                    {payment.receiptNumber && <p className="font-mono text-[10px] text-muted-foreground">{payment.receiptNumber}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No payments recorded today.</p>
          )}
        </SectionCard>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <Button onClick={() => router.push('/fees/payments')} className="gap-2"><CreditCard className="h-4 w-4" /> Record Payment</Button>
          <Button onClick={() => router.push('/fees/payments')} variant="outline" className="gap-2"><FileText className="h-4 w-4" /> Issue Receipts</Button>
          <Button onClick={() => router.push('/fees')} variant="outline" className="gap-2"><TrendingUp className="h-4 w-4" /> Fee Reports</Button>
          {studentsOverdue > 0 && <Button onClick={() => router.push('/fees')} variant="outline" className="gap-2 text-warn border-warn/30 hover:bg-warn/5"><AlertTriangle className="h-4 w-4" /> Follow-up List</Button>}
        </div>

        <div data-tour="checkin-widget"><CheckInWidget hideButton /></div>
      </div>
    );
  }

  // ── SECRETARY ─────────────────────────────────────────────────────────────
  if (isSecretary) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Operations</p>
            <h1 className="font-display text-xl font-semibold text-foreground mt-0.5">Welcome, {displayName}</h1>
          </div>
          <RefreshButton queryKeys={[['dashboard-summary', role]]} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-tour="stats-grid">
          <StatCard label="Active Students" value={activeStudents} hint="Currently enrolled" tone="blue" onClick={() => router.push('/students')} />
          <StatCard label="Staff Members" value={summary?.staff?.total ?? 0} hint="Teaching and non-teaching" tone="neutral" onClick={() => router.push('/staff')} />
          <StatCard label="Today's Attendance" value={attendancePct !== null ? `${attendancePct}%` : '—'} hint={attendance.total > 0 ? `${attendance.present} present · ${attendance.absent} absent` : 'No registers submitted yet'} tone={attendancePct !== null ? (attendancePct < 85 ? 'amber' : 'green') : 'neutral'} onClick={() => router.push('/attendance')} />
          <StatCard label="Recent Registrations" value={recentStudents.length} hint="New students this period" tone="neutral" onClick={() => router.push('/students')} />
        </div>

        {attendance.total > 0 && (
          <div data-tour="student-attendance-widget">
            <SectionCard
              title="Today's Attendance"
              icon={CalendarCheck}
              action={<Link href="/attendance" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">View registers <ArrowRight className="h-3 w-3" /></Link>}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-3">
                {[
                  { label: 'Present', value: attendance.present, tone: 'text-ok' },
                  { label: 'Absent',  value: attendance.absent,  tone: 'text-bad' },
                  { label: 'Late',    value: attendance.late,    tone: 'text-warn' },
                ].map(({ label, value, tone }) => (
                  <div key={label} className="rounded-md border border-border p-3 text-center">
                    <p className={cn('font-mono text-2xl font-bold tabular-nums', tone)}>{value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
              {attendancePct !== null && (
                <div>
                  <div className="h-2 rounded-full bg-border overflow-hidden" role="progressbar" aria-valuenow={attendancePct} aria-valuemin={0} aria-valuemax={100}>
                    <div className={cn('h-2 rounded-full', attendancePct >= 90 ? 'bg-ok' : attendancePct >= 75 ? 'bg-warn' : 'bg-bad')} style={{ width: `${attendancePct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-center font-mono tabular-nums">{attendancePct}% attendance rate today</p>
                </div>
              )}
            </SectionCard>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionCard
            title="Recent Registrations"
            icon={UserPlus}
            action={<Link href="/students" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>}
          >
            {recentStudents.length > 0 ? (
              <div className="divide-y divide-border">
                {recentStudents.map((s) => (
                  <div key={s._id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{s.admissionNumber} · {s.className}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="capitalize">{s.status}</Badge>
                      <p className="text-[10px] text-muted-foreground mt-1">{formatDate(s.joinedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No recent registrations.</p>
            )}
          </SectionCard>
          <UpcomingEventsCard events={upcomingEvents} />
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <Button onClick={() => router.push('/students')} className="gap-2"><Plus className="h-4 w-4" /> Enroll Student</Button>
          <Button onClick={() => router.push('/attendance')} variant="outline" className="gap-2"><CalendarCheck className="h-4 w-4" /> Attendance</Button>
          <Button onClick={() => router.push('/students')} variant="outline" className="gap-2"><Users className="h-4 w-4" /> Student Records</Button>
          <Button onClick={() => router.push('/fees/payments')} variant="outline" className="gap-2"><CreditCard className="h-4 w-4" /> Record Payment</Button>
        </div>

        <div data-tour="checkin-widget"><CheckInWidget hideButton /></div>
      </div>
    );
  }

  // ── TEACHER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Teacher</p>
          <h1 className="font-display text-xl font-semibold text-foreground mt-0.5">Welcome, {displayName}</h1>
          {myClass && <p className="text-sm text-muted-foreground mt-0.5">Class teacher · {myClass.fullName}</p>}
        </div>
        <RefreshButton queryKeys={[['teacher-dashboard']]} />
      </div>

      {/* Attendance prompt */}
      {myClass && (!att || !att.submitted) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <CalendarCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {att ? `Attendance register not yet submitted for ${myClass.fullName}` : `Mark today's attendance for ${myClass.fullName}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {att ? `${att.present} present · ${att.absent} absent · ${att.late} late — please submit.` : `${myClass.studentCount} students expected. Submit before end of day.`}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => router.push('/attendance')} className="shrink-0">
            {att ? 'Submit Register' : 'Mark Attendance'}
          </Button>
        </div>
      )}
      {myClass && att?.submitted && (
        <div className="flex items-center gap-3 rounded-lg border border-ok/20 bg-ok/5 p-4">
          <CheckCircle2 className="h-4 w-4 text-ok shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Attendance submitted for {myClass.fullName}</p>
            <p className="text-xs text-muted-foreground">{att.present} present · {att.absent} absent · {att.late} late · {att.percent}% rate</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-tour="stats-grid">
        <StatCard label="My Class" value={myClass ? myClass.fullName : '—'} hint={myClass ? `${myClass.studentCount} active students` : 'Not assigned as class teacher'} tone="blue" onClick={() => router.push('/students')} />
        <StatCard label="Today's Lessons" value={todaySlots.length} hint={todaySlots.length > 0 ? `First at ${todaySlots[0].startTime}` : 'No lessons scheduled today'} tone={todaySlots.length > 0 ? 'neutral' : 'neutral'} onClick={() => router.push('/timetable')} />
        <StatCard label="Attendance" value={att ? `${att.percent ?? 0}%` : (myClass ? 'Pending' : '—')} hint={att ? `${att.present}/${att.total} present` : (myClass ? 'Register not taken yet' : 'No class assigned')} tone={!att ? 'amber' : att.percent >= 90 ? 'green' : att.percent >= 75 ? 'amber' : 'red'} onClick={() => router.push('/attendance')} />
        <StatCard label="Lesson Plans" value={lessonPlansThisWeek} hint="Submitted this week" tone={lessonPlansThisWeek > 0 ? 'green' : 'amber'} onClick={() => router.push('/lesson-plans')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div data-tour="timetable-widget">
          <SectionCard
            title="Today's Timetable"
            icon={Clock}
            action={<Link href="/timetable" className="text-xs font-medium text-primary hover:underline flex items-center gap-1">Full timetable <ArrowRight className="h-3 w-3" /></Link>}
          >
            {todaySlots.length > 0 ? (
              <div className="space-y-2">
                {todaySlots.map((slot, i) => {
                  const timeNow   = now.toTimeString().slice(0, 5);
                  const isPast    = slot.endTime < timeNow;
                  const isCurrent = slot.startTime <= timeNow && slot.endTime > timeNow;
                  return (
                    <div key={i} className={cn('flex items-center gap-3 rounded-md border p-2.5 transition-colors', isCurrent ? 'border-primary/30 bg-primary/5' : isPast ? 'opacity-50 border-border' : 'border-border bg-card')}>
                      <div className="text-center shrink-0 w-12">
                        <p className="text-xs font-bold font-mono text-foreground">{slot.startTime}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{slot.endTime}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{slot.subject}</p>
                        <p className="text-xs text-muted-foreground">{slot.className}{slot.room ? ` · Room ${slot.room}` : ''}</p>
                      </div>
                      {isCurrent && <Badge className="text-xs shrink-0">Now</Badge>}
                      {!isCurrent && !isPast && <Badge variant="outline" className="text-xs shrink-0 font-mono">P{slot.period}</Badge>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">No lessons scheduled for today.</p>
                <Link href="/timetable" className="mt-1 text-xs text-primary hover:underline">View full timetable</Link>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4" data-tour="pending-actions-widget">
          <SectionCard title="Pending Tasks" icon={Bell}>
            {pendingTasks.length > 0 ? (
              <div className="space-y-2">
                {pendingTasks.map((task, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => router.push(task.href)}
                    className={cn(
                      'w-full text-left flex items-start gap-3 rounded-md border p-3 transition',
                      task.urgent ? 'border-bad/30 bg-bad/5 hover:bg-bad/10' : 'border-warn/30 bg-warn/5 hover:bg-warn/10',
                    )}
                  >
                    <AlertTriangle className={cn('h-4 w-4 mt-0.5 shrink-0', task.urgent ? 'text-bad' : 'text-warn')} />
                    <p className="text-sm text-foreground">{task.label}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-ok shrink-0" />
                <p className="text-sm text-muted-foreground">All caught up — no pending tasks.</p>
              </div>
            )}
          </SectionCard>
          <UpcomingEventsCard events={upcomingEvents.slice(0, 4)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => router.push('/attendance')} className="gap-2"><CalendarCheck className="h-4 w-4" /> Attendance</Button>
        <Button onClick={() => router.push('/lesson-plans')} variant="outline" className="gap-2"><ClipboardList className="h-4 w-4" /> Lesson Plans</Button>
        <Button onClick={() => router.push('/exams')} variant="outline" className="gap-2"><FileText className="h-4 w-4" /> Exams</Button>
        <Button onClick={() => router.push('/timetable')} variant="outline" className="gap-2"><Clock className="h-4 w-4" /> Timetable</Button>
      </div>

      <div data-tour="checkin-widget"><CheckInWidget hideButton /></div>
    </div>
  );
}
