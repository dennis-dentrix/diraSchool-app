'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Printer, CheckCircle, Pencil, RefreshCw, Loader2,
} from 'lucide-react';
import { reportCardsApi, settingsApi, schoolsApi, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PrivateImage } from '@/components/shared/private-image';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ── Grade colour map ──────────────────────────────────────────────────────────
const GRADE_COLORS = {
  EE: 'text-green-700', EE1: 'text-green-700', EE2: 'text-green-600',
  ME: 'text-blue-700',  ME1: 'text-blue-700',  ME2: 'text-blue-600',
  AE: 'text-amber-700', AE1: 'text-amber-700', AE2: 'text-amber-600',
  BE: 'text-red-700',   BE1: 'text-red-700',   BE2: 'text-red-600',
};

// ── Paper preview ─────────────────────────────────────────────────────────────
function PaperPreview({ rc, school }) {
  if (!rc) return null;
  const student = rc.studentId;
  const cls     = rc.classId;
  const att     = rc.attendanceSummary ?? {};
  const docSerial = rc.documentSerial
    ?? `RPT-${rc.academicYear}-${String(rc._id).slice(-6).toUpperCase()}`;

  return (
    <div
      className="bg-[#fafaf8] rounded-lg border p-6 text-[11pt] leading-snug font-[Georgia,serif] space-y-4"
      style={{ backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, #e8e8e0 27px, #e8e8e0 28px)' }}
    >
      {/* School header */}
      <div className="text-center pb-3 border-b border-gray-300 space-y-0.5" style={{ backgroundImage: 'none' }}>
        {school?.name && <p className="font-bold text-base uppercase tracking-wide">{school.name}</p>}
        {school?.address && <p className="text-xs text-gray-500">{school.address}</p>}
        <p className="text-sm font-semibold mt-1">Student Progress Report</p>
        <p className="text-xs text-gray-500 font-mono">{rc.term} · {rc.academicYear} · {docSerial}</p>
      </div>

      {/* Student details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10pt]" style={{ backgroundImage: 'none' }}>
        {[
          ['Name', typeof student === 'object' ? `${student.firstName} ${student.lastName}` : '—'],
          ['Adm No.', typeof student === 'object' ? student.admissionNumber : '—'],
          ['Class', cls ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—'],
          ['Gender', typeof student === 'object' ? student.gender : '—'],
          ['Overall Grade', rc.overallGrade ?? '—'],
          ['Avg Points', rc.averagePoints?.toFixed(2) ?? '—'],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-1.5">
            <span className="text-gray-500 shrink-0">{label}:</span>
            <span className={`font-semibold ${label === 'Overall Grade' ? (GRADE_COLORS[rc.overallGrade] ?? '') : ''}`}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Attendance */}
      {rc.attendanceSummary && (
        <div style={{ backgroundImage: 'none' }}>
          <p className="text-[9pt] font-bold uppercase tracking-widest text-gray-400 mb-1">Attendance</p>
          <div className="flex gap-4 text-[10pt]">
            {[
              ['Days', att.totalDays ?? 0],
              ['Present', att.present ?? 0],
              ['Absent', att.absent ?? 0],
              ['Late', att.late ?? 0],
            ].map(([l, v]) => (
              <div key={l} className="text-center">
                <p className="font-bold font-mono">{v}</p>
                <p className="text-[8pt] text-gray-400">{l}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Subject table */}
      <div style={{ backgroundImage: 'none' }}>
        <p className="text-[9pt] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Subject Performance</p>
        <table className="w-full text-[10pt] border-collapse">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-1 text-[8pt] font-bold uppercase tracking-widest text-gray-400">Subject</th>
              <th className="text-center py-1 text-[8pt] font-bold uppercase tracking-widest text-gray-400">Avg %</th>
              <th className="text-center py-1 text-[8pt] font-bold uppercase tracking-widest text-gray-400">Grade</th>
              <th className="text-center py-1 text-[8pt] font-bold uppercase tracking-widest text-gray-400">Pts</th>
            </tr>
          </thead>
          <tbody>
            {(rc.subjects ?? []).map((sub) => (
              <tr key={sub.subjectId?.toString() ?? sub.subjectName} className="border-b border-gray-100">
                <td className="py-1.5 pr-2 font-medium">{sub.subjectName}</td>
                <td className="py-1.5 text-center font-mono text-[10pt]">{sub.averagePercentage?.toFixed(1) ?? '—'}%</td>
                <td className={`py-1.5 text-center font-bold ${GRADE_COLORS[sub.grade] ?? 'text-gray-700'}`}>
                  {sub.grade ?? '—'}
                </td>
                <td className="py-1.5 text-center font-mono font-semibold">{sub.points ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-300">
              <td className="py-1.5 font-bold uppercase text-[9pt]">Overall</td>
              <td />
              <td className={`py-1.5 text-center font-bold ${GRADE_COLORS[rc.overallGrade] ?? ''}`}>
                {rc.overallGrade ?? '—'}
              </td>
              <td className="py-1.5 text-center font-mono font-bold">{rc.averagePoints?.toFixed(2) ?? '—'}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Remarks */}
      {(rc.teacherRemarks || rc.principalRemarks) && (
        <div style={{ backgroundImage: 'none' }}>
          <p className="text-[9pt] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Remarks</p>
          {rc.teacherRemarks && (
            <div className="mb-2">
              <p className="text-[9pt] text-gray-400">Class Teacher</p>
              <p className="text-[10pt]" style={{ textWrap: 'balance' }}>{rc.teacherRemarks}</p>
            </div>
          )}
          {rc.principalRemarks && (
            <div>
              <p className="text-[9pt] text-gray-400">Principal</p>
              <p className="text-[10pt]" style={{ textWrap: 'balance' }}>{rc.principalRemarks}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Edit panel ─────────────────────────────────────────────────────────────────
function EditPanel({
  rc, id, isDraft, publishing, regenerating,
  onPublish, onRegenerate,
  remarks, setRemarks, savingRemarks, onSaveRemarks,
  subjectRemarks, setSubjectRemarks, savingSubject, onSaveSubjectRemark,
}) {
  const [editRemarks, setEditRemarks] = useState(false);
  const student = rc.studentId;
  const cls     = rc.classId;

  return (
    <div className="w-72 shrink-0 border-l flex flex-col overflow-y-auto">
      {/* Student summary */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center gap-2.5">
          {typeof student === 'object' && (
            student.photo ? (
              <PrivateImage src={student.photo} alt="" className="w-10 h-10 rounded-full object-cover border shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted text-foreground text-sm font-bold flex items-center justify-center shrink-0">
                {student.firstName?.[0]}{student.lastName?.[0]}
              </div>
            )
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {typeof student === 'object' ? `${student.firstName} ${student.lastName}` : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">
              {typeof student === 'object' ? student.admissionNumber : '—'}
            </p>
          </div>
        </div>

        <div className="space-y-1 text-xs">
          {[
            ['Class',      cls ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—'],
            ['Term',       rc.term],
            ['Year',       rc.academicYear],
            ['Status',     rc.status],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between">
              <span className="text-muted-foreground">{l}</span>
              <span className="font-medium capitalize">{v ?? '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {isDraft && (
        <div className="p-4 border-b space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Actions</p>
          <Button
            variant="outline" size="sm" className="w-full justify-start gap-2"
            onClick={onRegenerate} disabled={regenerating}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </Button>
          <Button
            size="sm" className="w-full justify-start gap-2"
            onClick={onPublish} disabled={publishing}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      )}

      {/* Remarks editor */}
      <div className="p-4 border-b flex-1">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Remarks</p>
          {isDraft && !editRemarks && (
            <button onClick={() => setEditRemarks(true)} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>

        {editRemarks ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Class Teacher</Label>
              <Textarea
                rows={3}
                value={remarks.teacherRemarks}
                onChange={(e) => setRemarks((p) => ({ ...p, teacherRemarks: e.target.value }))}
                placeholder="Teacher's remarks…"
                className="text-xs resize-none"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Principal</Label>
              <Textarea
                rows={3}
                value={remarks.principalRemarks}
                onChange={(e) => setRemarks((p) => ({ ...p, principalRemarks: e.target.value }))}
                placeholder="Principal's remarks…"
                className="text-xs resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={onSaveRemarks} disabled={savingRemarks}>
                {savingRemarks ? 'Saving…' : 'Save'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditRemarks(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-0.5">Class Teacher</p>
              <p style={{ textWrap: 'balance' }}>
                {rc.teacherRemarks || <span className="text-muted-foreground italic">No remarks</span>}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">Principal</p>
              <p style={{ textWrap: 'balance' }}>
                {rc.principalRemarks || <span className="text-muted-foreground italic">No remarks</span>}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Subject remarks */}
      {isDraft && (rc.subjects ?? []).length > 0 && (
        <div className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Subject Remarks</p>
          <div className="space-y-2.5">
            {(rc.subjects ?? []).map((sub) => {
              const subKey = sub.subjectId?.toString() ?? sub.subjectName;
              return (
                <div key={subKey}>
                  <p className="text-[10px] text-muted-foreground mb-1">{sub.subjectName}</p>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Add remark…"
                      value={subjectRemarks[subKey] ?? ''}
                      onChange={(e) => setSubjectRemarks((p) => ({ ...p, [subKey]: e.target.value }))}
                      className="flex-1 text-xs border border-input rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring min-w-0"
                    />
                    <Button
                      size="sm" variant="outline" className="text-xs h-7 px-2 shrink-0"
                      disabled={savingSubject === subKey}
                      onClick={() => onSaveSubjectRemark(subKey, subjectRemarks[subKey])}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ReportCardDetailPage() {
  const params  = useParams();
  const id      = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router  = useRouter();
  const queryClient = useQueryClient();

  const [publishConfirmOpen,    setPublishConfirmOpen]    = useState(false);
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false);
  const [remarks,        setRemarks]        = useState({ teacherRemarks: '', principalRemarks: '' });
  const [subjectRemarks, setSubjectRemarks] = useState({});
  const [savingSubject,  setSavingSubject]  = useState(null);

  const { data: rc, isLoading } = useQuery({
    queryKey: ['report-card', id],
    queryFn: async () => {
      const res  = await reportCardsApi.get(id);
      const card = res.data?.reportCard ?? res.data?.data ?? res.data;
      setRemarks({ teacherRemarks: card?.teacherRemarks ?? '', principalRemarks: card?.principalRemarks ?? '' });
      const subjMap = {};
      (card?.subjects ?? []).forEach((s) => {
        subjMap[s.subjectId?.toString() ?? s.subjectName] = s.teacherRemark ?? '';
      });
      setSubjectRemarks(subjMap);
      return card;
    },
    enabled: !!id,
  });

  const { data: school } = useQuery({
    queryKey: ['school-me'],
    queryFn: async () => {
      const res = await schoolsApi.me();
      return res.data?.school ?? res.data?.data ?? res.data;
    },
  });

  const { mutate: saveRemarks, isPending: savingRemarks } = useMutation({
    mutationFn: () => reportCardsApi.updateRemarks(id, {
      teacherRemarks:   remarks.teacherRemarks   || undefined,
      principalRemarks: remarks.principalRemarks || undefined,
    }),
    onSuccess: () => {
      toast.success('Remarks saved');
      queryClient.invalidateQueries({ queryKey: ['report-card', id] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: publish, isPending: publishing } = useMutation({
    mutationFn: () => reportCardsApi.publish(id),
    onSuccess: () => {
      toast.success('Report card published');
      queryClient.invalidateQueries({ queryKey: ['report-card', id] });
      queryClient.invalidateQueries({ queryKey: ['report-cards'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: regenerate, isPending: regenerating } = useMutation({
    mutationFn: () => reportCardsApi.generate({
      studentId:    typeof rc?.studentId === 'object' ? rc.studentId._id : rc?.studentId,
      academicYear: rc?.academicYear,
      term:         rc?.term,
    }),
    onSuccess: () => {
      toast.success('Report card regenerated with latest results');
      queryClient.invalidateQueries({ queryKey: ['report-card', id] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  async function saveSubjectRemark(subjectId, remark) {
    setSavingSubject(subjectId);
    try {
      await reportCardsApi.updateSubjectRemark(id, subjectId, { remark });
      toast.success('Subject remark saved');
      queryClient.invalidateQueries({ queryKey: ['report-card', id] });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSavingSubject(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-4">
          <Skeleton className="flex-1 h-[500px]" />
          <Skeleton className="w-64 h-[500px]" />
        </div>
      </div>
    );
  }

  if (!rc) return <p className="text-muted-foreground">Report card not found.</p>;

  const student = rc.studentId;
  const cls     = rc.classId;
  const isDraft = rc.status === 'draft';

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold">
            {typeof student === 'object' ? `${student.firstName} ${student.lastName}` : 'Report Card'}
          </h1>
          <p className="text-xs text-muted-foreground font-mono">
            {cls?.name}{cls?.stream ? ` ${cls.stream}` : ''} · {rc.term} · {rc.academicYear}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => window.open(`/report-cards/${id}/print`, '_blank')}
          >
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex gap-0 rounded-lg border overflow-hidden" style={{ minHeight: '500px' }}>
        {/* Left: paper preview */}
        <div className="flex-1 p-5 overflow-y-auto bg-muted/10">
          <PaperPreview rc={rc} school={school} />
        </div>

        {/* Right: edit panel */}
        <EditPanel
          rc={rc}
          id={id}
          isDraft={isDraft}
          publishing={publishing}
          regenerating={regenerating}
          onPublish={() => setPublishConfirmOpen(true)}
          onRegenerate={() => setRegenerateConfirmOpen(true)}
          remarks={remarks}
          setRemarks={setRemarks}
          savingRemarks={savingRemarks}
          onSaveRemarks={saveRemarks}
          subjectRemarks={subjectRemarks}
          setSubjectRemarks={setSubjectRemarks}
          savingSubject={savingSubject}
          onSaveSubjectRemark={saveSubjectRemark}
        />
      </div>

      {/* Confirm dialogs */}
      <AlertDialog open={regenerateConfirmOpen} onOpenChange={setRegenerateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Report Card?</AlertDialogTitle>
            <AlertDialogDescription>
              This rebuilds the report card using the latest results. Existing remarks will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => regenerate()} disabled={regenerating}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Report Card?</AlertDialogTitle>
            <AlertDialogDescription>
              Once published, this report card can no longer be edited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => publish()} disabled={publishing}>Publish</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
