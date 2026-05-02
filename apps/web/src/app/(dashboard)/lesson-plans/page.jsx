'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Trash2, Share2, X, Image as ImageIcon, FileText, Eye, UserCheck,
  Download, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { lessonPlansApi, usersApi, classesApi, subjectsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { TERMS, ACADEMIC_YEARS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { formatDate } from '@/lib/utils';
import { Button }   from '@/components/ui/button';
import { Badge }    from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [files, setFiles]       = useState([]);   // File objects
  const [previews, setPreviews] = useState([]);   // object URLs
  const fileRef = useRef();
  const qc = useQueryClient();

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      academicYear: defaultAcademicYear,
      term: defaultTerm,
    }));
  }, [defaultAcademicYear, defaultTerm]);

  const { data: classesData } = useQuery({
    queryKey: ['classes-list'],
    queryFn: () => classesApi.list().then((r) => r.data?.classes ?? []),
    staleTime: 60_000,
  });
  const classes = classesData ?? [];

  const { data: subjectsData } = useQuery({
    queryKey: ['subjects-list'],
    queryFn: () => subjectsApi.list().then((r) => r.data?.subjects ?? []),
    staleTime: 60_000,
  });
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
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    setFiles((prev) => [...prev, ...selected]);
    setPreviews((prev) => [...prev, ...selected.map((f) => URL.createObjectURL(f))]);
    fileRef.current.value = '';
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
          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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
              <Input
                type="number" min={1} max={52} placeholder="e.g. 3"
                value={form.weekNumber}
                onChange={(e) => set('weekNumber')(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                  {subjects.map((s) => (
                    <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Week 3 Lesson Plan — Mathematics"
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="Brief notes about this plan…"
              rows={2}
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
            />
          </div>

          {/* Multi-image picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Photos of plan pages</Label>
              <span className="text-xs text-muted-foreground">{files.length}/20 images</span>
            </div>

            {/* Preview grid */}
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((src, idx) => (
                  <div key={idx} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-[3/4]">
                    <img src={src} alt={`page ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 hover:bg-black/80"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                    <span className="absolute bottom-1 left-1 text-[10px] bg-black/50 text-white rounded px-1">{idx + 1}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Add more button */}
            {files.length < 20 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 py-4 text-slate-500 hover:border-cyan-400 hover:text-cyan-600 transition-colors"
              >
                <ImageIcon className="h-5 w-5" />
                <span className="text-sm">
                  {files.length === 0 ? 'Add photos (JPG, PNG)' : 'Add more pages'}
                </span>
              </button>
            )}
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
          <Button
            onClick={() => mutate()}
            disabled={isPending || !form.title}
            className="bg-cyan-700 hover:bg-cyan-800"
          >
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
        <DialogHeader>
          <DialogTitle>Share Lesson Plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Grant access to another teacher — e.g. a replacement teacher taking over this class.
          </p>

          {/* Currently shared */}
          {plan.sharedWith?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currently shared with</p>
              {plan.sharedWith.map((u) => (
                <div key={u._id ?? u} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium">{u.firstName} {u.lastName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => unshare(String(u._id ?? u))}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
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
      <DialogContent className="max-w-3xl p-2 bg-black/95">
        <div className="relative">
          <img
            src={images[current]?.url}
            alt={`${title} — page ${current + 1}`}
            className="w-full max-h-[80vh] object-contain rounded"
          />
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => setCurrent((c) => (c - 1 + total) % total)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 hover:bg-black/80"
              >
                <ChevronLeft className="h-5 w-5 text-white" />
              </button>
              <button
                type="button"
                onClick={() => setCurrent((c) => (c + 1) % total)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 hover:bg-black/80"
              >
                <ChevronRight className="h-5 w-5 text-white" />
              </button>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/80 bg-black/50 px-2 py-0.5 rounded-full">
                {current + 1} / {total}
              </span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, currentUser, onShare, onDelete }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIdx, setLightboxIdx]   = useState(0);
  const isOwner = String(plan.teacherId?._id ?? plan.teacherId) === String(currentUser._id);
  const admin   = isAdmin(currentUser.role);

  const images   = plan.images ?? [];
  const hasImages = images.length > 0;
  const typeLabel = plan.type === 'work_schedule' ? 'Work Schedule' : 'Lesson Plan';
  const typeColor = plan.type === 'work_schedule' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700';

  function openLightbox(idx = 0) {
    setLightboxIdx(idx);
    setLightboxOpen(true);
  }

  return (
    <>
      <Card className="border-border/70 shadow-sm hover:shadow-md transition-shadow">
        <CardContent className="p-4 space-y-3">
          {/* Image thumbnail strip */}
          {hasImages ? (
            <div
              className="relative cursor-pointer rounded-lg overflow-hidden border border-slate-100 bg-slate-50"
              onClick={() => openLightbox(0)}
            >
              <img
                src={images[0].url}
                alt={plan.title}
                className="w-full h-36 object-cover hover:opacity-90 transition-opacity"
              />
              {images.length > 1 && (
                <span className="absolute bottom-2 right-2 text-xs bg-black/60 text-white px-2 py-0.5 rounded-full">
                  +{images.length - 1} more
                </span>
              )}
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center rounded-lg border-2 border-dashed border-slate-100 bg-slate-50">
              <FileText className="h-8 w-8 text-slate-300" />
            </div>
          )}

          {/* Meta */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 leading-snug">{plan.title}</p>
              <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${typeColor}`}>
                {typeLabel}
              </span>
            </div>
            {plan.description && (
              <p className="mt-1 text-xs text-slate-500 line-clamp-2">{plan.description}</p>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-[11px]">{plan.term} {plan.academicYear}</Badge>
            {plan.weekNumber && <Badge variant="outline" className="text-[11px]">Week {plan.weekNumber}</Badge>}
            {plan.classId && <Badge variant="outline" className="text-[11px]">{plan.classId.name}{plan.classId.stream ? ` ${plan.classId.stream}` : ''}</Badge>}
            {images.length > 0 && <Badge variant="outline" className="text-[11px]">{images.length} page{images.length > 1 ? 's' : ''}</Badge>}
          </div>

          {/* Teacher + date */}
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{plan.teacherId?.firstName} {plan.teacherId?.lastName}</span>
            <span>{formatDate(plan.createdAt)}</span>
          </div>

          {/* Shared with */}
          {plan.sharedWith?.length > 0 && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              Shared with {plan.sharedWith.length} teacher{plan.sharedWith.length > 1 ? 's' : ''}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
            {hasImages && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => openLightbox(0)}>
                <Eye className="h-3.5 w-3.5" /> View
              </Button>
            )}
            {plan.pdfUrl && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50" asChild>
                <a href={plan.pdfUrl} download>
                  <Download className="h-3.5 w-3.5" /> PDF
                </a>
              </Button>
            )}
            {plan.pdfStatus === 'processing' && (
              <span className="text-[11px] text-muted-foreground italic">PDF generating…</span>
            )}
            {admin && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onShare(plan)}>
                <Share2 className="h-3.5 w-3.5" /> Share
              </Button>
            )}
            {(isOwner || admin) && (
              <Button
                size="sm" variant="ghost"
                className="h-7 text-xs gap-1 ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => onDelete(plan)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {hasImages && (
        <ImageCarousel
          images={images}
          title={plan.title}
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          startIndex={lightboxIdx}
        />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LessonPlansPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { academicYear: defaultAcademicYear } = useSchoolTermDefaults(['lesson-plans', 'term-defaults']);
  const [uploadOpen, setUploadOpen]   = useState(false);
  const [shareTarget, setShareTarget] = useState(null);
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

  const [deleteTarget, setDeleteTarget] = useState(null);

  const { mutate: deletePlan, isPending: deleting } = useMutation({
    mutationFn: (id) => lessonPlansApi.delete(id),
    onSuccess: () => {
      toast.success('Lesson plan deleted.');
      qc.invalidateQueries({ queryKey: ['lesson-plans'] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e?.response?.data?.message ?? 'Delete failed.'),
  });

  function handleDelete(plan) { setDeleteTarget(plan); }

  const plans = data ?? [];
  const setFilter = (k) => (v) => setFilters((p) => ({ ...p, [k]: v === 'all' ? '' : v }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-border/70 bg-gradient-to-br from-slate-50 via-white to-cyan-50/40">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Lesson Plans</h1>
              <p className="mt-1 text-sm text-slate-600">Upload and manage lesson plans and work schedules</p>
            </div>
            <Button onClick={() => setUploadOpen(true)} className="gap-2 bg-cyan-700 hover:bg-cyan-800 sm:self-start">
              <Upload className="h-4 w-4" /> Upload Plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="border-border/70">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Select value={filters.academicYear} onValueChange={setFilter('academicYear')}>
                <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Term</Label>
              <Select value={filters.term || 'all'} onValueChange={setFilter('term')}>
                <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="All terms" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All terms</SelectItem>
                  {TERMS.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={filters.type || 'all'} onValueChange={setFilter('type')}>
                <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All types</SelectItem>
                  <SelectItem value="lesson_plan" className="text-xs">Lesson Plan</SelectItem>
                  <SelectItem value="work_schedule" className="text-xs">Work Schedule</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground ml-auto self-end pb-1">
              {plans.length} plan{plans.length !== 1 ? 's' : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : plans.length === 0 ? (
        <Card className="border-border/70">
          <CardContent className="py-16 text-center">
            <ImageIcon className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-700">No lesson plans yet</p>
            <p className="text-xs text-muted-foreground mt-1">Upload a photo of your lesson plan or work schedule.</p>
            <Button onClick={() => setUploadOpen(true)} className="mt-4 gap-2 bg-cyan-700 hover:bg-cyan-800">
              <Upload className="h-4 w-4" /> Upload your first plan
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan._id}
              plan={plan}
              currentUser={user}
              onShare={setShareTarget}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

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
                  <span className="font-semibold text-slate-900">"{deleteTarget?.title}"</span>.
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
