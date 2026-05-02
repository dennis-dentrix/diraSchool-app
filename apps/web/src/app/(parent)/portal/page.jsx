'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { parentApi, settingsApi } from '@/lib/api';
import { formatDate, formatCurrency, capitalize } from '@/lib/utils';
import { ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { GraduationCap, School, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

// ── Child Selector ────────────────────────────────────────────────────────────
function ChildSelector({ children, selected, onSelect }) {
  const totalChildren = children.length;
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-800">Children</p>
        <p className="text-xs text-muted-foreground">
          {totalChildren} learner{totalChildren === 1 ? '' : 's'} linked
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {children.map((child) => {
          const active = selected === child._id;
          const classLabel = typeof child.classId === 'object'
            ? `${child.classId.name}${child.classId.stream ? ` ${child.classId.stream}` : ''}`
            : 'No class assigned';
          return (
            <button
              key={child._id}
              onClick={() => onSelect(child._id)}
              className={`min-w-[230px] text-left rounded-xl border p-3 transition-all ${
                active
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              <div className="flex items-start gap-2">
                {child.photo ? (
                  <img
                    src={child.photo}
                    alt={`${child.firstName} ${child.lastName}`}
                    className="w-8 h-8 rounded-full object-cover border shrink-0"
                  />
                ) : (
                  <span className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {child.firstName?.[0]}{child.lastName?.[0]}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{child.firstName} {child.lastName}</p>
                  <p className={`text-[11px] truncate ${active ? 'text-blue-100' : 'text-muted-foreground'}`}>
                    Adm: {child.admissionNumber}
                  </p>
                  <p className={`text-[11px] truncate ${active ? 'text-blue-100' : 'text-muted-foreground'}`}>
                    {classLabel}
                  </p>
                </div>
                {active && <Badge className="ml-auto bg-white/20 text-white border-white/20">Active</Badge>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, value, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    yellow: 'bg-yellow-50 text-yellow-700',
  };
  return (
    <div className={`rounded-xl px-4 py-3 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-0.5">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

// ── Term filter bar ───────────────────────────────────────────────────────────
function TermFilter({ academicYear, term, onYearChange, onTermChange }) {
  return (
    <div className="flex gap-2 items-center flex-wrap">
      <Select value={academicYear} onValueChange={onYearChange}>
        <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={term} onValueChange={onTermChange}>
        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {TERMS.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// ── Fees tab ──────────────────────────────────────────────────────────────────
function FeesTab({ studentId, defaultAcademicYear, defaultTerm }) {
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [term, setTerm] = useState(defaultTerm);

  useEffect(() => {
    setAcademicYear(defaultAcademicYear);
    setTerm(defaultTerm);
  }, [defaultAcademicYear, defaultTerm]);

  const { data, isLoading } = useQuery({
    queryKey: ['parent-fees', studentId, academicYear, term],
    queryFn: async () => {
      const res = await parentApi.fees(studentId, { academicYear, term });
      return res.data.data ?? res.data;
    },
    enabled: !!studentId,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const totalBilled = data?.totalBilled ?? 0;
  const totalPaid = data?.totalPaid ?? 0;
  const balance = data?.balance ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-muted-foreground">Fee Summary</p>
        <TermFilter
          academicYear={academicYear} term={term}
          onYearChange={setAcademicYear} onTermChange={setTerm}
        />
      </div>

      {totalBilled === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No fee structure found for {term} {academicYear}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatPill label="Total Billed" value={formatCurrency(totalBilled)} color="blue" />
            <StatPill label="Paid" value={formatCurrency(totalPaid)} color="green" />
            <StatPill label="Balance" value={formatCurrency(balance)} color={balance > 0 ? 'red' : 'green'} />
          </div>

          {balance > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              A balance of <strong>{formatCurrency(balance)}</strong> is outstanding. Please clear fees at the school bursar.
            </div>
          )}

          {balance === 0 && totalPaid > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Fees are fully paid for {term} {academicYear}.
            </div>
          )}
        </>
      )}

      {(data?.payments ?? []).length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Payment History</CardTitle>
              {data.payments.length > 3 && (
                <span className="text-xs text-muted-foreground">{data.payments.length} payments total</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {data.payments.slice(0, 3).map((p, i) => (
                <div key={p._id ?? i} className="flex justify-between items-center py-3">
                  <div>
                    <p className="text-sm font-medium">{p.description ?? 'Payment'}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {formatDate(p.paidAt ?? p.createdAt)} · {p.method}
                      {p.reference ? ` · Ref: ${p.reference}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-green-600">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
            {data.payments.length > 3 && (
              <p className="text-xs text-muted-foreground text-center pt-3 border-t mt-1">
                Showing 3 of {data.payments.length} payments. Contact the school bursar for a full statement.
              </p>
            )}
          </CardContent>
        </Card>
      ) : totalBilled > 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No payments recorded yet.</p>
      ) : null}

      {balance > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 flex items-center justify-between gap-3">
          <span>To pay fees, visit the school bursar with your admission number.</span>
        </div>
      )}
    </div>
  );
}

// ── Attendance tab ────────────────────────────────────────────────────────────
function AttendanceTab({ studentId, defaultAcademicYear, defaultTerm }) {
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [term, setTerm] = useState(defaultTerm);

  useEffect(() => {
    setAcademicYear(defaultAcademicYear);
    setTerm(defaultTerm);
  }, [defaultAcademicYear, defaultTerm]);

  const { data, isLoading } = useQuery({
    queryKey: ['parent-attendance', studentId, academicYear, term],
    queryFn: async () => {
      const res = await parentApi.attendance(studentId, { academicYear, term });
      return res.data.data ?? res.data;
    },
    enabled: !!studentId,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const summary = data?.summary ?? { present: 0, absent: 0, late: 0, excused: 0 };
  const records = data?.records ?? [];
  const total = (summary.present + summary.absent + summary.late + summary.excused) || 1;
  const rate = Math.round((summary.present / total) * 100);

  const statusColors = {
    present: 'bg-green-100 text-green-700',
    absent: 'bg-red-100 text-red-700',
    late: 'bg-yellow-100 text-yellow-700',
    excused: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-muted-foreground">Attendance</p>
        <TermFilter
          academicYear={academicYear} term={term}
          onYearChange={setAcademicYear} onTermChange={setTerm}
        />
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No attendance records for {term} {academicYear}.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill label="Present" value={summary.present} color="green" />
            <StatPill label="Absent" value={summary.absent} color="red" />
            <StatPill label="Late" value={summary.late} color="yellow" />
            <StatPill label="Attendance Rate" value={`${rate}%`} color={rate >= 80 ? 'green' : 'red'} />
          </div>

          {rate < 80 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Attendance is below the recommended 80%. Please contact the class teacher.
            </div>
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Recent Records</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y">
                {records.slice(0, 20).map((r) => (
                  <div key={r._id} className="flex justify-between items-center py-2.5">
                    <p className="text-sm">{formatDate(r.date)}</p>
                    <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${statusColors[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Results / Assessments tab ─────────────────────────────────────────────────
function ResultsTab({ studentId, defaultAcademicYear, defaultTerm }) {
  const [academicYear, setAcademicYear] = useState(defaultAcademicYear);
  const [term, setTerm] = useState(defaultTerm);

  useEffect(() => {
    setAcademicYear(defaultAcademicYear);
    setTerm(defaultTerm);
  }, [defaultAcademicYear, defaultTerm]);

  const { data, isLoading } = useQuery({
    queryKey: ['parent-results', studentId, academicYear, term],
    queryFn: async () => {
      const res = await parentApi.results(studentId, { academicYear, term });
      return res.data.data ?? res.data;
    },
    enabled: !!studentId,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  const results = Array.isArray(data) ? data : (data?.results ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-muted-foreground">Assessments &amp; Results</p>
        <TermFilter
          academicYear={academicYear} term={term}
          onYearChange={setAcademicYear} onTermChange={setTerm}
        />
      </div>

      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No results for {term} {academicYear}.</p>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <Card key={r._id}>
              <CardContent className="py-3 px-4 flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium">
                    {typeof r.subjectId === 'object' ? r.subjectId.name : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {typeof r.examId === 'object' ? r.examId.name : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-blue-600">
                    {r.score ?? r.marks ?? r.grade ?? '—'}
                  </p>
                  {r.totalMarks && <p className="text-xs text-muted-foreground">/ {r.totalMarks}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── School Info tab ───────────────────────────────────────────────────────────
function SchoolTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['parent-school-info'],
    queryFn: async () => {
      try {
        const res = await settingsApi.get();
        return res.data.data ?? res.data;
      } catch {
        return null;
      }
    },
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  const holidays = data?.holidays ?? [];
  const now = new Date();
  const upcoming = holidays
    .filter((h) => new Date(h.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const past = holidays
    .filter((h) => new Date(h.date) < now)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 3);

  return (
    <div className="space-y-4">
      {/* School details */}
      {data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <School className="h-4 w-4" />School Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.principalName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Principal</span>
                <span className="font-medium">{data.principalName}</span>
              </div>
            )}
            {data.physicalAddress && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Address</span>
                <span className="text-right max-w-[55%]">{data.physicalAddress}</span>
              </div>
            )}
            {data.motto && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Motto</span>
                <span className="italic">{data.motto}</span>
              </div>
            )}
            {data.phone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{data.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Academic Year</span>
              <span>{data.currentAcademicYear ?? '—'}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming holidays / school calendar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />Upcoming Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events scheduled.</p>
          ) : (
            <div className="divide-y">
              {upcoming.map((h) => (
                <div key={h._id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium">{h.name}</p>
                    {h.description && <p className="text-xs text-muted-foreground">{h.description}</p>}
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{formatDate(h.date)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent past holidays */}
      {past.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {past.map((h) => (
                <div key={h._id} className="flex items-center justify-between py-2.5 opacity-60">
                  <p className="text-sm">{h.name}</p>
                  <span className="text-xs text-muted-foreground">{formatDate(h.date)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!data && (
        <p className="text-sm text-muted-foreground text-center py-8">
          School information is not available. Contact the school office.
        </p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ParentPortalPage() {
  const [selectedChild, setSelectedChild] = useState(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const validTabs = ['fees', 'attendance', 'results', 'school'];
  const [activeTab, setActiveTab] = useState(validTabs.includes(tabFromUrl) ? tabFromUrl : 'fees');
  const { academicYear: defaultAcademicYear, term: defaultTerm } = useSchoolTermDefaults(['parent-settings', 'term-defaults']);

  const { data: childrenData, isLoading } = useQuery({
    queryKey: ['parent-children'],
    queryFn: async () => {
      const res = await parentApi.children();
      return res.data.data ?? res.data;
    },
  });

  useEffect(() => {
    if (childrenData?.length && !selectedChild) {
      setSelectedChild(childrenData[0]._id);
    }
  }, [childrenData, selectedChild]);

  useEffect(() => {
    if (validTabs.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    } else if (!tabFromUrl) {
      setActiveTab('fees');
    }
  }, [tabFromUrl]);

  const children = Array.isArray(childrenData) ? childrenData : (childrenData?.children ?? []);
  const child = children.find((c) => c._id === selectedChild);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!children.length) {
    return (
      <div className="text-center py-16">
        <GraduationCap className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-40" />
        <h2 className="text-lg font-semibold mb-1">No children linked</h2>
        <p className="text-sm text-muted-foreground">Contact your school to link your children to this account.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Child selector (only when more than one child) */}
      {children.length > 1 && (
        <ChildSelector children={children} selected={selectedChild} onSelect={setSelectedChild} />
      )}

      {/* Active child card */}
      {child && (
        <div className="flex items-center gap-3 p-4 bg-white rounded-xl border">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-sm shrink-0">
            {child.firstName?.[0]}{child.lastName?.[0]}
          </div>
          <div>
            <p className="font-semibold">{child.firstName} {child.lastName}</p>
            <p className="text-xs text-muted-foreground">
              {typeof child.classId === 'object'
                ? `${child.classId.name}${child.classId.stream ? ` ${child.classId.stream}` : ''}`
                : 'No class assigned'}
              {' · '}Adm No: {child.admissionNumber}
            </p>
          </div>
          <span className={`ml-auto text-xs px-2 py-1 rounded-full font-medium capitalize ${
            child.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {capitalize(child.status ?? '')}
          </span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(next) => {
        setActiveTab(next);
        router.replace(`/portal?tab=${next}`, { scroll: false });
      }}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="fees" className="text-xs sm:text-sm">
            Fees
          </TabsTrigger>
          <TabsTrigger value="attendance" className="text-xs sm:text-sm">
            Attendance
          </TabsTrigger>
          <TabsTrigger value="results" className="text-xs sm:text-sm">
            Results
          </TabsTrigger>
          <TabsTrigger value="school" className="text-xs sm:text-sm">
            School Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fees" className="mt-4">
          {selectedChild ? (
            <FeesTab
              studentId={selectedChild}
              defaultAcademicYear={defaultAcademicYear}
              defaultTerm={defaultTerm}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="attendance" className="mt-4">
          {selectedChild ? (
            <AttendanceTab
              studentId={selectedChild}
              defaultAcademicYear={defaultAcademicYear}
              defaultTerm={defaultTerm}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="results" className="mt-4">
          {selectedChild ? (
            <ResultsTab
              studentId={selectedChild}
              defaultAcademicYear={defaultAcademicYear}
              defaultTerm={defaultTerm}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="school" className="mt-4">
          <SchoolTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
