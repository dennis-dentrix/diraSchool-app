'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Zap, MoreHorizontal, Save, BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { reportCardsApi, classesApi, studentsApi, examsApi, resultsApi, getErrorMessage } from '@/lib/api';
import { getStatusColor, capitalize } from '@/lib/utils';
import { ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

// ── Report Cards tab columns ──────────────────────────────────────────────────
function buildRcColumns(onPublish, onView, onPrint) {
  return [
    {
      id: 'student',
      header: 'Student',
      cell: ({ row }) => {
        const s = row.original.studentId;
        if (typeof s !== 'object') return <p className="font-medium text-sm">—</p>;
        return (
          <div className="flex items-center gap-2.5">
            {s.photo ? (
              <img src={s.photo} alt={`${s.firstName} ${s.lastName}`} className="w-7 h-7 rounded-full object-cover border shrink-0" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                {s.firstName?.[0]}{s.lastName?.[0]}
              </div>
            )}
            <p className="font-medium text-sm">{s.firstName} {s.lastName}</p>
          </div>
        );
      },
    },
    {
      id: 'class',
      header: 'Class',
      cell: ({ row }) => {
        const c = row.original.classId;
        return <span className="text-sm">{typeof c === 'object' ? c.name : '—'}</span>;
      },
    },
    { accessorKey: 'term',         header: 'Term',    cell: ({ row }) => <span className="text-sm">{row.original.term}</span> },
    { accessorKey: 'academicYear', header: 'Year',    cell: ({ row }) => <span className="text-sm">{row.original.academicYear}</span> },
    { accessorKey: 'overallGrade', header: 'Grade',   cell: ({ row }) => <span className="font-bold">{row.original.overallGrade ?? '—'}</span> },
    { accessorKey: 'averagePoints', header: 'Avg Pts', cell: ({ row }) => <span>{row.original.averagePoints?.toFixed(1) ?? '—'}</span> },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(row.original.status)}`}>
          {capitalize(row.original.status)}
        </span>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(row.original._id)}>View / Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPrint(row.original._id)}>Print</DropdownMenuItem>
            {row.original.status === 'draft' && (
              <DropdownMenuItem onClick={() => onPublish(row.original._id)}>Publish</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}

// ── Report Cards tab ──────────────────────────────────────────────────────────
function ReportCardsTab({ classesData, studentsData }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { academicYear: defaultAcademicYear, term: defaultTerm } = useSchoolTermDefaults(['report-cards', 'term-defaults']);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [genType, setGenType] = useState('student');
  const [genData, setGenData] = useState({ academicYear: defaultAcademicYear, term: defaultTerm });

  const [classFilter,  setClassFilter]  = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [termFilter,   setTermFilter]   = useState('');
  const [yearFilter,   setYearFilter]   = useState('');

  const hasFilters = classFilter || statusFilter || termFilter || yearFilter;

  useEffect(() => {
    setGenData((prev) => ({
      ...prev,
      academicYear: defaultAcademicYear,
      term: defaultTerm,
    }));
  }, [defaultAcademicYear, defaultTerm]);

  const { data, isLoading } = useQuery({
    queryKey: ['report-cards', page, classFilter, statusFilter, termFilter, yearFilter],
    queryFn: async () => {
      const res = await reportCardsApi.list({
        page, limit: 20,
        classId:      classFilter  || undefined,
        status:       statusFilter || undefined,
        term:         termFilter   || undefined,
        academicYear: yearFilter   || undefined,
      });
      return res.data;
    },
  });

  const { mutate: generate, isPending } = useMutation({
    mutationFn: () => genType === 'class'
      ? reportCardsApi.generateClass(genData)
      : reportCardsApi.generate(genData),
    onSuccess: () => {
      toast.success('Report card(s) generated');
      queryClient.invalidateQueries({ queryKey: ['report-cards'] });
      setOpen(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: publish } = useMutation({
    mutationFn: (id) => reportCardsApi.publish(id),
    onSuccess: () => { toast.success('Published'); queryClient.invalidateQueries({ queryKey: ['report-cards'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={classFilter} onValueChange={(v) => { setClassFilter(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue placeholder="All classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {(classesData?.data ?? []).map((c) => (
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

        <Button size="sm" onClick={() => setOpen(true)}>
          <Zap className="h-4 w-4" /> Generate
        </Button>
      </div>

      <DataTable
        columns={buildRcColumns(
          (id) => { if (confirm('Publish this report card? This cannot be undone.')) publish(id); },
          (id) => router.push(`/report-cards/${id}`),
          (id) => window.open(`/report-cards/${id}/print`, '_blank'),
        )}
        data={data?.data}
        loading={isLoading}
        pageCount={data?.pagination?.totalPages}
        currentPage={page}
        onPageChange={setPage}
      />

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
                    {(studentsData?.data ?? []).map((s) => (
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
                    {(classesData?.data ?? []).map((c) => (
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
            <Button onClick={() => generate()} disabled={isPending}>
              {isPending ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Enter Results tab ─────────────────────────────────────────────────────────
function EnterResultsTab({ classesData }) {
  const queryClient = useQueryClient();
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedExam,  setSelectedExam]  = useState('');
  const [marks, setMarks] = useState({});

  const { data: examsData } = useQuery({
    queryKey: ['exams', selectedClass],
    queryFn: async () => {
      const res = await examsApi.list({ classId: selectedClass, limit: 100 });
      return res.data;
    },
    enabled: !!selectedClass,
  });

  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['students', 'class', selectedClass],
    queryFn: async () => {
      const res = await studentsApi.list({ classId: selectedClass, status: 'active', limit: 200 });
      return res.data;
    },
    enabled: !!selectedClass,
  });

  const { data: existingResults } = useQuery({
    queryKey: ['results', selectedExam],
    queryFn: async () => {
      const res = await resultsApi.list({ examId: selectedExam, limit: 200 });
      return res.data;
    },
    enabled: !!selectedExam,
  });

  // Pre-fill marks from existing results when exam or results change
  useEffect(() => {
    if (!existingResults) return;
    const arr = existingResults?.data ?? existingResults?.results ?? (Array.isArray(existingResults) ? existingResults : []);
    const m = {};
    arr.forEach((r) => { m[r.studentId?._id ?? r.studentId] = String(r.marks ?? ''); });
    setMarks(m);
  }, [existingResults]);

  const { mutate: saveBulk, isPending } = useMutation({
    mutationFn: () => {
      const students = studentsData?.data ?? studentsData?.students ?? [];
      const entries = students
        .filter((s) => marks[s._id] !== '' && marks[s._id] !== undefined)
        .map((s) => ({ studentId: s._id, marks: Number(marks[s._id]) }));
      if (!entries.length) throw new Error('Enter at least one mark before saving.');
      return resultsApi.bulkUpsert({ examId: selectedExam, classId: selectedClass, entries });
    },
    onSuccess: () => {
      toast.success('Results saved');
      queryClient.invalidateQueries({ queryKey: ['results'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const classes  = classesData?.data ?? classesData?.classes ?? [];
  const exams    = examsData?.data ?? examsData?.exams ?? [];
  const students = studentsData?.data ?? studentsData?.students ?? [];
  const exam     = exams.find((e) => e._id === selectedExam);
  const total    = exam?.totalMarks ?? 100;

  const filled  = Object.values(marks).filter((v) => v !== '' && v !== undefined).length;
  const avgPct  = filled > 0
    ? Math.round(students.filter((s) => marks[s._id] !== '' && marks[s._id] !== undefined)
        .reduce((sum, s) => sum + Number(marks[s._id]), 0) / filled / total * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* Selector card */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setSelectedExam(''); setMarks({}); }}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Exam</Label>
              <Select value={selectedExam} onValueChange={(v) => { setSelectedExam(v); setMarks({}); }} disabled={!selectedClass}>
                <SelectTrigger><SelectValue placeholder={selectedClass ? 'Select exam' : 'Pick class first'} /></SelectTrigger>
                <SelectContent>
                  {exams.map((e) => (
                    <SelectItem key={e._id} value={e._id}>
                      {e.name} — {typeof e.subjectId === 'object' ? e.subjectId.name : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedExam && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">
                {exam?.name}
                <span className="text-muted-foreground font-normal text-sm ml-2">/ {total} marks</span>
              </CardTitle>
              {/* Stats row */}
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span><span className="font-semibold text-foreground">{students.length}</span> students</span>
                <span><span className="font-semibold text-foreground">{filled}</span> entered</span>
                {avgPct !== null && (
                  <span>Avg: <span className="font-semibold text-foreground">{avgPct}%</span></span>
                )}
              </div>
            </div>
            {/* Progress bar */}
            {students.length > 0 && (
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${Math.round(filled / students.length * 100)}%` }}
                />
              </div>
            )}
          </CardHeader>
          <CardContent>
            {studentsLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : students.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No active students in this class.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {students.map((student, idx) => {
                  const val = marks[student._id] ?? '';
                  const isOver = val !== '' && Number(val) > total;
                  return (
                    <div key={student._id} className="flex items-center gap-3 bg-muted/30 rounded-lg px-4 py-2.5">
                      <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{student.firstName} {student.lastName}</p>
                        <p className="text-xs text-muted-foreground">{student.admissionNumber}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={total}
                          placeholder="—"
                          value={val}
                          onChange={(e) => setMarks((p) => ({ ...p, [student._id]: e.target.value }))}
                          className={`w-20 h-8 text-center font-medium tabular-nums ${isOver ? 'border-red-400' : ''}`}
                        />
                        <span className="text-xs text-muted-foreground">/{total}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-4 flex justify-end">
                  <Button onClick={() => saveBulk()} disabled={isPending || filled === 0}>
                    <Save className="h-4 w-4 mr-1.5" /> {isPending ? 'Saving…' : 'Save Results'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AcademicPage() {
  const { data: classesData } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => { const res = await classesApi.list({ limit: 100 }); return res.data; },
  });

  const { data: studentsData } = useQuery({
    queryKey: ['students', 'all'],
    queryFn: async () => { const res = await studentsApi.list({ limit: 200, status: 'active' }); return res.data; },
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Results & Reports" description="Enter exam results and manage CBC report cards" />

      <Tabs defaultValue="report-cards">
        <TabsList className="mb-2">
          <TabsTrigger value="report-cards">Report Cards</TabsTrigger>
          <TabsTrigger value="results">Enter Results</TabsTrigger>
        </TabsList>

        <TabsContent value="report-cards">
          <ReportCardsTab classesData={classesData} studentsData={studentsData} />
        </TabsContent>

        <TabsContent value="results">
          <EnterResultsTab classesData={classesData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
