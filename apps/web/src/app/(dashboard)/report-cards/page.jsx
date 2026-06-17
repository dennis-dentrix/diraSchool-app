'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Zap, Printer, ChevronRight, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { reportCardsApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useClasses, useAllStudents } from '@/hooks/use-app-queries';
import { capitalize } from '@/lib/utils';
import { ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PrivateImage } from '@/components/shared/private-image';

// ── Status pill ────────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const colors = status === 'published'
    ? 'bg-ok/10 text-ok border-ok/20'
    : 'bg-warn/10 text-warn border-warn/20';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium ${colors}`}>
      {capitalize(status)}
    </span>
  );
}

// ── Grade chip ─────────────────────────────────────────────────────────────────
const GRADE_COLORS = {
  EE: 'text-green-700', EE1: 'text-green-700', EE2: 'text-green-600',
  ME: 'text-blue-700',  ME1: 'text-blue-700',  ME2: 'text-blue-600',
  AE: 'text-amber-700', AE1: 'text-amber-700', AE2: 'text-amber-600',
  BE: 'text-red-700',   BE1: 'text-red-700',   BE2: 'text-red-600',
};

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ReportCardsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { academicYear: defaultAcademicYear, term: defaultTerm } = useSchoolTermDefaults(['report-cards', 'term-defaults']);

  const [page,         setPage]         = useState(1);
  const [open,         setOpen]         = useState(false);
  const [genType,      setGenType]      = useState('student');
  const [genData,      setGenData]      = useState({ academicYear: defaultAcademicYear, term: defaultTerm });
  const [classFilter,  setClassFilter]  = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [termFilter,   setTermFilter]   = useState('');
  const [yearFilter,   setYearFilter]   = useState('');

  const hasFilters = classFilter || statusFilter || termFilter || yearFilter;

  useEffect(() => {
    setGenData((prev) => ({ ...prev, academicYear: defaultAcademicYear, term: defaultTerm }));
  }, [defaultAcademicYear, defaultTerm]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-cards', page, classFilter, statusFilter, termFilter, yearFilter],
    queryFn: async () => {
      const res = await reportCardsApi.list({
        page, limit: 25,
        classId:      classFilter  || undefined,
        status:       statusFilter || undefined,
        term:         termFilter   || undefined,
        academicYear: yearFilter   || undefined,
      });
      return res.data;
    },
  });

  const { data: classesData  } = useClasses();
  const { data: studentsData } = useAllStudents();

  const { mutate: generate, isPending: generating } = useMutation({
    mutationFn: () => genType === 'class'
      ? reportCardsApi.generateClass(genData)
      : reportCardsApi.generate(genData),
    onSuccess: () => {
      toast.success('Report card(s) generated');
      queryClient.invalidateQueries({ queryKey: ['report-cards'] });
      setOpen(false);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: publish } = useMutation({
    mutationFn: (id) => reportCardsApi.publish(id),
    onSuccess: () => { toast.success('Published'); queryClient.invalidateQueries({ queryKey: ['report-cards'] }); },
    onError: (err) => showApiError(err),
  });

  const classes  = classesData ?? [];
  const cards    = data?.data ?? data?.reportCards ?? [];
  const totalPgs = data?.pagination?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      <PageHeader title="Report Cards" description="Generate and manage CBC report cards">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Zap className="h-4 w-4" /> Generate
        </Button>
      </PageHeader>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <Select value={classFilter} onValueChange={(v) => { setClassFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="All classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[120px] text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>

        <Select value={termFilter} onValueChange={(v) => { setTermFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[100px] text-xs"><SelectValue placeholder="All terms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All terms</SelectItem>
            {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[100px] text-xs"><SelectValue placeholder="All years" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9"
            onClick={() => { setClassFilter(''); setStatusFilter(''); setTermFilter(''); setYearFilter(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Hairline table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
          <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No report cards yet. Generate one to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[440px]">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Student</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Class</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Term / Year</th>
                <th className="text-center py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Grade</th>
                <th className="text-center py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                <th className="py-2.5 px-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {cards.map((rc) => {
                const s = typeof rc.studentId === 'object' ? rc.studentId : null;
                const c = typeof rc.classId   === 'object' ? rc.classId   : null;
                return (
                  <tr
                    key={rc._id}
                    className="hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => router.push(`/report-cards/${rc._id}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {s?.photo ? (
                          <PrivateImage src={s.photo} alt={`${s.firstName} ${s.lastName}`} className="w-7 h-7 rounded-full object-cover border shrink-0" />
                        ) : s ? (
                          <div className="w-7 h-7 rounded-full bg-muted text-foreground text-xs font-bold flex items-center justify-center shrink-0">
                            {s.firstName?.[0]}{s.lastName?.[0]}
                          </div>
                        ) : null}
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{s ? `${s.firstName} ${s.lastName}` : '—'}</p>
                          {s?.admissionNumber && (
                            <p className="text-[10px] text-muted-foreground font-mono">{s.admissionNumber}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-muted-foreground text-sm hidden sm:table-cell">
                      {c ? `${c.name}${c.stream ? ` ${c.stream}` : ''}` : '—'}
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell">
                      <span className="font-mono text-[11px] text-muted-foreground">{rc.term} · {rc.academicYear}</span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {rc.overallGrade ? (
                        <span className={`font-bold text-sm ${GRADE_COLORS[rc.overallGrade] ?? ''}`}>
                          {rc.overallGrade}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <StatusPill status={rc.status} />
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); window.open(`/report-cards/${rc._id}/print`, '_blank'); }}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                          title="Print"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPgs > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {totalPgs}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPgs} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Generate dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generate Report Card</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              {['student', 'class'].map((t) => (
                <Button key={t} size="sm" variant={genType === t ? 'default' : 'outline'}
                  onClick={() => { setGenType(t); setGenData((p) => ({ academicYear: p.academicYear, term: p.term })); }}>
                  {t === 'student' ? 'Single Student' : 'Entire Class'}
                </Button>
              ))}
            </div>

            {genType === 'student' ? (
              <div className="space-y-1.5">
                <Label>Student</Label>
                <Select onValueChange={(v) => setGenData((p) => ({ ...p, studentId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {(studentsData ?? []).map((s) => (
                      <SelectItem key={s._id} value={s._id}>{s.firstName} {s.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Class</Label>
                <Select onValueChange={(v) => setGenData((p) => ({ ...p, classId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Academic Year</Label>
                <Select value={genData.academicYear} onValueChange={(v) => setGenData((p) => ({ ...p, academicYear: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Term</Label>
                <Select value={genData.term} onValueChange={(v) => setGenData((p) => ({ ...p, term: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => generate()} disabled={generating}>
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
