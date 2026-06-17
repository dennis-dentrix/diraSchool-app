'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save, BookOpen, ChevronDown } from 'lucide-react';
import { resultsApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useClasses, useSubjectsByClass, useStudentsByClass } from '@/hooks/use-app-queries';
import { EXAM_TYPES, ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { capitalize } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const TYPE_LABELS = {
  opener: 'Opener',
  midterm: 'Mid Term',
  endterm: 'End Term',
  sba: 'SBA',
};

const TYPE_COLORS = {
  opener:  'bg-blue-50 text-blue-700 border-blue-200',
  midterm: 'bg-amber-50 text-amber-700 border-amber-200',
  endterm: 'bg-green-50 text-green-700 border-green-200',
  sba:     'bg-purple-50 text-purple-700 border-purple-200',
};

// CBC grade from percentage
function cbcGrade(marks, total) {
  if (marks === '' || marks === undefined || marks === null || total <= 0) return null;
  const p = Math.round((Number(marks) / total) * 100);
  if (p >= 75) return { label: 'EE', color: 'text-green-700' };
  if (p >= 50) return { label: 'ME', color: 'text-blue-700' };
  if (p >= 25) return { label: 'AE', color: 'text-amber-700' };
  return { label: 'BE', color: 'text-red-700' };
}

// ── Marksheet Table ────────────────────────────────────────────────────────────
function MarksheetTable({ subjects, students, marks, totalMarks, onMarkChange, onTotalMarksChange, editing }) {
  const tableRef = useRef(null);

  if (students.length === 0 || subjects.length === 0) return null;

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="overflow-x-auto" ref={tableRef}>
        <table className="text-sm border-collapse" style={{ minWidth: `${300 + students.length * 90}px` }}>
          <thead>
            {/* Student names row */}
            <tr className="bg-muted/40 border-b">
              <th className="sticky left-0 z-10 bg-muted/40 text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground min-w-[180px] border-r">
                Subject
              </th>
              <th className="py-2.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground text-center min-w-[70px] border-r">
                Max
              </th>
              {students.map((s) => (
                <th key={s._id} className="py-2 px-2 min-w-[80px] max-w-[100px]">
                  <div className="text-[10px] font-medium text-foreground leading-tight text-center truncate" title={`${s.firstName} ${s.lastName}`}>
                    {s.firstName}
                  </div>
                  <div className="text-[9px] text-muted-foreground text-center truncate font-mono">
                    {s.admissionNumber}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {subjects.map((subj) => {
              const subjectId = subj._id;
              const total = totalMarks[subjectId] ?? 100;

              return (
                <tr key={subjectId} className="hover:bg-muted/10 transition-colors">
                  {/* Subject name — sticky */}
                  <td className="sticky left-0 z-10 bg-card py-2.5 px-3 font-medium border-r">
                    <span className="text-sm leading-tight">{subj.name}</span>
                    {subj.code && (
                      <span className="ml-1.5 text-[9px] text-muted-foreground font-mono">{subj.code}</span>
                    )}
                  </td>

                  {/* Total marks input */}
                  <td className="py-2 px-2 border-r text-center">
                    {editing ? (
                      <Input
                        type="number"
                        min={1}
                        value={total}
                        onChange={(e) => onTotalMarksChange(subjectId, Number(e.target.value))}
                        className="w-16 h-7 text-center text-xs font-mono tabular-nums mx-auto p-1"
                      />
                    ) : (
                      <span className="text-xs font-mono text-muted-foreground">{total}</span>
                    )}
                  </td>

                  {/* Student mark cells */}
                  {students.map((student) => {
                    const val   = marks[subjectId]?.[student._id] ?? '';
                    const isOver = val !== '' && Number(val) > total;
                    const grade  = val !== '' ? cbcGrade(val, total) : null;

                    return (
                      <td key={student._id} className="py-1.5 px-1.5 text-center">
                        {editing ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <Input
                              type="number"
                              min={0}
                              max={total}
                              placeholder="—"
                              value={val}
                              onChange={(e) => onMarkChange(subjectId, student._id, e.target.value)}
                              className={cn(
                                'w-16 h-7 text-center text-xs font-mono tabular-nums p-1',
                                isOver && 'border-red-400 focus-visible:ring-red-400'
                              )}
                            />
                            {grade && (
                              <span className={cn('text-[9px] font-semibold', grade.color)}>
                                {grade.label}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="font-mono text-sm tabular-nums">
                              {val !== '' ? val : <span className="text-muted-foreground opacity-40">—</span>}
                            </span>
                            {grade && (
                              <span className={cn('text-[9px] font-semibold', grade.color)}>
                                {grade.label}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Session summary strip ──────────────────────────────────────────────────────
function SessionSummary({ marks, totalMarks, subjects, students }) {
  const filled = useMemo(() => {
    let count = 0;
    for (const subjectId of Object.keys(marks)) {
      for (const studentId of Object.keys(marks[subjectId] ?? {})) {
        const v = marks[subjectId][studentId];
        if (v !== '' && v !== undefined) count++;
      }
    }
    return count;
  }, [marks]);

  const total = subjects.length * students.length;
  const pct   = total > 0 ? Math.round((filled / total) * 100) : 0;

  return (
    <div className="grid grid-cols-3 gap-px bg-border overflow-hidden rounded-lg border">
      {[
        { v: students.length,  l: 'Students'  },
        { v: subjects.length,  l: 'Subjects'  },
        { v: `${filled}/${total}`, l: 'Marks filled' },
      ].map(({ v, l }) => (
        <div key={l} className="bg-card py-3 text-center">
          <p className="text-lg font-bold font-mono tabular-nums">{v}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{l}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const queryClient = useQueryClient();
  const { academicYear: defaultYear, term: defaultTerm } = useSchoolTermDefaults(['results', 'term-defaults']);

  const [classId,      setClassId]      = useState('');
  const [examType,     setExamType]     = useState('');
  const [term,         setTerm]         = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [editing,      setEditing]      = useState(false);

  // marks[subjectId][studentId] = string value
  const [marks,      setMarks]      = useState({});
  // totalMarks[subjectId] = number
  const [totalMarks, setTotalMarks] = useState({});

  // Populate term/year defaults
  useEffect(() => {
    if (defaultTerm && !term)         setTerm(defaultTerm);
    if (defaultYear && !academicYear) setAcademicYear(defaultYear);
  }, [defaultTerm, defaultYear]);

  const sessionReady = !!(classId && examType && term && academicYear);

  // ── Data fetching ────────────────────────────────────────────────────────────
  const { data: classesData }                       = useClasses();
  const { data: subjectsData, isLoading: subjectsLoading } = useSubjectsByClass(classId);
  const { data: studentsData, isLoading: studentsLoading } = useStudentsByClass(classId);

  const { data: sessionData, isLoading: sessionLoading } = useQuery({
    queryKey: ['results', 'session', classId, examType, term, academicYear],
    queryFn: async () => {
      const res = await resultsApi.sessionGet({ classId, type: examType, term, academicYear });
      return res.data;
    },
    enabled: sessionReady,
  });

  // ── Populate marks & totalMarks from session data ──────────────────────────
  useEffect(() => {
    if (!sessionData) return;

    const newTotals = {};
    for (const exam of (sessionData.exams ?? [])) {
      const subjectId = typeof exam.subjectId === 'object' ? exam.subjectId._id : exam.subjectId;
      newTotals[subjectId] = exam.totalMarks;
    }

    const newMarks = {};
    for (const result of (sessionData.results ?? [])) {
      const examId    = typeof result.examId    === 'object' ? result.examId._id    : result.examId;
      const studentId = typeof result.studentId === 'object' ? result.studentId._id : result.studentId;
      // Find exam to get subjectId
      const exam = (sessionData.exams ?? []).find((e) => String(e._id) === String(examId));
      if (!exam) continue;
      const subjectId = typeof exam.subjectId === 'object' ? exam.subjectId._id : exam.subjectId;
      if (!newMarks[subjectId]) newMarks[subjectId] = {};
      newMarks[subjectId][studentId] = String(result.marks ?? '');
    }

    setTotalMarks((prev) => ({ ...prev, ...newTotals }));
    setMarks(newMarks);
    setEditing(!(sessionData.results?.length));
  }, [sessionData]);

  // ── Initialize totalMarks for new subjects (default 100) ──────────────────
  useEffect(() => {
    if (!subjectsData) return;
    setTotalMarks((prev) => {
      const next = { ...prev };
      for (const s of subjectsData) {
        if (!next[s._id]) next[s._id] = 100;
      }
      return next;
    });
  }, [subjectsData]);

  const classes  = Array.isArray(classesData) ? classesData : [];
  const subjects = Array.isArray(subjectsData) ? subjectsData : [];
  const students = Array.isArray(studentsData) ? studentsData : [];

  const hasExistingResults = !!(sessionData?.results?.length);
  const isLoading = sessionReady && (sessionLoading || subjectsLoading || studentsLoading);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleMarkChange = (subjectId, studentId, value) => {
    setMarks((prev) => ({
      ...prev,
      [subjectId]: { ...(prev[subjectId] ?? {}), [studentId]: value },
    }));
  };

  const handleTotalMarksChange = (subjectId, value) => {
    setTotalMarks((prev) => ({ ...prev, [subjectId]: value }));
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const { mutate: saveSession, isPending: saving } = useMutation({
    mutationFn: () => {
      const subjectsPayload = subjects.map((subj) => {
        const subjectId = subj._id;
        const total = totalMarks[subjectId] ?? 100;
        const entries = students
          .filter((s) => {
            const v = marks[subjectId]?.[s._id];
            return v !== '' && v !== undefined;
          })
          .map((s) => ({ studentId: s._id, marks: Number(marks[subjectId][s._id]) }));
        return { subjectId, totalMarks: total, entries };
      }).filter((s) => s.entries.length > 0);

      if (subjectsPayload.length === 0) throw new Error('Enter at least one mark before saving.');

      return resultsApi.sessionSave({ classId, type: examType, term, academicYear, subjects: subjectsPayload });
    },
    onSuccess: () => {
      toast.success('Results saved');
      queryClient.invalidateQueries({ queryKey: ['results', 'session', classId, examType, term, academicYear] });
      setEditing(false);
    },
    onError: (err) => showApiError(err),
  });

  const selectedClass = classes.find((c) => c._id === classId);
  const clsLabel = selectedClass
    ? `${selectedClass.name}${selectedClass.stream ? ` ${selectedClass.stream}` : ''}`
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Results"
        description="Enter exam results using the marksheet table"
      />

      {/* Session selector */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Select session</p>
        <div className="flex flex-wrap gap-2">
          {/* Class */}
          <Select value={classId} onValueChange={(v) => { setClassId(v); setMarks({}); setEditing(false); }}>
            <SelectTrigger className="h-9 w-44 text-xs">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}{c.stream ? ` ${c.stream}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Exam type */}
          <Select value={examType} onValueChange={(v) => { setExamType(v); setMarks({}); setEditing(false); }}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder="Exam type" />
            </SelectTrigger>
            <SelectContent>
              {EXAM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? capitalize(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Term */}
          <Select value={term} onValueChange={(v) => { setTerm(v); setMarks({}); setEditing(false); }}>
            <SelectTrigger className="h-9 w-28 text-xs">
              <SelectValue placeholder="Term" />
            </SelectTrigger>
            <SelectContent>
              {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Year */}
          <Select value={academicYear} onValueChange={(v) => { setAcademicYear(v); setMarks({}); setEditing(false); }}>
            <SelectTrigger className="h-9 w-24 text-xs">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Session label pill */}
        {sessionReady && (
          <div className="flex items-center gap-2 pt-1">
            <span className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
              TYPE_COLORS[examType] ?? 'bg-slate-50 text-slate-700 border-slate-200'
            )}>
              {TYPE_LABELS[examType]}
            </span>
            <span className="text-xs text-muted-foreground">
              {clsLabel} · {term} {academicYear}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      {!sessionReady ? (
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground text-sm">
          <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Select a class, exam type, term and year above to load the marksheet.</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : subjects.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground text-sm">
          No subjects found for this class. Add subjects first.
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground text-sm">
          No active students found in this class.
        </div>
      ) : (
        <>
          <SessionSummary
            marks={marks}
            totalMarks={totalMarks}
            subjects={subjects}
            students={students}
          />

          <MarksheetTable
            subjects={subjects}
            students={students}
            marks={marks}
            totalMarks={totalMarks}
            onMarkChange={handleMarkChange}
            onTotalMarksChange={handleTotalMarksChange}
            editing={editing}
          />

          {/* Action bar */}
          <div className="sticky bottom-4 flex justify-end gap-2">
            {editing ? (
              <>
                {hasExistingResults && (
                  <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                )}
                <Button onClick={() => saveSession()} disabled={saving} className="shadow-lg gap-1.5">
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving…' : 'Save Results'}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setEditing(true)} className="shadow-lg">
                Revise Marks
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
