'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle, Save, Lock, ChevronLeft, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { attendanceApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

// P / A / L / H / E pill button
const STATUS_CONFIG = {
  present:  { label: 'P', long: 'Present',  color: 'bg-ok text-white ring-ok' },
  absent:   { label: 'A', long: 'Absent',   color: 'bg-bad text-white ring-bad' },
  late:     { label: 'L', long: 'Late',     color: 'bg-warn text-white ring-warn' },
  half_day: { label: 'H', long: 'Half Day', color: 'bg-muted-foreground text-white ring-muted-foreground' },
  excused:  { label: 'E', long: 'Excused',  color: 'bg-primary text-white ring-primary' },
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
          : 'bg-muted/50 text-muted-foreground hover:bg-muted',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
      title={cfg.long}
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
    onError: (err) => showApiError(err),
  });

  const { mutate: submitRegister, isPending: submitting } = useMutation({
    // Always save current entries before locking so teachers don't need to
    // manually hit "Save Draft" first — one click does both.
    mutationFn: async () => {
      await attendanceApi.updateRegister(id, {
        entries: entries.map(({ studentId, status }) => ({ studentId, status })),
      });
      return attendanceApi.submitRegister(id);
    },
    onSuccess: () => {
      toast.success('Register submitted and locked');
      queryClient.invalidateQueries({ queryKey: ['attendance-register', id] });
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-past'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err) => showApiError(err),
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
          <div className="flex items-center gap-1.5 bg-ok/8 text-ok border border-ok/30 text-xs font-medium px-3 py-1.5 rounded-full shrink-0">
            <Lock className="h-3 w-3" /> Submitted
          </div>
        ) : (
          <Badge variant="outline" className="text-warn border-warn/30 bg-warn/5 shrink-0">
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
            <span className={`font-semibold ${pct >= 80 ? 'text-ok' : pct >= 60 ? 'text-warn' : 'text-bad'}`}>
              {pct}% attendance rate
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${pct >= 80 ? 'bg-ok' : pct >= 60 ? 'bg-warn' : 'bg-bad'}`}
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
                s === 'present' && 'border-ok/30 text-ok hover:bg-ok/8',
                s === 'absent'  && 'border-bad/30 text-bad hover:bg-bad/8',
                s === 'late'    && 'border-warn/30 text-warn hover:bg-warn/8',
                s === 'excused' && 'border-primary/30 text-primary hover:bg-primary/8',
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
