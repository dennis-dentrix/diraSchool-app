'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Trash2, Share2, X, Image as ImageIcon, FileText, Eye, UserCheck,
  Download, ChevronLeft, ChevronRight, Camera, BookOpen, Plus,
} from 'lucide-react';
import { lessonPlansApi, usersApi } from '@/lib/api';
import { useClasses, useAllSubjects } from '@/hooks/use-app-queries';
import { useAuthStore } from '@/store/auth.store';
import { TERMS, ACADEMIC_YEARS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { PrivateImage } from '@/components/shared/private-image';
import { PrivateLink } from '@/components/shared/private-link';
import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast }    from 'sonner';

const ADMIN_ROLES = ['school_admin', 'director', 'headteacher', 'deputy_headteacher'];
function isAdmin(role) { return ADMIN_ROLES.includes(role); }

// ── Upload dialog ─────────────────────────────────────────────────────────────
function UploadDialog({ open, onClose }) {
  const { academicYear: defaultAcademicYear, term: defaultTerm } = useSchoolTermDefaults(['lesson-plans', 'term-defaults']);
  const [form, setForm] = useState({
    title: '', description: '', type: 'lesson_plan',
    academicYear: defaultAcademicYear, term: defaultTerm, weekNumber: '',
    classId: '', subjectId: '',
  });
  const [files, setFiles]       = useState([]);
  const [previews, setPreviews] = useState([]);
  const fileRef   = useRef();
  const cameraRef = useRef();
  const qc = useQueryClient();

  useEffect(() => {
    setForm((prev) => ({ ...prev, academicYear: defaultAcademicYear, term: defaultTerm }));
  }, [defaultAcademicYear, defaultTerm]);

  const { data: classesData }  = useClasses();
  const { data: subjectsData } = useAllSubjects();
  const classes  = classesData  ?? [];
  const subjects = subjectsData ?? [];

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      files.forEach((f) => fd.append('images', f));
      return lessonPlansApi.upload(fd);
    },
    onSuccess: () => {
      toast.success('Lesson plan uploaded. PDF is being generated.');
      qc.invalidateQueries({ queryKey: ['lesson-plans'] });
      onClose();
      setForm({ title: '', description: '', type: 'lesson_plan', academicYear: defaultAcademicYear, term: defaultTerm, weekNumber: '', classId: '', subjectId: '' });
      setFiles([]);
      setPreviews([]);
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Upload failed.'),
  });

  function handleFiles(e) {
    const selected = Array.from(e.target.files ?? []).slice(0, Math.max(0, 20 - files.length));
    if (!selected.length) return;
    setFiles((prev) => [...prev, ...selected]);
    setPreviews((prev) => [...prev, ...selected.map((f) => URL.createObjectURL(f))]);
    e.target.value = '';
  }

  function removeImage(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  const set = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Lesson Plan / Work Schedule</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={set('type')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lesson_plan">Lesson Plan</SelectItem>
                  <SelectItem value="work_schedule">Work Schedule</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Select value={form.term} onValueChange={set('term')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Academic Year</Label>
              <Select value={form.academicYear} onValueChange={set('academicYear')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Week No. (optional)</Label>
              <Input type="number" min={1} max={52} placeholder="e.g. 3" value={form.weekNumber}
                onChange={(e) => set('weekNumber')(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Class (optional)</Label>
              <Select value={form.classId || 'none'} onValueChange={(v) => set('classId')(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {classes.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}{c.stream ? ` ${c.stream}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subject (optional)</Label>
              <Select value={form.subjectId || 'none'} onValueChange={(v) => set('subjectId')(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {subjects.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. Week 3 Lesson Plan — Mathematics" value={form.title}
              onChange={(e) => set('title')(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea placeholder="Brief notes about this plan…" rows={2} value={form.description}
              onChange={(e) => set('description')(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Photos of plan pages</Label>
              <span className="text-xs text-muted-foreground">{files.length}/20 images</span>
            </div>

            {previews.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {previews.map((src, idx) => (
                  <div key={idx} className="relative rounded-lg overflow-hidden border aspect-[3/4]">
                    <img src={src} alt={`page ${idx + 1}`} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 hover:bg-black/80">
                      <X className="h-3 w-3 text-white" />
                    </button>
                    <span className="absolute bottom-1 left-1 text-[10px] bg-black/50 text-white rounded px-1">{idx + 1}</span>
                  </div>
                ))}
              </div>
            )}

            {files.length < 20 && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => cameraRef.current?.click()}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 px-3 py-3 text-primary transition-colors hover:border-primary/50 hover:bg-primary/8">
                  <Camera className="h-5 w-5" />
                  <span className="text-sm font-medium">Take photo</span>
                </button>
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-3 py-3 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
                  <ImageIcon className="h-5 w-5" />
                  <span className="text-sm">{files.length === 0 ? 'Choose images' : 'Add more pages'}</span>
                </button>
              </div>
            )}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFiles} />
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

            {files.length > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                A downloadable PDF will be generated automatically from these {files.length} image{files.length > 1 ? 's' : ''}.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => mutate()} disabled={isPending || !form.title}>
            {isPending ? 'Uploading…' : <><Upload className="h-4 w-4 mr-1.5" />Upload</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Share dialog ──────────────────────────────────────────────────────────────
function ShareDialog({ plan, open, onClose }) {
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  const { data: staffData } = useQuery({
    queryKey: ['staff-list-share'],
    queryFn: async () => {
      const res = await usersApi.list({ limit: 200, role: 'teacher' });
      return res.data?.data ?? res.data?.users ?? [];
    },
    enabled: open,
  });

  const { mutate: share, isPending: sharing } = useMutation({
    mutationFn: (teacherId) => lessonPlansApi.share(plan._id, teacherId),
    onSuccess: () => { toast.success('Plan shared.'); qc.invalidateQueries({ queryKey: ['lesson-plans'] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Share failed.'),
  });

  const { mutate: unshare } = useMutation({
    mutationFn: (teacherId) => lessonPlansApi.unshare(plan._id, teacherId),
    onSuccess: () => { toast.success('Access removed.'); qc.invalidateQueries({ queryKey: ['lesson-plans'] }); },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Failed.'),
  });

  const sharedIds = new Set((plan.sharedWith ?? []).map((u) => String(u._id ?? u)));
  const teacherList = (staffData ?? []).filter((s) => {
    const notOwner = String(s._id) !== String(plan.teacherId?._id ?? plan.teacherId);
    const matchSearch = !search || `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase());
    return notOwner && matchSearch;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Share Lesson Plan</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Grant access to another teacher — e.g. a replacement teacher taking over this class.
          </p>

          {plan.sharedWith?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currently shared with</p>
              {plan.sharedWith.map((u) => (
                <div key={u._id ?? u} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-ok" />
                    <span className="text-sm font-medium">{u.firstName} {u.lastName}</span>
                  </div>
                  <button type="button" onClick={() => unshare(String(u._id ?? u))}
                    className="text-xs text-destructive hover:underline">Remove</button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add teacher</p>
            <Input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {teacherList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">No teachers found.</p>
              ) : teacherList.map((s) => {
                const already = sharedIds.has(String(s._id));
                return (
                  <div key={s._id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                    <span className="text-sm">{s.firstName} {s.lastName}</span>
                    {already ? (
                      <Badge variant="secondary" className="text-xs">Shared</Badge>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={sharing} onClick={() => share(s._id)}>
                        Share
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Image carousel (lightbox) ─────────────────────────────────────────────────
function ImageCarousel({ images, title, open, onClose, startIndex = 0 }) {
  const [current, setCurrent] = useState(startIndex);
  const total = images.length;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-3 bg-transparent border-none shadow-none">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="relative">
          <PrivateImage src={images[current]?.url} alt={`${title} — page ${current + 1}`}
            className="w-full max-h-[80vh] object-contain rounded" />
          {total > 1 && (
            <>
              <button type="button" onClick={() => setCurrent((c) => (c - 1 + total) % total)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border shadow-sm p-2 hover:bg-white transition-colors">
                <ChevronLeft className="h-5 w-5 text-foreground" />
              </button>
              <button type="button" onClick={() => setCurrent((c) => (c + 1) % total)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border shadow-sm p-2 hover:bg-white transition-colors">
                <ChevronRight className="h-5 w-5 text-foreground" />
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground bg-white/90 border px-2 py-0.5 rounded-full shadow-sm">
                {current + 1} / {total}
              </span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Left pane: plan list item ─────────────────────────────────────────────────
function PlanListItem({ plan, selected, onClick }) {
  const subject = plan.subjectId?.name ?? plan.subjectId ?? null;
  const cls     = plan.classId ? `${plan.classId.name}${plan.classId.stream ? ` ${plan.classId.stream}` : ''}` : null;
  const isWS    = plan.type === 'work_schedule';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b last:border-b-0 transition-colors',
        selected ? 'bg-primary/8 border-l-2 border-l-primary' : 'hover:bg-muted/40 border-l-2 border-l-transparent',
      )}
    >
      <p className={cn('text-sm font-medium leading-snug truncate', selected && 'text-primary')}>
        {plan.title}
      </p>
      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
        {subject && <span className="truncate max-w-[80px]">{subject}</span>}
        {subject && cls && <span>·</span>}
        {cls && <span className="truncate max-w-[60px]">{cls}</span>}
        {plan.weekNumber && <><span>·</span><span>Wk {plan.weekNumber}</span></>}
        <span className="ml-auto shrink-0">
          <span className={cn(
            'inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium',
            isWS ? 'border-border text-muted-foreground' : 'border-primary/30 text-primary',
          )}>
            {isWS ? 'Schedule' : 'Plan'}
          </span>
        </span>
      </div>
    </button>
  );
}

// ── Right pane: plan detail viewer ────────────────────────────────────────────
function PlanDetailPane({ plan, currentUser, onShare, onDelete }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx]   = useState(0);

  const isOwner  = String(plan.teacherId?._id ?? plan.teacherId) === String(currentUser._id);
  const admin    = isAdmin(currentUser.role);
  const images   = plan.images ?? [];
  const hasImages = images.length > 0;
  const cls = plan.classId ? `${plan.classId.name}${plan.classId.stream ? ` ${plan.classId.stream}` : ''}` : null;
  const subject  = plan.subjectId?.name ?? null;

  return (
    <div className="flex flex-col h-full">
      {/* Detail header */}
      <div className="px-5 py-4 border-b shrink-0 space-y-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
            {plan.type === 'work_schedule' ? 'Work Schedule' : 'Lesson Plan'}
          </p>
          <h2 className="text-lg font-semibold leading-tight">{plan.title}</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="outline" className="text-[11px]">{plan.term} {plan.academicYear}</Badge>
            {plan.weekNumber && <Badge variant="outline" className="text-[11px]">Week {plan.weekNumber}</Badge>}
            {cls && <Badge variant="outline" className="text-[11px]">{cls}</Badge>}
            {subject && <Badge variant="outline" className="text-[11px]">{subject}</Badge>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {hasImages && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => { setLightboxIdx(0); setLightboxOpen(true); }}>
              <Eye className="h-3.5 w-3.5" /> View
            </Button>
          )}
          {plan.pdfUrl && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-ok/30 text-ok hover:bg-ok/8" asChild>
              <PrivateLink fileKey={plan.pdfUrl}>
                <Download className="h-3.5 w-3.5" /> PDF
              </PrivateLink>
            </Button>
          )}
          {admin && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => onShare(plan)}>
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
          )}
          {(isOwner || admin) && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" onClick={() => onDelete(plan)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Teacher + date */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{plan.teacherId?.firstName} {plan.teacherId?.lastName}</span>
          <span>{formatDate(plan.createdAt)}</span>
        </div>

        {/* Shared-with */}
        {plan.sharedWith?.length > 0 && (
          <p className="text-xs text-ok flex items-center gap-1">
            <UserCheck className="h-3.5 w-3.5" />
            Shared with {plan.sharedWith.length} teacher{plan.sharedWith.length > 1 ? 's' : ''}
          </p>
        )}

        {/* PDF processing state */}
        {plan.pdfStatus === 'processing' && (
          <p className="text-xs text-muted-foreground italic">PDF generating…</p>
        )}

        {/* Paper document viewer */}
        {plan.description ? (
          <div
            className="bg-white rounded border shadow-sm mx-auto max-w-2xl min-h-[320px] px-8 py-6 text-sm leading-relaxed"
            style={{
              backgroundImage: 'repeating-linear-gradient(transparent, transparent calc(12rem - 1px), hsl(var(--border)) calc(12rem - 1px), hsl(var(--border)) 12rem)',
            }}
          >
            <p className="whitespace-pre-wrap text-foreground">{plan.description}</p>
          </div>
        ) : (
          <p className="text-muted-foreground italic text-xs text-center py-1">No description provided.</p>
        )}

        {/* Image pages */}
        {hasImages && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              Pages — {images.length} image{images.length > 1 ? 's' : ''}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setLightboxIdx(idx); setLightboxOpen(true); }}
                  className="relative rounded-lg overflow-hidden border aspect-[3/4] hover:opacity-90 transition-opacity group"
                >
                  <PrivateImage src={img.url} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-1.5 left-1.5 text-[10px] bg-black/50 text-white rounded px-1.5 py-0.5">
                    {idx + 1}
                  </span>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                    <Eye className="h-5 w-5 text-white" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {hasImages && (
        <ImageCarousel images={images} title={plan.title} open={lightboxOpen}
          onClose={() => setLightboxOpen(false)} startIndex={lightboxIdx} />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LessonPlansPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { academicYear: defaultAcademicYear, term: defaultTerm } = useSchoolTermDefaults(['lesson-plans', 'term-defaults']);
  const [uploadOpen, setUploadOpen]   = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedId, setSelectedId]   = useState(null);
  const [mobileView, setMobileView]   = useState('list'); // 'list' | 'detail'
  const [search, setSearch]           = useState('');
  const [filters, setFilters] = useState({
    academicYear: defaultAcademicYear,
    term: '',
    type: '',
  });

  useEffect(() => {
    setFilters((prev) => ({ ...prev, academicYear: defaultAcademicYear }));
  }, [defaultAcademicYear]);

  const { data, isLoading } = useQuery({
    queryKey: ['lesson-plans', filters],
    queryFn: async () => {
      const params = {};
      if (filters.academicYear) params.academicYear = filters.academicYear;
      if (filters.term)         params.term         = filters.term;
      if (filters.type)         params.type         = filters.type;
      const res = await lessonPlansApi.list(params);
      return res.data?.plans ?? [];
    },
    enabled: !!user?._id,
  });

  const { mutate: deletePlan, isPending: deleting } = useMutation({
    mutationFn: (id) => lessonPlansApi.delete(id),
    onSuccess: () => {
      toast.success('Lesson plan deleted.');
      qc.invalidateQueries({ queryKey: ['lesson-plans'] });
      setDeleteTarget(null);
      setSelectedId(null);
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Delete failed.'),
  });

  const setFilter = (k) => (v) => setFilters((p) => ({ ...p, [k]: v === 'all' ? '' : v }));

  const allPlans = data ?? [];
  const filteredPlans = search
    ? allPlans.filter((p) => p.title?.toLowerCase().includes(search.toLowerCase()))
    : allPlans;

  const selectedPlan = filteredPlans.find((p) => p._id === selectedId) ?? filteredPlans[0] ?? null;

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between shrink-0">
        {/* On mobile in detail view, show a back button instead of the full header */}
        {mobileView === 'detail' && (
          <button
            type="button"
            className="lg:hidden flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileView('list')}
          >
            <ChevronLeft className="h-4 w-4" /> Plans
          </button>
        )}
        <div className={cn(mobileView === 'detail' ? 'hidden lg:block' : '')}>
          <PageHeader
            overline="Academics"
            title="Lesson Plans"
            description="Upload and manage lesson plans and work schedules"
          />
        </div>
        <Button onClick={() => setUploadOpen(true)} size="sm" className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> Upload Plan
        </Button>
      </div>

      <div className="flex gap-0 flex-1 min-h-0 rounded-lg border overflow-hidden">
        {/* ── Left pane: list ─────────────────────────────────────────────── */}
        <div className={cn(
          'flex flex-col border-r',
          // Mobile: full width, hidden when detail is active
          mobileView === 'detail' ? 'hidden lg:flex' : 'flex w-full',
          // Desktop: fixed sidebar width
          'lg:w-72 lg:shrink-0',
        )}>
          {/* Filters bar */}
          <div className="p-2 space-y-2 border-b shrink-0">
            <Input
              placeholder="Search plans…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="flex gap-1.5">
              <Select value={filters.term || 'all'} onValueChange={setFilter('term')}>
                <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Term" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All terms</SelectItem>
                  {TERMS.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.type || 'all'} onValueChange={setFilter('type')}>
                <SelectTrigger className="h-7 text-xs flex-1"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All</SelectItem>
                  <SelectItem value="lesson_plan" className="text-xs">Plans</SelectItem>
                  <SelectItem value="work_schedule" className="text-xs">Schedules</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Plan list */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-muted-foreground gap-2">
                <BookOpen className="h-7 w-7 opacity-30" />
                <p className="text-xs">No plans found</p>
              </div>
            ) : (
              filteredPlans.map((plan) => (
                <PlanListItem
                  key={plan._id}
                  plan={plan}
                  selected={plan._id === (selectedId ?? filteredPlans[0]?._id)}
                  onClick={() => {
                    setSelectedId(plan._id);
                    setMobileView('detail');
                  }}
                />
              ))
            )}
          </div>

          {!isLoading && filteredPlans.length > 0 && (
            <p className="text-[10px] text-muted-foreground px-3 py-2 border-t shrink-0 tabular-nums">
              {filteredPlans.length} plan{filteredPlans.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {/* ── Right pane: detail ───────────────────────────────────────────── */}
        <div className={cn(
          'flex-1 min-w-0 bg-muted/20',
          // Mobile: full width when in detail view, hidden otherwise
          mobileView === 'list' ? 'hidden lg:flex lg:flex-col' : 'flex flex-col',
        )}>
          {!selectedPlan ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
              <FileText className="h-10 w-10 opacity-25" />
              <p className="text-sm">Select a plan to view it</p>
              <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload your first plan
              </Button>
            </div>
          ) : (
            <PlanDetailPane
              plan={selectedPlan}
              currentUser={user}
              onShare={setShareTarget}
              onDelete={(p) => setDeleteTarget(p)}
            />
          )}
        </div>
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
      {shareTarget && (
        <ShareDialog plan={shareTarget} open={!!shareTarget} onClose={() => setShareTarget(null)} />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o && !deleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lesson plan?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to permanently delete{' '}
                  <span className="font-semibold">"{deleteTarget?.title}"</span>.
                </p>
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive space-y-1">
                  <p className="font-medium">This will permanently remove:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-destructive/80">
                    {deleteTarget?.images?.length > 0 && (
                      <li>{deleteTarget.images.length} uploaded image{deleteTarget.images.length > 1 ? 's' : ''} from storage</li>
                    )}
                    {deleteTarget?.pdfUrl && <li>The generated PDF from storage</li>}
                    <li>All sharing permissions for this plan</li>
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={deleting}
              onClick={() => deletePlan(deleteTarget._id)}
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
