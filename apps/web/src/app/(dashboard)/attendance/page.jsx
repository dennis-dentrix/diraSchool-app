'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ClipboardCheck, ChevronRight, CheckCircle2, Clock, AlertCircle,
  BarChart3, Users, CalendarDays, Filter, UserCheck,
} from 'lucide-react';
import { attendanceApi, classesApi, settingsApi, usersApi, getErrorMessage } from '@/lib/api';
import { formatDate, capitalize } from '@/lib/utils';
import { useAuthStore, isAdmin } from '@/store/auth.store';
import { PageHeader } from '@/components/shared/page-header';
import { RefreshButton } from '@/components/shared/refresh-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { TERMS, ACADEMIC_YEARS } from '@/lib/constants';
import { getSchoolTermDefaults } from '@/lib/school-term';

const TODAY = new Date().toISOString().split('T')[0];

// ── Date helpers ───────────────────────────────────────────────────────────────
function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  return { from: mon.toISOString().split('T')[0], to: TODAY };
}

function getMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: first.toISOString().split('T')[0], to: TODAY };
}

function getPeriodParams(period, term, academicYear) {
  if (period === 'today') return { from: TODAY, to: TODAY };
  if (period === 'week')  return getWeekRange();
  if (period === 'month') return getMonthRange();
  if (period === 'term')  return { term, academicYear };
  return {};
}

// ── Aggregate helpers ──────────────────────────────────────────────────────────
function aggregateRegisters(registers) {
  const t = { present: 0, absent: 0, late: 0, half_day: 0, excused: 0, total: 0 };
  for (const reg of registers) {
    for (const entry of reg.entries ?? []) {
      t[entry.status] = (t[entry.status] ?? 0) + 1;
      t.total += 1;
    }
  }
  return t;
}

function aggregateByClass(registers) {
  const map = {};
  for (const reg of registers) {
    const cls = reg.classId;
    const key = typeof cls === 'object' ? cls._id : cls;
    const label = typeof cls === 'object' ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—';
    if (!map[key]) map[key] = { label, present: 0, absent: 0, late: 0, half_day: 0, excused: 0, total: 0 };
    for (const entry of reg.entries ?? []) {
      map[key][entry.status] = (map[key][entry.status] ?? 0) + 1;
      map[key].total += 1;
    }
  }
  return Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub }) {
  return (
    <div className={`rounded-xl px-4 py-3 text-center ${color}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium mt-0.5 opacity-80">{label}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Class register card (Today tab) ───────────────────────────────────────────
function ClassRegisterCard({ cls, todayReg, onOpen, onTake, isCreating, schoolClosed, classTeacher }) {
  const className = `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}`;
  const studentCount = cls.studentCount ?? 0;
  const teacherName = classTeacher
    ? `${classTeacher.firstName} ${classTeacher.lastName}`
    : null;

  if (!todayReg) {
    return (
      <Card className={`border-dashed transition-colors ${schoolClosed ? 'opacity-60' : 'hover:border-primary/40 hover:bg-primary/5'}`}>
        <CardContent className="flex items-center justify-between py-4 px-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <ClipboardCheck className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <p className="font-medium text-sm">{className}</p>
              <p className="text-xs text-muted-foreground">
                {studentCount > 0 ? `${studentCount} students · ` : ''}
                {teacherName ? `${teacherName} · ` : ''}
                {schoolClosed ? 'School closed today' : 'Not taken today'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => onTake(cls._id)}
            disabled={isCreating || schoolClosed}
            className="shrink-0"
            title={schoolClosed ? 'Attendance disabled — school is closed today' : undefined}
          >
            Take Attendance
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isSubmitted = todayReg.status === 'submitted';
  const entries = todayReg.entries ?? [];
  const presentCount  = entries.filter((e) => e.status === 'present').length;
  const absentCount   = entries.filter((e) => e.status === 'absent').length;
  const halfDayCount  = entries.filter((e) => e.status === 'half_day').length;
  const effectivePresent = presentCount + halfDayCount * 0.5;
  const rate = entries.length > 0 ? Math.round((effectivePresent / entries.length) * 100) : 0;

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all ${
        isSubmitted ? 'border-green-200 bg-green-50/30' : 'border-amber-200 bg-amber-50/30'
      }`}
      onClick={() => onOpen(todayReg._id)}
    >
      <CardContent className="flex items-center justify-between py-4 px-5">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            isSubmitted ? 'bg-green-100' : 'bg-amber-100'
          }`}>
            {isSubmitted
              ? <CheckCircle2 className="h-4 w-4 text-green-600" />
              : <Clock className="h-4 w-4 text-amber-600" />}
          </div>
          <div>
            <p className="font-medium text-sm">{className}</p>
            <p className="text-xs text-muted-foreground">
              {isSubmitted
                ? `Submitted · ${presentCount}P · ${absentCount}A${halfDayCount > 0 ? ` · ${halfDayCount}H` : ''}`
                : `Draft · ${entries.length} entries`}
              {todayReg.isSubstitute && todayReg.substituteTeacherId && (
                <span className="ml-1 text-blue-600">
                  · Sub: {todayReg.substituteTeacherId.firstName} {todayReg.substituteTeacherId.lastName}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSubmitted && entries.length > 0 && (
            <Badge
              className={`text-xs font-semibold ${
                rate >= 80 ? 'bg-green-100 text-green-800' :
                rate >= 60 ? 'bg-amber-100 text-amber-800' :
                'bg-red-100 text-red-800'
              }`}
              variant="secondary"
            >
              {rate}%
            </Badge>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isSubmitted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {isSubmitted ? 'Done' : 'In progress'}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Register row (Records tab) ────────────────────────────────────────────────
function RegisterRow({ reg, onOpen }) {
  const cls = reg.classId;
  const className = typeof cls === 'object' ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—';
  const isSubmitted = reg.status === 'submitted';
  const entries = reg.entries ?? [];
  const presentCount = entries.filter((e) => e.status === 'present').length;
  const halfDayCount = entries.filter((e) => e.status === 'half_day').length;
  const rate = entries.length > 0 ? Math.round(((presentCount + halfDayCount * 0.5) / entries.length) * 100) : 0;

  return (
    <div
      className="flex items-center justify-between py-3 px-4 hover:bg-muted/40 rounded-lg cursor-pointer transition-colors"
      onClick={() => onOpen(reg._id)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${isSubmitted ? 'bg-green-500' : 'bg-amber-400'}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{className}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(reg.date)} · {reg.term} {reg.academicYear}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-3">
        <span className="hidden sm:block text-xs text-muted-foreground tabular-nums">
          {presentCount}/{entries.length} present
        </span>
        {isSubmitted && entries.length > 0 && (
          <Badge
            className={`text-xs font-semibold min-w-[2.8rem] justify-center ${
              rate >= 80 ? 'bg-green-100 text-green-800' :
              rate >= 60 ? 'bg-amber-100 text-amber-800' :
              'bg-red-100 text-red-800'
            }`}
            variant="secondary"
          >
            {rate}%
          </Badge>
        )}
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isSubmitted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {capitalize(reg.status)}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

// ── Records tab ────────────────────────────────────────────────────────────────
function RecordsTab({ classes, adminView, defaultTerm, defaultAcademicYear }) {
  const router = useRouter();
  const [quickPeriod, setQuickPeriod] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [term, setTerm] = useState(defaultTerm);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  useEffect(() => {
    setTerm(defaultTerm);
    setAcademicYear(defaultAcademicYear);
  }, [defaultTerm, defaultAcademicYear]);

  // Teacher has exactly one class — always scope to it; don't let filter override
  const forcedClassId = !adminView && classes.length === 1 ? classes[0]._id : null;

  const queryParams = useMemo(() => {
    const p = { limit: LIMIT, page };
    const effectiveClass = forcedClassId ?? (classFilter || undefined);
    if (effectiveClass) p.classId = effectiveClass;
    if (statusFilter) p.status = statusFilter;
    if (quickPeriod === 'today') { p.from = TODAY; p.to = TODAY; }
    else if (quickPeriod === 'week')  { const r = getWeekRange(); p.from = r.from; p.to = r.to; }
    else if (quickPeriod === 'month') { const r = getMonthRange(); p.from = r.from; p.to = r.to; }
    else if (quickPeriod === 'term')  { p.term = term; p.academicYear = academicYear; }
    return p;
  }, [quickPeriod, classFilter, statusFilter, term, academicYear, page]);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-records', queryParams],
    queryFn: async () => {
      const res = await attendanceApi.listRegisters(queryParams);
      return res.data;
    },
  });

  const registers = data?.data ?? data?.registers ?? [];
  const totalPages = data?.pagination?.totalPages ?? data?.meta?.totalPages ?? 1;
  const hasFilters = quickPeriod || classFilter || statusFilter;

  return (
    <div className="space-y-4 pt-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

        <Select value={quickPeriod} onValueChange={(v) => { setQuickPeriod(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All periods" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All periods</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="term">By Term</SelectItem>
          </SelectContent>
        </Select>

        {quickPeriod === 'term' && (
          <>
            <Select value={term} onValueChange={(v) => { setTerm(v); setPage(1); }}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={academicYear} onValueChange={(v) => { setAcademicYear(v); setPage(1); }}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </>
        )}

        {adminView && classes.length > 1 && (
          <Select value={classFilter} onValueChange={(v) => { setClassFilter(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 text-xs"
            onClick={() => { setQuickPeriod(''); setClassFilter(''); setStatusFilter(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : registers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <AlertCircle className="h-8 w-8 opacity-40" />
          <p className="text-sm">No attendance records found</p>
          {hasFilters && <p className="text-xs">Try adjusting your filters</p>}
        </div>
      ) : (
        <Card>
          <CardContent className="p-2 divide-y">
            {registers.map((reg) => (
              <RegisterRow
                key={reg._id}
                reg={reg}
                onOpen={(id) => router.push(`/attendance/${id}`)}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

// ── Summary tab ────────────────────────────────────────────────────────────────
function SummaryTab({ classes, defaultTerm, defaultAcademicYear }) {
  const [period, setPeriod] = useState('week');
  const [summaryClass, setSummaryClass] = useState('');
  const [term, setTerm] = useState(defaultTerm);
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);

  useEffect(() => {
    setTerm(defaultTerm);
    setAcademicYear(defaultAcademicYear);
  }, [defaultTerm, defaultAcademicYear]);

  const forcedClassId = classes.length === 1 ? classes[0]._id : null;

  const periodParams = useMemo(() => getPeriodParams(period, term, academicYear), [period, term, academicYear]);

  const queryParams = useMemo(() => {
    const p = { limit: 500, status: 'submitted' };
    const effectiveClass = forcedClassId ?? (summaryClass || undefined);
    if (effectiveClass)             p.classId      = effectiveClass;
    if (periodParams?.from)         p.from         = periodParams.from;
    if (periodParams?.to)           p.to           = periodParams.to;
    if (periodParams?.term)         p.term         = periodParams.term;
    if (periodParams?.academicYear) p.academicYear = periodParams.academicYear;
    return p;
  }, [periodParams, summaryClass]);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-summary', queryParams],
    queryFn: async () => {
      const res = await attendanceApi.listRegisters(queryParams);
      return res.data;
    },
  });

  const registers = data?.data ?? data?.registers ?? [];
  const totals = useMemo(() => aggregateRegisters(registers), [registers]);
  const byClass = useMemo(() => aggregateByClass(registers), [registers]);
  const attendanceRate = totals.total > 0
    ? Math.round(((totals.present + (totals.half_day ?? 0) * 0.5) / totals.total) * 100)
    : null;

  const periodLabel = { today: 'Today', week: 'This Week', month: 'This Month', term: `${term} ${academicYear}` }[period] ?? '';

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap gap-2">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="term">By Term</SelectItem>
          </SelectContent>
        </Select>

        {period === 'term' && (
          <>
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={academicYear} onValueChange={setAcademicYear}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </>
        )}

        {classes.length > 1 && (
          <Select value={summaryClass} onValueChange={(v) => setSummaryClass(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : registers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <BarChart3 className="h-8 w-8 opacity-40" />
          <p className="text-sm">No submitted records for {periodLabel}</p>
          <p className="text-xs">Records appear here once attendance is submitted</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <StatCard
              label="Present"  value={totals.present}   color="bg-green-50 text-green-700"
              sub={totals.total > 0 ? `${Math.round((totals.present / totals.total) * 100)}%` : undefined}
            />
            <StatCard label="Absent"   value={totals.absent}            color="bg-red-50 text-red-700" />
            <StatCard label="Late"     value={totals.late}              color="bg-amber-50 text-amber-700" />
            <StatCard label="Half Day" value={totals.half_day ?? 0}     color="bg-purple-50 text-purple-700" />
            <StatCard label="Excused"  value={totals.excused}           color="bg-blue-50 text-blue-700" />
          </div>

          {attendanceRate !== null && (
            <div className="space-y-1.5 px-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Attendance rate · {periodLabel}</span>
                <span className={`font-bold text-sm ${
                  attendanceRate >= 80 ? 'text-green-600' :
                  attendanceRate >= 60 ? 'text-amber-600' : 'text-red-600'
                }`}>{attendanceRate}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${
                    attendanceRate >= 80 ? 'bg-green-500' :
                    attendanceRate >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${attendanceRate}%` }}
                />
              </div>
            </div>
          )}

          {!summaryClass && byClass.length > 1 && (
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" /> Per-Class Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {byClass.map((row) => {
                    const rate = row.total > 0 ? Math.round(((row.present + (row.half_day ?? 0) * 0.5) / row.total) * 100) : 0;
                    return (
                      <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                        <p className="text-sm font-medium">{row.label}</p>
                        <div className="flex items-center gap-3">
                          <div className="hidden sm:flex gap-2 text-xs">
                            <span className="text-green-700 font-medium">{row.present}P</span>
                            <span className="text-red-700 font-medium">{row.absent}A</span>
                            {row.late > 0 && <span className="text-amber-700 font-medium">{row.late}L</span>}
                            {(row.half_day ?? 0) > 0 && <span className="text-purple-700 font-medium">{row.half_day}H</span>}
                          </div>
                          <Badge
                            className={`text-xs font-semibold min-w-[3rem] justify-center ${
                              rate >= 80 ? 'bg-green-100 text-green-800' :
                              rate >= 60 ? 'bg-amber-100 text-amber-800' :
                              'bg-red-100 text-red-800'
                            }`}
                            variant="secondary"
                          >
                            {rate}%
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function checkSchoolClosedToday(_settings) {
  // Demo mode: allow attendance on any day
  return null;
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AttendancePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const adminView = isAdmin(user);
  const isTeacher = ['teacher', 'department_head'].includes(user?.role);

  const { data: schoolSettings } = useQuery({
    queryKey: ['school-settings'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
  });

  const schoolClosedReason = checkSchoolClosedToday(schoolSettings);
  const termDefaults = useMemo(() => getSchoolTermDefaults(schoolSettings), [schoolSettings]);

  const { data: classesData, isLoading: classesLoading } = useQuery({
    queryKey: isTeacher ? ['my-class'] : ['classes'],
    queryFn: async () => {
      if (isTeacher) {
        const res = await classesApi.myClass();
        // Return the full API payload so it's compatible with the dashboard cache shape
        return res.data?.data ?? res.data;
      }
      const res = await classesApi.list({ limit: 100 });
      return res.data?.data ?? res.data?.classes ?? [];
    },
  });

  // Normalise: dashboard stores { class, students, feeStructure }, attendance page
  // expects an array. Handle both shapes so they can share the same cache key.
  const classes = (() => {
    if (!classesData) return [];
    if (Array.isArray(classesData)) return classesData;
    if (classesData?.class) return [classesData.class];
    return [];
  })();

  const { data: todayRegisters, isLoading: todayLoading } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: async () => {
      const res = await attendanceApi.listRegisters({ date: TODAY, limit: 200 });
      return res.data?.data ?? res.data?.registers ?? [];
    },
  });

  // Substitute teacher assignment dialog (admin only)
  const [assignDialog, setAssignDialog] = useState({ open: false, classId: null });
  const [substituteId, setSubstituteId] = useState('');

  const { data: teachersData } = useQuery({
    queryKey: ['teachers-list'],
    queryFn: async () => {
      const res = await usersApi.list({ role: 'teacher', limit: 100 });
      const res2 = await usersApi.list({ role: 'department_head', limit: 100 });
      const all = [
        ...(res.data?.data ?? res.data?.users ?? []),
        ...(res2.data?.data ?? res2.data?.users ?? []),
      ];
      return all;
    },
    enabled: adminView,
  });
  const teachersList = teachersData ?? [];

  const { mutate: createRegister, isPending: isCreating } = useMutation({
    mutationFn: ({ classId, substituteTeacherId }) =>
      attendanceApi.createRegister({
        classId,
        date: TODAY,
        ...(substituteTeacherId ? { substituteTeacherId } : {}),
      }),
    onSuccess: (res) => {
      const newId = res.data?.register?._id ?? res.data?.data?._id ?? res.data?._id;
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      setAssignDialog({ open: false, classId: null });
      setSubstituteId('');
      if (newId) router.push(`/attendance/${newId}`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  function handleTakeAttendance(classId) {
    if (adminView) {
      setSubstituteId('');
      setAssignDialog({ open: true, classId });
    } else {
      createRegister({ classId });
    }
  }

  const today = Array.isArray(todayRegisters) ? todayRegisters : [];

  const todayDone    = today.filter((r) => r.status === 'submitted').length;
  const allEntries   = today.flatMap((r) => r.entries ?? []);
  const presentToday  = allEntries.filter((e) => e.status === 'present').length;
  const halfDayToday  = allEntries.filter((e) => e.status === 'half_day').length;
  const absentToday   = allEntries.filter((e) => e.status === 'absent').length;
  const rateToday     = allEntries.length > 0 ? Math.round(((presentToday + halfDayToday * 0.5) / allEntries.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance"
        description={`${formatDate(new Date())} · ${todayDone}/${classes.length} classes submitted today`}
      >
        <RefreshButton queryKeys={[['attendance-today'], ['attendance-records'], ['attendance-summary']]} />
      </PageHeader>

      {/* Today quick stats (admin only) */}
      {adminView && allEntries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Classes Done" value={`${todayDone}/${classes.length}`} color="bg-slate-50 text-slate-700" />
          <StatCard label="Present"      value={presentToday}  color="bg-green-50 text-green-700"  sub="today" />
          <StatCard label="Absent"       value={absentToday}   color="bg-red-50 text-red-700"     sub="today" />
          <StatCard label="Rate"         value={`${rateToday}%`} color="bg-blue-50 text-blue-700" sub="today" />
        </div>
      )}

      <Tabs defaultValue="today" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          <TabsTrigger value="today">
            <CalendarDays className="h-3.5 w-3.5 mr-1.5" />Today
          </TabsTrigger>
          <TabsTrigger value="records">
            <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />Records
          </TabsTrigger>
          <TabsTrigger value="summary">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />Summary
          </TabsTrigger>
        </TabsList>

        {/* ── Today Tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="today" className="space-y-3 pt-4">
          {/* School closed banner */}
          {schoolClosedReason && (
            <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <p className="text-sm font-medium">{schoolClosedReason} Attendance marking is disabled.</p>
            </div>
          )}

          {classesLoading || todayLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : classes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <AlertCircle className="h-8 w-8 opacity-40" />
              <div className="text-center">
                <p className="text-sm font-medium">No classes found</p>
                <p className="text-xs mt-1">
                  {isTeacher
                    ? 'You are not assigned as a class teacher to any class.'
                    : 'Add classes first to start taking attendance.'}
                </p>
              </div>
            </div>
          ) : (
            <>
            <div className="space-y-2">
              {classes.map((cls) => {
                const todayReg = today.find((r) => {
                  const regClassId = typeof r.classId === 'object' ? r.classId?._id : r.classId;
                  return String(regClassId) === String(cls._id);
                });
                return (
                  <ClassRegisterCard
                    key={cls._id}
                    cls={cls}
                    todayReg={todayReg}
                    classTeacher={cls.classTeacherId}
                    onOpen={(id) => router.push(`/attendance/${id}`)}
                    onTake={handleTakeAttendance}
                    isCreating={isCreating}
                    schoolClosed={!!schoolClosedReason}
                  />
                );
              })}
            </div>

            {/* Assign substitute teacher dialog (admin) */}
            <Dialog open={assignDialog.open} onOpenChange={(v) => {
              if (!v) { setAssignDialog({ open: false, classId: null }); setSubstituteId(''); }
            }}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    Start Attendance Register
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-1">
                  <div className="space-y-1.5">
                    <Label>Assign to teacher</Label>
                    <Select value={substituteId} onValueChange={setSubstituteId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Class teacher (default)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Class teacher (default)</SelectItem>
                        {teachersList.map((t) => (
                          <SelectItem key={t._id} value={t._id}>
                            {t.firstName} {t.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Leave as default if the class teacher will take attendance. Select another teacher if they are covering today.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setAssignDialog({ open: false, classId: null }); setSubstituteId(''); }}>
                    Cancel
                  </Button>
                  <Button
                    disabled={isCreating}
                    onClick={() => createRegister({
                      classId: assignDialog.classId,
                      substituteTeacherId: (substituteId && substituteId !== '__default__') ? substituteId : undefined,
                    })}
                  >
                    {isCreating ? 'Starting…' : 'Start Register'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </>
          )}
        </TabsContent>

        {/* ── Records Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="records">
          <RecordsTab
            classes={classes}
            adminView={adminView}
            defaultTerm={termDefaults.term}
            defaultAcademicYear={termDefaults.academicYear}
          />
        </TabsContent>

        {/* ── Summary Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="summary">
          <SummaryTab
            classes={classes}
            defaultTerm={termDefaults.term}
            defaultAcademicYear={termDefaults.academicYear}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
