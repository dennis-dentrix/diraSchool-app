'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle, AlertTriangle, ArrowRight, BookOpen, Calendar,
  CalendarCheck, CheckCircle2, Clock, CreditCard, DollarSign,
  FileText, Plus, Smartphone, TrendingUp, Users, UserPlus,
  Bell, ClipboardList, GraduationCap,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { dashboardApi, settingsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatCurrency, formatDate, feeColor } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/shared/refresh-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckInWidget } from '@/components/shared/check-in-widget';

// ── Role groups ───────────────────────────────────────────────────────────────

const ADMIN_ROLES   = ['school_admin', 'director', 'headteacher', 'deputy_headteacher'];
const TEACHER_ROLES = ['teacher', 'department_head'];

// ── Shared primitives ─────────────────────────────────────────────────────────

function DashboardShell({ title, subtitle, rightMeta, actions, children }) {
  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-gradient-to-br from-slate-50 via-white to-cyan-50/40">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              {actions}
              {rightMeta && <div className="text-sm text-slate-500 sm:text-right">{rightMeta}</div>}
            </div>
          </div>
        </CardContent>
      </Card>
      {children}
    </div>
  );
}

function StatCard({ label, value, hint, icon: Icon, tone = 'slate', onClick, badge }) {
  const tones = {
    green:  'from-emerald-50 to-green-50 border-emerald-200/70 text-emerald-700',
    blue:   'from-blue-50 to-cyan-50 border-blue-200/70 text-blue-700',
    amber:  'from-amber-50 to-orange-50 border-amber-200/70 text-amber-700',
    violet: 'from-violet-50 to-purple-50 border-violet-200/70 text-violet-700',
    slate:  'from-slate-50 to-slate-100 border-slate-200/70 text-slate-700',
    rose:   'from-rose-50 to-red-50 border-rose-200/70 text-rose-700',
    cyan:   'from-cyan-50 to-teal-50 border-cyan-200/70 text-cyan-700',
  };
  return (
    <Card
      className={`bg-gradient-to-br ${tones[tone]} transition-all hover:shadow-md ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="rounded-lg bg-white/80 p-2"><Icon className="h-5 w-5" aria-hidden /></div>
          {badge && <Badge variant="secondary" className="bg-white/85 text-slate-700">{badge}</Badge>}
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="mt-1.5 text-xs text-slate-600">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, icon: Icon, action, children }) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <span className="rounded-md bg-slate-100 p-1.5"><Icon className="h-4 w-4 text-slate-700" aria-hidden /></span>
            {title}
          </CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function CollectionProgressBar({ collected, target, percent }) {
  const { bar, text } = feeColor(percent);
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Term Fee Collection</p>
            <p className="text-xs text-slate-500 mt-0.5">{formatCurrency(collected)} collected of {formatCurrency(target)} target</p>
          </div>
          <span className={`text-2xl font-bold ${text}`}>{percent}%</span>
        </div>
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-3 rounded-full transition-all duration-500 ${bar}`} style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>KES 0</span><span>{formatCurrency(target)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Reusable section cards ────────────────────────────────────────────────────

function UpcomingEventsCard({ events = [], pastEvents = [] }) {
  return (
    <SectionCard
      title="Upcoming Events"
      icon={Clock}
      action={<Link href="/settings" className="text-xs font-medium text-cyan-700 hover:underline">Manage</Link>}
    >
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev._id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200/80 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{ev.name}</p>
                {ev.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{ev.description}</p>}
              </div>
              <Badge variant="outline" className="shrink-0 text-xs">{formatDate(ev.date)}</Badge>
            </div>
          ))}
          {pastEvents.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-slate-500 mb-2">Recent</p>
              {pastEvents.map((ev) => (
                <div key={ev._id} className="flex items-center justify-between gap-3 py-1.5 opacity-60">
                  <p className="text-xs text-slate-700">{ev.name}</p>
                  <span className="text-xs text-slate-400 shrink-0">{formatDate(ev.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="py-4 text-center">
          <p className="text-sm text-slate-500">No upcoming events scheduled.</p>
          <Link href="/settings" className="mt-1 text-xs text-cyan-700 hover:underline">Add an event</Link>
        </div>
      )}
    </SectionCard>
  );
}

function FeeByClassCard({ byClass = {} }) {
  if (!Object.keys(byClass).length) return (
    <SectionCard title="Fee Status by Class" icon={DollarSign}>
      <p className="text-sm text-slate-500">No fee data available.</p>
    </SectionCard>
  );
  return (
    <SectionCard
      title="Fee Status by Class"
      icon={DollarSign}
      action={<Link href="/fees/payments" className="text-xs font-medium text-rose-600 hover:underline flex items-center gap-1">View overdue <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
    >
      <div className="space-y-3">
        {Object.entries(byClass)
          .sort(([, a], [, b]) => a.percent - b.percent)
          .map(([className, d]) => {
            const { bar, text } = feeColor(d.percent);
            return (
              <div key={className} className="rounded-lg border border-slate-200/80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{className}</p>
                  <p className={`text-xs font-semibold ${text}`}>{d.percent}% paid</p>
                </div>
                <div className="h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={d.percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-2 rounded-full transition-all ${bar}`} style={{ width: `${Math.min(100, d.percent)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-slate-600">{d.paidCount}/{d.total} students{d.collected != null ? ` · ${formatCurrency(d.collected)} collected` : ''}</p>
              </div>
            );
          })}
      </div>
    </SectionCard>
  );
}

// ── Loading / Error shared states ─────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <DashboardShell title="Loading…">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </DashboardShell>
  );
}

function DashboardError({ title, error }) {
  return (
    <DashboardShell title={title}>
      <Card className="border-border/70">
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">Dashboard data could not be loaded.</p>
          {error && (
            <p className="text-xs font-mono bg-slate-100 rounded p-2 text-rose-700 text-left">
              {error?.response?.data?.message ?? error?.message ?? 'Unknown error'}
            </p>
          )}
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Refresh page</Button>
        </CardContent>
      </Card>
    </DashboardShell>
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
  const showFees     = isAdmin || isAccountant;

  // ── Data fetching (all queries in one place) ──────────────────────────────

  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ['dashboard-summary', role],
    queryFn: async () => {
      const res = await dashboardApi.get();
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

  // School settings (events) — shared, fetched once at this level
  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Derived values ────────────────────────────────────────────────────────

  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-KE', { weekday: 'long', month: 'short', day: 'numeric' });

  const upcomingEvents = (schoolSettings?.holidays ?? [])
    .filter((h) => new Date(h.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);
  const pastEvents = (schoolSettings?.holidays ?? [])
    .filter((h) => new Date(h.date) < now)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 2);

  // Fee data
  const feeData            = summary?.fees ?? {};
  const totalCollected     = feeData.totalCollected     ?? 0;
  const totalTarget        = feeData.totalTarget        ?? 0;
  const feeCollectionPct   = feeData.feeCollectionPercent ?? (totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0);
  const studentsOverdue    = feeData.studentsOverdue    ?? feeData.studentsToFollowUp ?? 0;
  const amountOverdue      = feeData.amountOverdue      ?? 0;
  const pendingReceipts    = feeData.pendingReceipts    ?? 0;
  const methodBreakdown    = feeData.methodBreakdown    ?? {};
  const topDefaulters      = feeData.topDefaulters      ?? [];
  const recentPayments     = feeData.recentPayments     ?? [];
  const mpesaToday         = feeData.mpesaToday         ?? 0;
  const mpesaTodayAmount   = feeData.mpesaTodayAmount   ?? 0;
  const methodLabels       = { cash: 'Cash', mpesa: 'M-Pesa', cheque: 'Cheque', bank_transfer: 'Bank Transfer', bank: 'Bank' };

  // Student / staff data
  const studentData   = summary?.students ?? {};
  const staffData     = summary?.staff    ?? {};
  const activeStudents = studentData.byStatus?.active ?? studentData.total ?? 0;
  const totalStudents  = studentData.total ?? 0;

  // Secretary data
  const secretaryData  = summary?.secretary ?? {};
  const attendance     = secretaryData.attendance ?? {};
  const recentStudents = secretaryData.recentStudents ?? [];
  const attendancePct  = attendance.percent ?? null;

  // Teacher data
  const todaySlots         = teacherData?.todaySlots         ?? [];
  const myClass            = teacherData?.myClass            ?? null;
  const lessonPlansThisWeek = teacherData?.lessonPlansThisWeek ?? 0;
  const att                = myClass?.attendanceToday ?? null;

  const pendingTasks = [];
  if (myClass && !att) pendingTasks.push({ label: `Mark today's attendance for ${myClass.fullName}`, href: '/attendance', urgent: true });
  if (myClass && att && !att.submitted) pendingTasks.push({ label: `Submit attendance register for ${myClass.fullName}`, href: '/attendance', urgent: true });
  if (lessonPlansThisWeek === 0) pendingTasks.push({ label: 'No lesson plan uploaded this week', href: '/lesson-plans', urgent: false });

  // Admin alerts
  const alerts = studentsOverdue > 20 ? [{
    icon: AlertTriangle,
    title: `${studentsOverdue} students have overdue fees`,
    detail: amountOverdue > 0 ? `${formatCurrency(amountOverdue)} outstanding` : 'Follow up with parents',
    href: '/fees',
  }] : [];

  // ── Loading / error guards ────────────────────────────────────────────────

  const isLoading = summaryLoading || teacherLoading;
  const displayName = user?.firstName ?? 'there';
  const subtitle = isAdmin     ? 'School overview — fees, students, and staff'
                 : isAccountant ? 'Finance overview — collections and reconciliation'
                 : isSecretary  ? 'School operations — admissions and attendance'
                 : isTeacher    ? (myClass ? `Class teacher · ${myClass.fullName}` : 'Teacher overview')
                 : 'Dashboard';

  if (isLoading) return <DashboardSkeleton />;
  if (!isTeacher && !summary) return <DashboardError title={`Welcome, ${displayName}`} error={summaryError} />;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardShell
      title={`Welcome, ${displayName}`}
      subtitle={subtitle}
      rightMeta={dateLabel}
      actions={
        <RefreshButton
          queryKeys={isTeacher
            ? [['teacher-dashboard']]
            : [['dashboard-summary', role]]}
        />
      }
    >
      {/* ── Alerts ── admin / finance only ───────────────────────────────── */}
      {showFees && alerts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {alerts.map((alert, i) => {
            const Icon = alert.icon;
            return (
              <button
                type="button"
                key={i}
                onClick={() => router.push(alert.href)}
                className="w-full rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-left transition hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="rounded-md bg-white/80 p-2"><Icon className="h-4 w-4 text-slate-700" aria-hidden /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{alert.title}</p>
                    <p className="mt-1 text-xs text-slate-600">{alert.detail}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Finance: pending receipts alert ──────────────────────────────── */}
      {isAccountant && pendingReceipts > 0 && (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-700 mt-0.5" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-rose-900">{pendingReceipts} payments awaiting confirmation</p>
                <p className="text-xs text-rose-800/80">Review and confirm these pending transactions.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => router.push('/fees/payments')} className="bg-rose-700 hover:bg-rose-800">
              Review pending
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Teacher: attendance prompt ────────────────────────────────────── */}
      {isTeacher && myClass && (!att || !att.submitted) && (
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CalendarCheck className="h-5 w-5 text-blue-700 mt-0.5" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-blue-900">
                  {att
                    ? `Attendance register not yet submitted for ${myClass.fullName}`
                    : `Mark today's attendance for ${myClass.fullName}`}
                </p>
                <p className="text-xs text-blue-800/80">
                  {att
                    ? `${att.present} present · ${att.absent} absent · ${att.late} late — please submit.`
                    : `${myClass.studentCount} students expected. Submit before end of day.`}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => router.push('/attendance')} className="bg-blue-700 hover:bg-blue-800 shrink-0">
              {att ? 'Submit Register' : 'Mark Attendance'}
            </Button>
          </CardContent>
        </Card>
      )}
      {isTeacher && myClass && att?.submitted && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Attendance submitted for {myClass.fullName}</p>
              <p className="text-xs text-emerald-700/80">{att.present} present · {att.absent} absent · {att.late} late · {att.percent}% rate</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Fee progress bar ── admin + finance ──────────────────────────── */}
      {showFees && totalTarget > 0 && (
        <CollectionProgressBar collected={totalCollected} target={totalTarget} percent={feeCollectionPct} />
      )}

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Admin */}
        {isAdmin && (
          <>
            <StatCard
              label="Fee Collection"
              value={formatCurrency(totalCollected)}
              hint={`Target ${formatCurrency(totalTarget)}`}
              icon={DollarSign}
              badge={`${feeCollectionPct}%`}
              tone={feeCollectionPct >= 80 ? 'green' : feeCollectionPct >= 50 ? 'amber' : 'rose'}
              onClick={() => router.push('/fees')}
            />
            <StatCard label="Active Students" value={activeStudents} hint={`${Math.max(0, totalStudents - activeStudents)} inactive`} icon={BookOpen} tone="blue" onClick={() => router.push('/students')} />
            <StatCard label="Staff Members" value={staffData.active ?? staffData.total ?? 0} hint={`${staffData.pendingOnboarding ?? 0} pending onboarding`} icon={Users} badge={`${staffData.total ?? 0} total`} tone="slate" onClick={() => router.push('/staff')} />
            <StatCard label="Defaulters" value={studentsOverdue} hint={amountOverdue > 0 ? `${formatCurrency(amountOverdue)} outstanding` : 'Students with unpaid fees'} icon={AlertCircle} tone={studentsOverdue > 20 ? 'rose' : studentsOverdue > 5 ? 'amber' : 'slate'} onClick={() => router.push('/fees')} />
          </>
        )}

        {/* Accountant */}
        {isAccountant && (
          <>
            <StatCard label="Today's Collections" value={formatCurrency(feeData.todayAmount ?? 0)} hint={`${feeData.todayCount ?? 0} payment${(feeData.todayCount ?? 0) !== 1 ? 's' : ''} recorded`} icon={DollarSign} tone="green" onClick={() => router.push('/fees/payments')} />
            <StatCard label="This Week" value={formatCurrency(feeData.weekAmount ?? 0)} hint="Completed payments this week" icon={TrendingUp} tone="blue" onClick={() => router.push('/fees/payments')} />
            <StatCard label="This Month" value={formatCurrency(feeData.monthAmount ?? 0)} hint={`${feeData.monthCount ?? 0} transactions`} icon={CreditCard} tone="cyan" onClick={() => router.push('/fees/payments')} />
            <StatCard label="Defaulters" value={studentsOverdue} hint="Students with outstanding fees" icon={AlertCircle} tone={studentsOverdue > 20 ? 'rose' : studentsOverdue > 5 ? 'amber' : 'slate'} onClick={() => router.push('/fees')} />
          </>
        )}

        {/* Secretary */}
        {isSecretary && (
          <>
            <StatCard label="Active Students" value={activeStudents} hint="Currently enrolled" icon={BookOpen} tone="blue" onClick={() => router.push('/students')} />
            <StatCard label="Staff Members" value={summary?.staff?.total ?? 0} hint="Teaching and non-teaching" icon={Users} tone="violet" onClick={() => router.push('/staff')} />
            <StatCard label="Today's Attendance" value={attendancePct !== null ? `${attendancePct}%` : '—'} hint={attendance.total > 0 ? `${attendance.present} present · ${attendance.absent} absent` : 'No registers submitted yet'} icon={CalendarCheck} tone={attendancePct !== null ? (attendancePct < 85 ? 'amber' : 'green') : 'slate'} onClick={() => router.push('/attendance')} />
            <StatCard label="Recent Registrations" value={recentStudents.length} hint="New students this period" icon={UserPlus} tone="cyan" onClick={() => router.push('/students')} />
          </>
        )}

        {/* Teacher */}
        {isTeacher && (
          <>
            <StatCard label="My Class" value={myClass ? myClass.fullName : '—'} hint={myClass ? `${myClass.studentCount} active students` : 'Not assigned as class teacher'} icon={GraduationCap} tone="blue" onClick={() => router.push('/students')} />
            <StatCard label="Today's Lessons" value={todaySlots.length} hint={todaySlots.length > 0 ? `First at ${todaySlots[0].startTime}` : 'No lessons scheduled today'} icon={BookOpen} tone={todaySlots.length > 0 ? 'cyan' : 'slate'} onClick={() => router.push('/timetable')} />
            <StatCard label="Attendance Today" value={att ? `${att.percent ?? 0}%` : (myClass ? 'Pending' : '—')} hint={att ? `${att.present}/${att.total} present` : (myClass ? 'Register not taken yet' : 'No class assigned')} icon={CalendarCheck} tone={!att ? 'amber' : att.percent >= 90 ? 'green' : att.percent >= 75 ? 'amber' : 'rose'} onClick={() => router.push('/attendance')} />
            <StatCard label="Lesson Plans" value={lessonPlansThisWeek} hint="Submitted this week" icon={ClipboardList} tone={lessonPlansThisWeek > 0 ? 'green' : 'amber'} onClick={() => router.push('/lesson-plans')} />
          </>
        )}
      </div>

      {/* ── Main 2-column grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* ── Admin: fee by class + events ─────────────────────────────── */}
        {isAdmin && (
          <>
            <FeeByClassCard byClass={feeData.byClass} />
            <UpcomingEventsCard events={upcomingEvents} pastEvents={pastEvents} />
          </>
        )}

        {/* ── Accountant: M-Pesa + collections by method ───────────────── */}
        {isAccountant && (
          <>
            <SectionCard title="M-Pesa Reconciliation" icon={Smartphone}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200/80 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-900">{mpesaToday}</p>
                    <p className="text-xs text-slate-500 mt-0.5">M-Pesa payments today</p>
                  </div>
                  <div className="rounded-lg border border-slate-200/80 p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-700">{formatCurrency(mpesaTodayAmount)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total received today</p>
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden />
                  <p className="text-xs text-emerald-700/80">M-Pesa payments are recorded against student accounts manually.</p>
                </div>
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => router.push('/fees/payments')}>
                  <Smartphone className="h-4 w-4" aria-hidden /> View all M-Pesa payments
                </Button>
              </div>
            </SectionCard>

            <SectionCard title="Collections by Method" icon={CreditCard}>
              {Object.keys(methodBreakdown).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(methodBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([method, amount]) => {
                      const pct = totalCollected > 0 ? Math.round((amount / totalCollected) * 100) : 0;
                      return (
                        <div key={method} className="rounded-lg border border-slate-200/80 p-3">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900">{methodLabels[method] ?? method}</p>
                            <p className="text-xs font-semibold text-slate-700">{formatCurrency(amount)}</p>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-cyan-500" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{pct}% of total</p>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No payments recorded yet.</p>
              )}
            </SectionCard>
          </>
        )}

        {/* ── Secretary: recent students + events ──────────────────────── */}
        {isSecretary && (
          <>
            <SectionCard
              title="Recent Student Registrations"
              icon={UserPlus}
              action={<Link href="/students" className="text-xs font-medium text-cyan-700 hover:underline flex items-center gap-1">View all <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
            >
              {recentStudents.length > 0 ? (
                <div className="space-y-2">
                  {recentStudents.map((s) => (
                    <div key={s._id} className="flex items-center justify-between rounded-lg border border-slate-200/80 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.admissionNumber} · {s.className}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <Badge variant={s.status === 'active' ? 'default' : 'secondary'} className="capitalize">{s.status}</Badge>
                        <p className="text-xs text-slate-400 mt-1">{formatDate(s.joinedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No recent registrations.</p>
              )}
            </SectionCard>
            <UpcomingEventsCard events={upcomingEvents} />
          </>
        )}

        {/* ── Teacher: timetable + tasks & events ──────────────────────── */}
        {isTeacher && (
          <>
            <SectionCard
              title="Today's Timetable"
              icon={Clock}
              action={<Link href="/timetable" className="text-xs font-medium text-cyan-700 hover:underline flex items-center gap-1">Full timetable <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
            >
              {todaySlots.length > 0 ? (
                <div className="space-y-2">
                  {todaySlots.map((slot, i) => {
                    const timeNow = now.toTimeString().slice(0, 5);
                    const isPast    = slot.endTime < timeNow;
                    const isCurrent = slot.startTime <= timeNow && slot.endTime > timeNow;
                    return (
                      <div key={i} className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${isCurrent ? 'border-blue-300 bg-blue-50' : isPast ? 'opacity-50 border-slate-200' : 'border-slate-200 bg-white'}`}>
                        <div className="text-center shrink-0 w-14">
                          <p className="text-xs font-bold text-slate-700">{slot.startTime}</p>
                          <p className="text-xs text-slate-400">{slot.endTime}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{slot.subject}</p>
                          <p className="text-xs text-slate-500">{slot.className}{slot.room ? ` · Room ${slot.room}` : ''}</p>
                        </div>
                        {isCurrent && <Badge className="bg-blue-600 text-white text-xs shrink-0">Now</Badge>}
                        {!isCurrent && !isPast && <Badge variant="outline" className="text-xs shrink-0">Period {slot.period}</Badge>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center">
                  <BookOpen className="h-8 w-8 mx-auto text-slate-300 mb-2" aria-hidden />
                  <p className="text-sm text-slate-500">No lessons scheduled for today.</p>
                  <Link href="/timetable" className="mt-1 text-xs text-cyan-700 hover:underline">View full timetable</Link>
                </div>
              )}
            </SectionCard>

            <div className="space-y-4">
              <SectionCard title="Pending Tasks" icon={Bell}>
                {pendingTasks.length > 0 ? (
                  <div className="space-y-2">
                    {pendingTasks.map((task, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => router.push(task.href)}
                        className={`w-full text-left flex items-start gap-3 rounded-lg border p-3 transition hover:shadow-sm ${task.urgent ? 'border-rose-200 bg-rose-50/60 hover:bg-rose-50' : 'border-amber-200 bg-amber-50/60 hover:bg-amber-50'}`}
                      >
                        <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${task.urgent ? 'text-rose-600' : 'text-amber-600'}`} aria-hidden />
                        <p className="text-sm text-slate-800">{task.label}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 py-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" aria-hidden />
                    <p className="text-sm text-slate-600">All caught up — no pending tasks.</p>
                  </div>
                )}
              </SectionCard>
              <UpcomingEventsCard events={upcomingEvents.slice(0, 4)} />
            </div>
          </>
        )}
      </div>

      {/* ── Below-grid full-width sections ───────────────────────────────── */}

      {/* Accountant: fee arrears by class */}
      {isAccountant && Object.keys(feeData.byClass ?? {}).length > 0 && (
        <SectionCard
          title="Fee Arrears by Class"
          icon={DollarSign}
          action={<Link href="/fees/payments" className="text-xs font-medium text-rose-600 hover:underline flex items-center gap-1">View overdue <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(feeData.byClass)
              .sort(([, a], [, b]) => a.percent - b.percent)
              .map(([className, d]) => {
                const { bar, text } = feeColor(d.percent);
                return (
                  <div key={className} className="rounded-lg border border-slate-200/80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{className}</p>
                      <p className={`text-xs font-semibold ${text}`}>{d.percent}% paid</p>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full transition-all ${bar}`} style={{ width: `${Math.min(100, d.percent)}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-600">{d.paidCount}/{d.total} students · {formatCurrency(d.collected ?? 0)} collected</p>
                  </div>
                );
              })}
          </div>
        </SectionCard>
      )}

      {/* Accountant: top defaulters */}
      {isAccountant && topDefaulters.length > 0 && (
        <SectionCard
          title="Top Defaulters"
          icon={AlertCircle}
          action={<Link href="/fees" className="text-xs font-medium text-rose-600 hover:underline flex items-center gap-1">Full list <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  {['Student', 'Class', 'Paid', 'Outstanding', 'Last Payment'].map((h) => (
                    <th key={h} className={`py-2 px-1 text-xs font-semibold text-slate-500 uppercase tracking-wide ${h === 'Student' || h === 'Class' ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topDefaulters.map((d) => (
                  <tr key={d._id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-1"><p className="font-medium text-slate-900">{d.name}</p><p className="text-xs text-slate-500">{d.admissionNumber}</p></td>
                    <td className="py-2.5 px-1 text-slate-700">{d.className}</td>
                    <td className="py-2.5 px-1 text-right text-slate-700">{formatCurrency(d.paid)}</td>
                    <td className="py-2.5 px-1 text-right font-semibold text-rose-700">{formatCurrency(d.outstanding)}</td>
                    <td className="py-2.5 px-1 text-right text-xs text-slate-500">
                      {d.lastPaymentDate
                        ? new Date(d.lastPaymentDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })
                        : <span className="text-rose-500">Never</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Accountant: recent transactions */}
      {isAccountant && (
        <SectionCard
          title="Recent Transactions"
          icon={CreditCard}
          action={<Link href="/fees/payments" className="text-xs font-medium text-cyan-700 hover:underline">View all</Link>}
        >
          {recentPayments.length > 0 ? (
            <div className="space-y-2">
              {recentPayments.map((payment, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200/80 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{payment.name}</p>
                    <p className="text-xs text-slate-500 capitalize">{methodLabels[payment.method] ?? payment.method} · {payment.date} {payment.time}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(payment.amount)}</p>
                    {payment.receiptNumber && <p className="text-xs text-slate-400">{payment.receiptNumber}</p>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No payments recorded today.</p>
          )}
        </SectionCard>
      )}

      {/* Secretary: attendance breakdown */}
      {isSecretary && attendance.total > 0 && (
        <SectionCard
          title="Today's Attendance Breakdown"
          icon={CalendarCheck}
          action={<Link href="/attendance" className="text-xs font-medium text-cyan-700 hover:underline flex items-center gap-1">View registers <ArrowRight className="h-3 w-3" aria-hidden /></Link>}
        >
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Present', value: attendance.present, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
              { label: 'Absent',  value: attendance.absent,  color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200'    },
              { label: 'Late',    value: attendance.late,    color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200'  },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-lg border p-3 text-center ${bg}`}>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-600 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {attendancePct !== null && (
            <div className="mt-3">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={attendancePct} aria-valuemin={0} aria-valuemax={100}>
                <div className={`h-2 rounded-full ${attendancePct >= 90 ? 'bg-emerald-500' : attendancePct >= 75 ? 'bg-amber-400' : 'bg-rose-500'}`} style={{ width: `${attendancePct}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-1 text-center">{attendancePct}% attendance rate today</p>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Check-in widget (all roles) ───────────────────────────────────── */}
      <CheckInWidget hideButton />

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <nav aria-label="Quick actions">
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <Button onClick={() => router.push('/fees/payments')} className="gap-2 bg-cyan-700 hover:bg-cyan-800"><CreditCard className="h-4 w-4" aria-hidden /> Record Payment</Button>
              {studentsOverdue > 0 && <Button onClick={() => router.push('/fees')} variant="outline" className="gap-2 border-rose-300 text-rose-700 hover:bg-rose-50"><AlertTriangle className="h-4 w-4" aria-hidden /> View Overdue</Button>}
              <Button onClick={() => router.push('/attendance')} variant="outline" className="gap-2"><CalendarCheck className="h-4 w-4" aria-hidden /> Mark Attendance</Button>
              <Button onClick={() => router.push('/students')} variant="outline" className="gap-2"><Plus className="h-4 w-4" aria-hidden /> Enroll Student</Button>
              <Button onClick={() => router.push('/results')} variant="outline" className="gap-2"><FileText className="h-4 w-4" aria-hidden /> View Results</Button>
            </>
          )}
          {isAccountant && (
            <>
              <Button onClick={() => router.push('/fees/payments')} className="gap-2 bg-cyan-700 hover:bg-cyan-800"><CreditCard className="h-4 w-4" aria-hidden /> Record Payment</Button>
              <Button onClick={() => router.push('/fees/payments')} variant="outline" className="gap-2"><FileText className="h-4 w-4" aria-hidden /> Issue Receipts</Button>
              <Button onClick={() => router.push('/fees')} variant="outline" className="gap-2"><TrendingUp className="h-4 w-4" aria-hidden /> Fee Reports</Button>
              {studentsOverdue > 0 && <Button onClick={() => router.push('/fees')} variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"><AlertTriangle className="h-4 w-4" aria-hidden /> Follow-up List</Button>}
            </>
          )}
          {isSecretary && (
            <>
              <Button onClick={() => router.push('/students')} className="gap-2 bg-cyan-700 hover:bg-cyan-800"><Plus className="h-4 w-4" aria-hidden /> Enroll Student</Button>
              <Button onClick={() => router.push('/attendance')} variant="outline" className="gap-2"><CalendarCheck className="h-4 w-4" aria-hidden /> Attendance</Button>
              <Button onClick={() => router.push('/students')} variant="outline" className="gap-2"><Users className="h-4 w-4" aria-hidden /> Student Records</Button>
              <Button onClick={() => router.push('/fees/payments')} variant="outline" className="gap-2"><CreditCard className="h-4 w-4" aria-hidden /> Record Payment</Button>
            </>
          )}
          {isTeacher && (
            <>
              <Button onClick={() => router.push('/attendance')} className="gap-2 bg-cyan-700 hover:bg-cyan-800"><CalendarCheck className="h-4 w-4" aria-hidden /> Attendance</Button>
              <Button onClick={() => router.push('/lesson-plans')} variant="outline" className="gap-2"><ClipboardList className="h-4 w-4" aria-hidden /> Lesson Plans</Button>
              <Button onClick={() => router.push('/exams')} variant="outline" className="gap-2"><FileText className="h-4 w-4" aria-hidden /> Exams</Button>
              <Button onClick={() => router.push('/report-cards')} variant="outline" className="gap-2"><BookOpen className="h-4 w-4" aria-hidden /> Report Cards</Button>
              <Button onClick={() => router.push('/timetable')} variant="outline" className="gap-2"><Clock className="h-4 w-4" aria-hidden /> Timetable</Button>
            </>
          )}
        </div>
      </nav>
    </DashboardShell>
  );
}
