'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronLeft, BookOpen, ExternalLink, BarChart2 } from 'lucide-react';
import { examsApi, resultsApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useStudentsByClass } from '@/hooks/use-app-queries';
import { capitalize } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const TABS = ['marks', 'setup', 'analysis'];

// CBC grade from percentage
function cbcGrade(marks, total, isJSS) {
  if (!marks && marks !== 0) return null;
  const p = Math.round((marks / total) * 100);
  if (isJSS) {
    if (p >= 90) return { label: 'EE1', color: 'bg-green-100 text-green-800' };
    if (p >= 75) return { label: 'EE2', color: 'bg-green-100 text-green-800' };
    if (p >= 58) return { label: 'ME1', color: 'bg-blue-100 text-blue-800' };
    if (p >= 41) return { label: 'ME2', color: 'bg-blue-100 text-blue-800' };
    if (p >= 31) return { label: 'AE1', color: 'bg-yellow-100 text-yellow-800' };
    if (p >= 21) return { label: 'AE2', color: 'bg-yellow-100 text-yellow-800' };
    if (p >= 11) return { label: 'BE1', color: 'bg-red-100 text-red-800' };
    return { label: 'BE2', color: 'bg-red-100 text-red-800' };
  }
  if (p >= 75) return { label: 'EE', color: 'bg-green-100 text-green-800' };
  if (p >= 50) return { label: 'ME', color: 'bg-blue-100 text-blue-800' };
  if (p >= 25) return { label: 'AE', color: 'bg-yellow-100 text-yellow-800' };
  return { label: 'BE', color: 'bg-red-100 text-red-800' };
}

// ── Marks Entry tab ────────────────────────────────────────────────────────────
function MarksTab({ exam, students, scores, setScores, onSave, saving, hasExistingResults }) {
  const total    = exam?.totalMarks ?? 100;
  const isJSS    = exam?.levelCategory === 'Junior Secondary';
  const filled   = Object.values(scores).filter((v) => v !== '' && v !== undefined).length;
  const pct      = students.length > 0 ? Math.round(filled / students.length * 100) : 0;
  const [editing, setEditing] = useState(!hasExistingResults);

  if (students.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No students found in this class.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Progress line — only visible when editing */}
      {editing && (
        <div className="h-px bg-border overflow-hidden mb-0">
          <div className="h-full bg-foreground transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-px bg-border overflow-hidden rounded-lg border mb-4">
        {[
          { v: students.length, l: 'Students' },
          { v: filled,          l: 'Entered' },
          { v: filled > 0
              ? `${Math.round(students.filter((s) => scores[s._id] !== '' && scores[s._id] !== undefined)
                  .reduce((sum, s) => sum + Number(scores[s._id]), 0) / filled / total * 100)}%`
              : '—',
            l: 'Class avg' },
        ].map(({ v, l }) => (
          <div key={l} className="bg-card py-3 text-center">
            <p className="text-xl font-bold font-mono tabular-nums">{v}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      {/* Roster */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-8">#</th>
              <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Student</th>
              <th className="text-right py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Marks <span className="font-mono font-normal">/{total}</span>
              </th>
              <th className="py-2.5 px-3 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {students.map((student, idx) => {
              const val    = scores[student._id] ?? '';
              const grade  = val !== '' ? cbcGrade(Number(val), total, isJSS) : null;
              const isOver = val !== '' && Number(val) > total;
              return (
                <tr key={student._id} className="hover:bg-muted/20">
                  <td className="py-2.5 px-4 text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
                  <td className="py-2.5 px-3">
                    <p className="font-medium text-sm">{student.firstName} {student.lastName}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{student.admissionNumber}</p>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {editing ? (
                      <Input
                        type="number"
                        min={0}
                        max={total}
                        placeholder="—"
                        value={val}
                        onChange={(e) => setScores((p) => ({ ...p, [student._id]: e.target.value }))}
                        className={cn(
                          'w-20 h-8 text-center font-mono tabular-nums ml-auto',
                          isOver && 'border-red-400 focus-visible:ring-red-400'
                        )}
                      />
                    ) : (
                      <span className="font-mono tabular-nums text-sm">
                        {val !== '' ? val : <span className="text-muted-foreground">—</span>}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {grade && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', grade.color)}>
                        {grade.label}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-4 mt-4 flex justify-end gap-2">
        {editing ? (
          <>
            {hasExistingResults && (
              <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            )}
            <Button onClick={onSave} disabled={saving || filled === 0} className="shadow-lg">
              {saving ? 'Saving…' : 'Save Results'}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setEditing(true)} className="shadow-lg">
            Revise Marks
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Setup tab ──────────────────────────────────────────────────────────────────
function SetupTab({ exam }) {
  if (!exam) return null;
  const cls  = typeof exam.classId   === 'object' ? exam.classId  : null;
  const subj = typeof exam.subjectId === 'object' ? exam.subjectId : null;

  const rows = [
    { label: 'Exam name',     value: exam.name },
    { label: 'Class',         value: cls ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—' },
    { label: 'Subject',       value: subj?.name ?? '—' },
    { label: 'Type',          value: capitalize(exam.type) },
    { label: 'Term',          value: exam.term },
    { label: 'Academic year', value: exam.academicYear },
    { label: 'Total marks',   value: exam.totalMarks },
  ];

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {rows.map(({ label, value }) => (
            <tr key={label} className="hover:bg-muted/20">
              <td className="py-3 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-40">{label}</td>
              <td className="py-3 px-4 font-medium">{value ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {exam.examPaperUrl && (
        <div className="px-4 py-3 bg-muted/20 border-t">
          <a
            href={exam.examPaperUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View exam paper
          </a>
        </div>
      )}
    </div>
  );
}

// ── Analysis tab ───────────────────────────────────────────────────────────────
function AnalysisTab({ exam, students, scores }) {
  const total = exam?.totalMarks ?? 100;
  const isJSS = exam?.levelCategory === 'Junior Secondary';

  const gradeCounts = {};
  for (const student of students) {
    const val = scores[student._id];
    if (val === '' || val === undefined) continue;
    const g = cbcGrade(Number(val), total, isJSS);
    if (g) gradeCounts[g.label] = (gradeCounts[g.label] ?? 0) + 1;
  }

  const GRADE_KEYS = isJSS
    ? ['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2']
    : ['EE', 'ME', 'AE', 'BE'];
  const GRADE_COLORS = {
    EE: 'bg-green-500', EE1: 'bg-green-500', EE2: 'bg-green-400',
    ME: 'bg-blue-500',  ME1: 'bg-blue-500',  ME2: 'bg-blue-400',
    AE: 'bg-amber-500', AE1: 'bg-amber-500', AE2: 'bg-amber-400',
    BE: 'bg-red-500',   BE1: 'bg-red-500',   BE2: 'bg-red-400',
  };

  const entered = Object.values(scores).filter((v) => v !== '' && v !== undefined);
  const max = Math.max(...Object.values(gradeCounts), 1);

  if (entered.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Enter marks to see analysis.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-px bg-border overflow-hidden rounded-lg border">
        {[
          { v: entered.length, l: 'Entered' },
          { v: `${Math.round(entered.reduce((s, v) => s + Number(v), 0) / entered.length / total * 100)}%`, l: 'Class avg' },
          { v: `${Math.round(Math.max(...entered.map(Number)) / total * 100)}%`, l: 'Top score' },
        ].map(({ v, l }) => (
          <div key={l} className="bg-card py-4 text-center">
            <p className="text-xl font-bold font-mono">{v}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/30 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Grade distribution
        </div>
        <div className="p-4 space-y-3">
          {GRADE_KEYS.map((g) => {
            const count = gradeCounts[g] ?? 0;
            const w = count > 0 ? Math.round(count / max * 100) : 0;
            return (
              <div key={g} className="flex items-center gap-3">
                <span className="text-xs font-mono font-semibold w-8 text-right shrink-0">{g}</span>
                <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                  <div className={`h-full rounded ${GRADE_COLORS[g] ?? 'bg-slate-500'} transition-all`} style={{ width: `${w}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-6 shrink-0">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ExamDetailPage() {
  const params = useParams();
  const id     = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab,    setTab]    = useState('marks');
  const [scores, setScores] = useState({});

  const { data: examData, isLoading: examLoading } = useQuery({
    queryKey: ['exam', id],
    queryFn: async () => {
      const res = await examsApi.get(id);
      return res.data?.exam ?? res.data?.data ?? res.data;
    },
    enabled: !!id,
  });

  const classId = examData?.classId?._id ?? examData?.classId;

  const { data: studentsData, isLoading: studentsLoading } = useStudentsByClass(classId);

  const { data: existingResults } = useQuery({
    queryKey: ['results', 'exam', id],
    queryFn: async () => {
      const res = await resultsApi.list({ examId: id, limit: 200 });
      return res.data?.results ?? res.data?.data ?? res.data ?? [];
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!existingResults?.length) return;
    const map = {};
    for (const r of (Array.isArray(existingResults) ? existingResults : [])) {
      const sid = typeof r.studentId === 'object' ? r.studentId._id : r.studentId;
      map[sid] = String(r.marks ?? '');
    }
    setScores(map);
  }, [existingResults]);

  const { mutate: saveResults, isPending: saving } = useMutation({
    mutationFn: () => {
      const students = Array.isArray(studentsData) ? studentsData : [];
      const entries  = students
        .filter((s) => scores[s._id] !== '' && scores[s._id] !== undefined)
        .map((s) => ({ studentId: s._id, marks: Number(scores[s._id]) }));
      if (!entries.length) throw new Error('Enter at least one mark to save.');
      return resultsApi.bulkUpsert({ examId: id, classId, entries });
    },
    onSuccess: () => {
      toast.success('Results saved');
      queryClient.invalidateQueries({ queryKey: ['results', 'exam', id] });
    },
    onError: (err) => showApiError(err),
  });

  const isLoading = examLoading || studentsLoading;
  const exam      = examData;
  const students  = Array.isArray(studentsData) ? studentsData : [];

  if (isLoading) {
    return (
      <div className="space-y-3 max-w-2xl">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-72" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  const cls   = typeof exam?.classId   === 'object' ? exam.classId  : null;
  const subj  = typeof exam?.subjectId === 'object' ? exam.subjectId : null;
  const clsName  = cls  ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—';
  const subjName = subj?.name ?? '—';

  return (
    <div className="max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.push('/exams')} className="mt-1 p-1 rounded-md hover:bg-muted text-muted-foreground shrink-0">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl font-bold leading-tight">{exam?.name}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono text-[11px]">
            {clsName} · {subjName} · {exam?.term} {exam?.academicYear}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b">
        <div className="flex gap-0">
          {[
            { key: 'marks',    label: 'Marks Entry' },
            { key: 'setup',    label: 'Setup' },
            { key: 'analysis', label: 'Analysis' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === key
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {/* 1px progress line under tabs when on marks tab */}
        {tab === 'marks' && students.length > 0 && (() => {
          const filled = Object.values(scores).filter((v) => v !== '' && v !== undefined).length;
          const pct    = students.length > 0 ? Math.round(filled / students.length * 100) : 0;
          return (
            <div className="h-px bg-border overflow-hidden">
              <div className="h-full bg-foreground/60 transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          );
        })()}
      </div>

      {/* Tab content */}
      {tab === 'marks' && (
        <MarksTab
          exam={exam}
          students={students}
          scores={scores}
          setScores={setScores}
          onSave={() => saveResults()}
          saving={saving}
          hasExistingResults={!!(existingResults?.length)}
        />
      )}
      {tab === 'setup' && <SetupTab exam={exam} />}
      {tab === 'analysis' && <AnalysisTab exam={exam} students={students} scores={scores} />}
    </div>
  );
}
