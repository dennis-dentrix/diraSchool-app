'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Users, MoreHorizontal, ChevronRight, GraduationCap, Pencil,
  UserPlus, Image as ImageIcon, FileText, Eye, ExternalLink, Download,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@/lib/utils';
import { classesApi, lessonPlansApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useTeachers } from '@/hooks/use-app-queries';
import { useAuthStore, isAdmin } from '@/store/auth.store';
import { LEVEL_CATEGORIES, ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SkeletonList } from '@/components/shared/skeleton-list';
import { useRouter } from 'next/navigation';
import { PrivateImage } from '@/components/shared/private-image';
import { PrivateLink } from '@/components/shared/private-link';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  stream: z.string().optional(),
  levelCategory: z.string().min(1, 'Required'),
  academicYear: z.string().min(1, 'Required'),
  term: z.string().min(1, 'Required'),
  classTeacherId: z.string().optional(),
});

const editSchema = z.object({
  name: z.string().min(1, 'Required'),
  stream: z.string().optional(),
  levelCategory: z.string().min(1, 'Required'),
  classTeacherId: z.string().optional(),
});

const PROMOTE_INIT = { open: false, sourceClass: null, targetClassId: '', action: 'promote' };

// ── Enrollment bar ─────────────────────────────────────────────────────────────
function EnrollmentBar({ count, max = 40 }) {
  const n = count ?? 0;
  const pct = Math.min(100, Math.round((n / max) * 100));
  const barColor = pct >= 95 ? 'bg-bad' : pct >= 75 ? 'bg-ok' : 'bg-primary';
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm tabular-nums">{n}</span>
      <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Teacher chip ───────────────────────────────────────────────────────────────
function TeacherChip({ teacher }) {
  if (!teacher || typeof teacher !== 'object') return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs whitespace-nowrap">
      {teacher.firstName} {teacher.lastName}
    </span>
  );
}

// ── Skeleton table row ─────────────────────────────────────────────────────────
function SkeletonTableRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
      <Skeleton className="h-3.5 rounded-full flex-1" />
      <Skeleton className="h-3 w-20 rounded-full" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-3 w-16 rounded-full" />
      <Skeleton className="h-7 w-7 rounded-md" />
    </div>
  );
}

export default function ClassesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { user } = useAuthStore();
  const adminUser = isAdmin(user);
  const canManageEnrollmentPromotion =
    adminUser || ['secretary', 'accountant'].includes(user?.role);
  const { academicYear: defaultAcademicYear, term: defaultTerm } = useSchoolTermDefaults(['classes', 'term-defaults']);

  const [open, setOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);
  const { dialog: confirmDialog, openConfirm, closeConfirm } = useConfirmDialog();
  const [promoteDialog, setPromoteDialog] = useState(PROMOTE_INIT);
  const [filterYear, setFilterYear] = useState(defaultAcademicYear);
  const [editingClass, setEditingClass] = useState(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { academicYear: defaultAcademicYear, term: defaultTerm },
  });
  const formAcademicYear = watch('academicYear');
  const formTerm = watch('term');

  const editForm = useForm({ resolver: zodResolver(editSchema) });

  useEffect(() => {
    setFilterYear(defaultAcademicYear);
    setValue('academicYear', defaultAcademicYear);
    setValue('term', defaultTerm);
  }, [defaultAcademicYear, defaultTerm, setValue]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['classes', filterYear],
    queryFn: async () => {
      const res = await classesApi.list({ academicYear: filterYear, limit: 100 });
      return res.data;
    },
  });

  const { data: teachersRaw } = useTeachers();

  const [sheetTab, setSheetTab] = useState('students');

  const { data: classDetailData, isLoading: studentsLoading } = useQuery({
    queryKey: ['class-detail', selectedClass?._id],
    queryFn: async () => {
      const res = await classesApi.get(selectedClass._id);
      return res.data;
    },
    enabled: !!selectedClass?._id,
  });

  const { data: classPlans, isLoading: plansLoading } = useQuery({
    queryKey: ['lesson-plans-class', selectedClass?._id],
    queryFn: async () => {
      const res = await lessonPlansApi.list({ classId: selectedClass._id });
      return res.data?.plans ?? [];
    },
    enabled: !!selectedClass?._id && sheetTab === 'plans',
  });

  const classStudents = classDetailData?.students ?? classDetailData?.data?.students ?? [];
  const studentContactRows = useMemo(
    () => classStudents.map((student) => {
      const linkedParents = Array.isArray(student.parentIds) ? student.parentIds : [];
      const guardians = Array.isArray(student.guardians) ? student.guardians : [];
      const contacts = linkedParents.length > 0
        ? linkedParents.map((p) => ({ name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || '—', phone: p.phone ?? '—' }))
        : guardians.map((g) => ({ name: `${g.firstName ?? ''} ${g.lastName ?? ''}`.trim() || '—', phone: g.phone ?? '—' }));
      return {
        studentId: student._id,
        studentName: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || '—',
        admissionNumber: student.admissionNumber ?? '—',
        contacts: contacts.length > 0 ? contacts : [{ name: '—', phone: '—' }],
      };
    }),
    [classStudents]
  );

  const { mutate: createClass, isPending } = useMutation({
    mutationFn: (data) => classesApi.create(data),
    onSuccess: () => {
      toast.success('Class created');
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setOpen(false);
      reset({ academicYear: defaultAcademicYear, term: defaultTerm });
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: updateClass, isPending: isUpdating } = useMutation({
    mutationFn: ({ id, data }) => classesApi.update(id, data),
    onSuccess: () => {
      toast.success('Class updated');
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setEditingClass(null);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: deleteClass } = useMutation({
    mutationFn: (id) => classesApi.delete(id),
    onSuccess: () => {
      toast.success('Class deleted');
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setSelectedClass(null);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: promoteClass, isPending: isPromoting } = useMutation({
    mutationFn: ({ id, targetClassId, action }) =>
      classesApi.promote(id, action === 'graduate' ? { action } : { action, targetClassId }),
    onSuccess: (res) => {
      toast.success(res?.data?.message ?? 'Students promoted successfully');
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setPromoteDialog(PROMOTE_INIT);
      setSelectedClass(null);
    },
    onError: (err) => showApiError(err),
  });

  const confirm = (title, description, onConfirm) =>
    openConfirm({ title, description, onConfirm });

  const openEdit = (cls, e) => {
    e?.stopPropagation();
    editForm.reset({
      name: cls.name ?? '',
      stream: cls.stream ?? '',
      levelCategory: cls.levelCategory ?? '',
      classTeacherId: typeof cls.classTeacherId === 'object'
        ? cls.classTeacherId?._id ?? '' : cls.classTeacherId ?? '',
    });
    setEditingClass(cls);
  };

  const submitEdit = (data) => {
    if (!editingClass) return;
    updateClass({
      id: editingClass._id,
      data: {
        name: data.name,
        stream: data.stream || undefined,
        levelCategory: data.levelCategory,
        classTeacherId: data.classTeacherId || undefined,
      },
    });
  };

  const classes = data?.data ?? [];
  const teacherList = teachersRaw ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        overline="Classes"
        title="Classes"
        description="Manage classes and student promotion"
      >
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        {adminUser && (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add Class
          </Button>
        )}
      </PageHeader>

      {/* ── Hairline table ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="rounded-lg border overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/30 border-b">
            {['flex-1', 'w-28', 'w-32', 'w-20', 'w-8'].map((w, i) => (
              <Skeleton key={i} className={cn('h-3 rounded-full', w)} />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonTableRow key={i} />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-destructive/20 bg-destructive/5">
          <p className="text-sm font-medium text-destructive">Failed to load classes</p>
          <p className="text-xs text-muted-foreground mt-1">Please refresh and try again.</p>
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No classes yet"
          description="Create your first class to get started"
          action={adminUser ? { label: 'Add Class', onClick: () => setOpen(true) } : undefined}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2.5 border-b">Class</th>
                  <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2.5 border-b">Level</th>
                  <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2.5 border-b">Class Teacher</th>
                  <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-4 py-2.5 border-b">Enrollment</th>
                  <th className="px-2 py-2.5 border-b w-16" />
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => (
                  <tr
                    key={cls._id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer border-b last:border-0"
                    onClick={() => setSelectedClass(cls)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {cls.name}{cls.stream ? <span className="text-muted-foreground font-normal"> · {cls.stream}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">{cls.term} · {cls.academicYear}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{cls.levelCategory}</td>
                    <td className="px-4 py-3">
                      <TeacherChip teacher={cls.classTeacherId} />
                    </td>
                    <td className="px-4 py-3">
                      <EnrollmentBar count={cls.studentCount} />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {(adminUser || canManageEnrollmentPromotion) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {adminUser && (
                                <>
                                  <DropdownMenuItem onClick={(e) => openEdit(cls, e)}>
                                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit class
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setPromoteDialog({ open: true, sourceClass: cls, targetClassId: '', action: 'promote' }); }}>
                                <GraduationCap className="h-3.5 w-3.5 mr-2" /> Promote students
                              </DropdownMenuItem>
                              {adminUser && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={(e) => { e.stopPropagation(); confirm('Delete class?', 'This will permanently remove the class and cannot be undone.', () => deleteClass(cls._id)); }}
                                  >
                                    Delete class
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="md:hidden space-y-2">
            {classes.map((cls) => (
              <div
                key={cls._id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => setSelectedClass(cls)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {cls.name}{cls.stream ? ` · ${cls.stream}` : ''}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                    <span>{cls.levelCategory}</span>
                    <span>·</span>
                    <EnrollmentBar count={cls.studentCount} max={40} />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Class detail side panel ───────────────────────────────────────── */}
      <Sheet open={!!selectedClass} onOpenChange={(open) => { if (!open) { setSelectedClass(null); setSheetTab('students'); } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedClass && (
            <>
              <SheetHeader className="mb-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <SheetTitle className="text-lg">
                      {selectedClass.name}{selectedClass.stream ? ` · ${selectedClass.stream}` : ''}
                    </SheetTitle>
                    <SheetDescription>
                      {selectedClass.levelCategory} · {selectedClass.term} · {selectedClass.academicYear}
                    </SheetDescription>
                  </div>
                  {adminUser && (
                    <Button size="sm" variant="outline" className="shrink-0 mt-0.5" onClick={() => openEdit(selectedClass)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                  )}
                </div>
              </SheetHeader>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="relative rounded-lg border bg-card pl-4 pr-3 py-3 overflow-hidden">
                  <div className="absolute left-0 inset-y-0 w-[3px] rounded-l-lg bg-primary" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Enrolled</p>
                  <p className="font-mono text-xl font-semibold tabular-nums">{selectedClass.studentCount ?? classStudents.length}</p>
                </div>
                <div className="relative rounded-lg border bg-card pl-4 pr-3 py-3 overflow-hidden">
                  <div className="absolute left-0 inset-y-0 w-[3px] rounded-l-lg bg-muted-foreground/40" />
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Class Teacher</p>
                  <p className="text-sm font-medium leading-tight">
                    {typeof selectedClass.classTeacherId === 'object' && selectedClass.classTeacherId
                      ? `${selectedClass.classTeacherId.firstName} ${selectedClass.classTeacherId.lastName}`
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              {canManageEnrollmentPromotion && (
                <div className="flex gap-2 mb-4">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setSelectedClass(null); router.push(`/students?classId=${selectedClass._id}&enroll=1`); }}>
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Enroll Student
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setPromoteDialog({ open: true, sourceClass: selectedClass, targetClassId: '', action: 'promote' })}>
                    <GraduationCap className="h-3.5 w-3.5 mr-1.5" /> Promote
                  </Button>
                </div>
              )}

              {/* Tabs: Students | Lesson Plans */}
              <Tabs value={sheetTab} onValueChange={setSheetTab}>
                <TabsList className="w-full grid grid-cols-2 mb-4">
                  <TabsTrigger value="students" className="text-xs">
                    <Users className="h-3.5 w-3.5 mr-1.5" /> Students
                  </TabsTrigger>
                  <TabsTrigger value="plans" className="text-xs">
                    <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Lesson Plans
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="students">
                  {studentsLoading ? (
                    <SkeletonList count={5} className="h-10" />
                  ) : studentContactRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No students enrolled in this class</p>
                  ) : (
                    <div className="divide-y rounded-md border overflow-hidden">
                      {studentContactRows.map((row, idx) => (
                        <div key={row.studentId} className="px-3 py-2.5 bg-background hover:bg-muted/40 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs text-muted-foreground w-5 text-right tabular-nums">{idx + 1}</span>
                            <div>
                              <p className="text-sm font-medium">{row.studentName}</p>
                              <p className="text-xs text-muted-foreground font-mono">{row.admissionNumber}</p>
                            </div>
                          </div>
                          <div className="mt-1.5 space-y-1 pl-7">
                            {row.contacts.map((c, i) => (
                              <p key={`${row.studentId}-${i}`} className="text-xs text-muted-foreground">
                                {c.name} · {c.phone || '—'}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="plans">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-muted-foreground">Plans & work schedules for this class</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => router.push('/lesson-plans')}>
                      <ExternalLink className="h-3 w-3" /> All Plans
                    </Button>
                  </div>

                  {plansLoading ? (
                    <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
                  ) : !classPlans?.length ? (
                    <div className="py-8 text-center">
                      <FileText className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                      <p className="text-sm text-muted-foreground">No lesson plans for this class yet.</p>
                      <Button size="sm" variant="outline" className="mt-3 gap-1.5 text-xs" onClick={() => router.push('/lesson-plans')}>
                        <ExternalLink className="h-3.5 w-3.5" /> Go to Lesson Plans
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {classPlans.map((plan) => {
                        const firstImg = plan.images?.[0];
                        return (
                          <div key={plan._id} className="rounded-lg border overflow-hidden">
                            {firstImg ? (
                              <div className="relative">
                                <PrivateImage src={firstImg.url} alt={plan.title} className="w-full h-28 object-cover bg-muted" />
                                {plan.images.length > 1 && (
                                  <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded-full">
                                    {plan.images.length} pages
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center justify-center h-16 bg-muted/50 border-b">
                                <FileText className="h-6 w-6 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="p-2.5 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold leading-snug">{plan.title}</p>
                                <Badge variant="outline" className="text-[10px] shrink-0 capitalize">
                                  {plan.type === 'work_schedule' ? 'Schedule' : 'Plan'}
                                </Badge>
                              </div>
                              {plan.subjectId && <p className="text-[11px] text-muted-foreground">{plan.subjectId.name}</p>}
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{plan.term} {plan.academicYear}{plan.weekNumber ? ` · Wk ${plan.weekNumber}` : ''}</span>
                                <span>{formatDate(plan.createdAt)}</span>
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                {firstImg && (
                                  <PrivateLink fileKey={firstImg.url} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                                    <Eye className="h-3 w-3" /> View
                                  </PrivateLink>
                                )}
                                {plan.pdfUrl && (
                                  <PrivateLink fileKey={plan.pdfUrl} className="inline-flex items-center gap-1 text-[11px] text-ok hover:underline">
                                    <Download className="h-3 w-3" /> Download PDF
                                  </PrivateLink>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Create class dialog ───────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Class</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(createClass)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Class Name</Label>
                <Input {...register('name')} placeholder="Grade 5" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Stream (optional)</Label>
                <Input {...register('stream')} placeholder="East" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Level Category</Label>
              <Select onValueChange={(v) => setValue('levelCategory', v)}>
                <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                <SelectContent>
                  {LEVEL_CATEGORIES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.levelCategory && <p className="text-xs text-destructive">{errors.levelCategory.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Academic Year</Label>
                <Select value={formAcademicYear || defaultAcademicYear} onValueChange={(v) => setValue('academicYear', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Term</Label>
                <Select value={formTerm || defaultTerm} onValueChange={(v) => setValue('term', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Class Teacher (optional)</Label>
              <Select onValueChange={(v) => setValue('classTeacherId', v)}>
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {teacherList.map((t) => (
                    <SelectItem key={t._id} value={t._id}>{t.firstName} {t.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>Create Class</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit class dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!editingClass} onOpenChange={(o) => !o && setEditingClass(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Class</DialogTitle></DialogHeader>
          <form onSubmit={editForm.handleSubmit(submitEdit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Class Name</Label>
                <Input {...editForm.register('name')} placeholder="Grade 5" />
                {editForm.formState.errors.name && <p className="text-xs text-destructive">{editForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Stream (optional)</Label>
                <Input {...editForm.register('stream')} placeholder="East" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Level Category</Label>
              <Select defaultValue={editingClass?.levelCategory} onValueChange={(v) => editForm.setValue('levelCategory', v)}>
                <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                <SelectContent>{LEVEL_CATEGORIES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
              {editForm.formState.errors.levelCategory && <p className="text-xs text-destructive">{editForm.formState.errors.levelCategory.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Class Teacher (optional)</Label>
              <Select
                defaultValue={typeof editingClass?.classTeacherId === 'object' ? editingClass?.classTeacherId?._id : editingClass?.classTeacherId ?? ''}
                onValueChange={(v) => editForm.setValue('classTeacherId', v === '__none__' ? '' : v)}
              >
                <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No teacher —</SelectItem>
                  {teacherList.map((t) => <SelectItem key={t._id} value={t._id}>{t.firstName} {t.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingClass(null)}>Cancel</Button>
              <Button type="submit" disabled={isUpdating}>Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Promote dialog ────────────────────────────────────────────────── */}
      <Dialog open={promoteDialog.open} onOpenChange={(o) => !o && setPromoteDialog(PROMOTE_INIT)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Promote Students</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Move all active students from{' '}
              <span className="font-semibold text-foreground">
                {promoteDialog.sourceClass?.name}{promoteDialog.sourceClass?.stream ? ` ${promoteDialog.sourceClass.stream}` : ''}
              </span>{' '}
              to another class.
            </p>
            <div className="space-y-1.5">
              <Label>Target Class</Label>
              <Select
                value={promoteDialog.targetClassId}
                onValueChange={(v) => setPromoteDialog((d) => ({ ...d, targetClassId: v, action: v === '__graduate__' ? 'graduate' : 'promote' }))}
              >
                <SelectTrigger><SelectValue placeholder="Select destination class" /></SelectTrigger>
                <SelectContent>
                  {classes.filter((c) => c._id !== promoteDialog.sourceClass?._id).map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}{c.stream ? ` — ${c.stream}` : ''} ({c.term} · {c.academicYear})
                    </SelectItem>
                  ))}
                  <SelectItem value="__graduate__">Graduation List (mark as graduated)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(promoteDialog.targetClassId || promoteDialog.action === 'graduate') && (
              <p className="text-xs text-warn bg-warn/5 border border-warn/30 rounded-md px-3 py-2">
                {promoteDialog.action === 'graduate'
                  ? 'This will mark all active students as graduated. This action cannot be undone.'
                  : 'This will move all active students. This action cannot be undone.'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteDialog(PROMOTE_INIT)}>Cancel</Button>
            <Button
              disabled={(!promoteDialog.targetClassId && promoteDialog.action !== 'graduate') || isPromoting}
              onClick={() => promoteClass({
                id: promoteDialog.sourceClass._id,
                targetClassId: promoteDialog.targetClassId === '__graduate__' ? undefined : promoteDialog.targetClassId,
                action: promoteDialog.action,
              })}
            >
              {isPromoting
                ? (promoteDialog.action === 'graduate' ? 'Graduating…' : 'Promoting…')
                : (promoteDialog.action === 'graduate' ? 'Graduate Students' : 'Promote Students')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm dialog ────────────────────────────────────────────────── */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && closeConfirm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            {confirmDialog.description && <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { confirmDialog.onConfirm?.(); closeConfirm(); }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
