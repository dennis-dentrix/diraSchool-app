'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle, Save, Lock, ChevronLeft, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { attendanceApi, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

// P / A / L / H / E pill button
const STATUS_CONFIG = {
  present:  { label: 'P', long: 'Present',  color: 'bg-green-500 text-white ring-green-500' },
  absent:   { label: 'A', long: 'Absent',   color: 'bg-red-500 text-white ring-red-500' },
  late:     { label: 'L', long: 'Late',     color: 'bg-amber-500 text-white ring-amber-500' },
  half_day: { label: 'H', long: 'Half Day', color: 'bg-purple-500 text-white ring-purple-500' },
  excused:  { label: 'E', long: 'Excused',  color: 'bg-blue-500 text-white ring-blue-500' },
};

const STATUSES = Object.keys(STATUS_CONFIG);

function StatusButton({ status, active, disabled, onClick }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-10 h-10 rounded-full text-sm font-bold transition-all',
        active
          ? `${cfg.color} ring-2 ring-offset-1 scale-105 shadow`
          : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {cfg.label}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AttendanceRegisterPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState([]);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-register', id],
    queryFn: async () => {
      const res = await attendanceApi.getRegister(id);
      return res.data.data ?? res.data.register;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (data?.entries) {
      setEntries(
        data.entries.map((e) => ({
          studentId: typeof e.studentId === 'object' ? e.studentId._id : e.studentId,
          status: e.status ?? 'present',
          _student: typeof e.studentId === 'object' ? e.studentId : null,
        }))
      );
    }
  }, [data]);

  const isLocked = data?.status === 'submitted';

  const { mutate: saveEntries, isPending: saving } = useMutation({
    mutationFn: () =>
      attendanceApi.updateRegister(id, {
        entries: entries.map(({ studentId, status }) => ({ studentId, status })),
      }),
    onSuccess: () => {
      toast.success('Draft saved');
      queryClient.invalidateQueries({ queryKey: ['attendance-register', id] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: submitRegister, isPending: submitting } = useMutation({
    mutationFn: () => attendanceApi.submitRegister(id),
    onSuccess: () => {
      toast.success('Register submitted and locked');
      queryClient.invalidateQueries({ queryKey: ['attendance-register', id] });
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-past'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateEntry = (studentId, status) => {
    setEntries((prev) =>
      prev.map((e) => (e.studentId === studentId ? { ...e, status } : e))
    );
  };

  const markAll = (status) => {
    setEntries((prev) => prev.map((e) => ({ ...e, status })));
  };

  // ── Summary counts ────────────────────────────────────────────────────────
  const counts = entries.reduce(
    (acc, e) => { acc[e.status] = (acc[e.status] ?? 0) + 1; return acc; },
    { present: 0, absent: 0, late: 0, half_day: 0, excused: 0 }
  );
  const total = entries.length;
  const marked = entries.filter((e) => e.status).length;
  // Half-day students count as 0.5 for the attendance rate
  const effectivePresent = counts.present + counts.half_day * 0.5;
  const pct = total > 0 ? Math.round((effectivePresent / total) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-3 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  const cls = data?.classId;
  const className = typeof cls === 'object' ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : 'Class';

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.push('/attendance')}
          className="mt-0.5 p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold leading-tight">{className}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(data?.date)} · {data?.term} · {data?.academicYear}
          </p>
        </div>
        {isLocked ? (
          <div className="flex items-center gap-1.5 bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-3 py-1.5 rounded-full shrink-0">
            <Lock className="h-3 w-3" /> Submitted
          </div>
        ) : (
          <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 shrink-0">
            Draft
          </Badge>
        )}
      </div>

      {/* ── Attendance rate pills ───────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-2">
        {STATUSES.map((s) => {
          const cfg = STATUS_CONFIG[s];
          return (
            <div key={s} className="bg-white rounded-xl border p-3 text-center shadow-sm">
              <p className="text-2xl font-bold tabular-nums">{counts[s]}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{cfg.long}</p>
            </div>
          );
        })}
      </div>

      {/* ── Attendance rate bar ─────────────────────────────────────────────── */}
      {total > 0 && (
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{marked}/{total} recorded</span>
            <span className={`font-semibold ${pct >= 80 ? 'text-green-700' : pct >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
              {pct}% attendance rate
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Mark all row ────────────────────────────────────────────────────── */}
      {!isLocked && total > 0 && (
        <div className="flex items-center gap-2 py-2 border-b">
          <span className="text-xs text-muted-foreground flex-1">Mark all as:</span>
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => markAll(s)}
              className={cn(
                'text-xs px-3 py-1 rounded-full font-medium border transition-colors',
                s === 'present' && 'border-green-200 text-green-700 hover:bg-green-50',
                s === 'absent'  && 'border-red-200 text-red-700 hover:bg-red-50',
                s === 'late'    && 'border-amber-200 text-amber-700 hover:bg-amber-50',
                s === 'excused' && 'border-blue-200 text-blue-700 hover:bg-blue-50',
              )}
            >
              All {STATUS_CONFIG[s].long}
            </button>
          ))}
        </div>
      )}

      {/* ── Student list ────────────────────────────────────────────────────── */}
      {entries.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No students enrolled in this class.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry, idx) => {
            const student = entry._student;
            return (
              <div
                key={entry.studentId}
                className="flex items-center gap-3 bg-white rounded-xl border px-4 py-3 shadow-sm"
              >
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0 tabular-nums">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">
                    {student ? `${student.firstName} ${student.lastName}` : entry.studentId}
                  </p>
                  {student?.admissionNumber && (
                    <p className="text-xs text-muted-foreground">{student.admissionNumber}</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {STATUSES.map((s) => (
                    <StatusButton
                      key={s}
                      status={s}
                      active={entry.status === s}
                      disabled={isLocked}
                      onClick={() => updateEntry(entry.studentId, s)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Action bar ──────────────────────────────────────────────────────── */}
      {!isLocked && entries.length > 0 && (
        <div className="sticky bottom-4 flex gap-2 justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => saveEntries()}
            disabled={saving}
            className="shadow-lg bg-white"
          >
            <Save className="h-4 w-4 mr-1.5" />
            {saving ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button
            onClick={() => setSubmitConfirmOpen(true)}
            disabled={submitting || entries.length === 0}
            className="shadow-lg"
          >
            <CheckCircle className="h-4 w-4 mr-1.5" />
            Submit Register
          </Button>
        </div>
      )}

      {/* ── Submit confirmation dialog ───────────────────────────────────────── */}
      <AlertDialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit attendance register?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>This will lock the register for <strong>{className}</strong> on {formatDate(data?.date)}.</p>
                <div className="rounded-lg bg-muted/60 border px-4 py-3 grid grid-cols-5 gap-2 text-center text-sm">
                  {STATUSES.map((s) => (
                    <div key={s}>
                      <p className="font-bold text-base tabular-nums">{counts[s]}</p>
                      <p className="text-xs text-muted-foreground">{STATUS_CONFIG[s].long}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {total} students · {pct}% attendance rate. This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { submitRegister(); setSubmitConfirmOpen(false); }}
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit & Lock'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
