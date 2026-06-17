'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, MoreHorizontal, Users, BookOpen, GraduationCap, LogIn, LogOut,
  FolderOpen, Pencil, Trash2, UserCircle, ChevronRight,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { subjectsApi, departmentsApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useClasses, useTeachers } from '@/hooks/use-app-queries';
import { useAuthStore, isAdmin } from '@/store/auth.store';
import { PageHeader } from '@/components/shared/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';

const SUBJECT_TIERS = [
  { value: 'core',     label: 'Core' },
  { value: 'optional', label: 'Optional' },
  { value: 'kcse',     label: 'KCSE' },
];

const subjectSchema = z.object({
  name:         z.string().min(1, 'Required'),
  code:         z.string().optional(),
  classId:      z.string().min(1, 'Required'),
  departmentId: z.string().optional(),
  tier:         z.string().optional(),
});

const deptSchema = z.object({
  name:        z.string().min(1, 'Required'),
  description: z.string().optional(),
  hodId:       z.string().optional(),
});


// ── Tier pill ─────────────────────────────────────────────────────────────────
function TierPill({ tier }) {
  if (!tier) return <span className="text-muted-foreground text-xs">—</span>;
  const label = SUBJECT_TIERS.find((t) => t.value === tier)?.label ?? tier;
  return (
    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground">
      {label}
    </span>
  );
}

// ── Initials avatar ───────────────────────────────────────────────────────────
function Avatar({ name, className = '' }) {
  const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className={`inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-[10px] shrink-0 ${className}`}>
      {initials}
    </span>
  );
}

// ── Department card (admin) ───────────────────────────────────────────────────
function DepartmentCard({ dept, onEdit, onDelete, onAddMember, onRemoveMember, isPendingMember }) {
  const hod = dept.hodId ? `${dept.hodId.firstName} ${dept.hodId.lastName}` : null;
  const members = dept.memberIds ?? [];

  return (
    <Card className="group flex flex-col">
      {/* Header */}
      <CardHeader className="pb-3 pt-4 px-4 border-b">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FolderOpen className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold leading-tight">{dept.name}</CardTitle>
              {dept.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{dept.description}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(dept)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(dept)}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <BookOpen className="h-3 w-3" />
            {dept.subjectCount} subject{dept.subjectCount !== 1 ? 's' : ''}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {members.length} member{members.length !== 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>

      {/* HOD row */}
      <CardContent className="px-4 pt-3 pb-2 flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-8 shrink-0">HOD</span>
          {hod ? (
            <div className="flex items-center gap-1.5">
              <Avatar name={hod} className="w-5 h-5" />
              <span className="text-xs font-medium">{hod}</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/50 italic">Not assigned</span>
          )}
        </div>

        {/* Members list */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Members</span>
              {members.length > 0 && (
                <span className="font-mono text-[10px] tabular-nums bg-muted text-muted-foreground rounded px-1.5 py-0.5 leading-none">
                  {members.length}
                </span>
              )}
            </div>
            <Button
              variant="ghost" size="sm"
              className="h-6 px-2 text-xs text-primary hover:text-primary"
              onClick={() => onAddMember(dept)}
            >
              <Plus className="h-3 w-3 mr-0.5" /> Add
            </Button>
          </div>

          {members.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 italic py-1">No members yet</p>
          ) : (
            <div className="max-h-[120px] overflow-y-auto space-y-1 pr-1">
              {members.map((m) => {
                const name = `${m.firstName} ${m.lastName}`;
                return (
                  <div key={m._id} className="flex items-center justify-between group/member py-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={name} className="w-6 h-6" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium leading-tight truncate">{name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{m.role?.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 opacity-0 group-hover/member:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      disabled={isPendingMember}
                      onClick={() => onRemoveMember(dept._id, m._id, name)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Department form dialog ────────────────────────────────────────────────────
function DepartmentFormDialog({ open, onOpenChange, editTarget, teachers, onSubmit, isPending }) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(deptSchema),
    defaultValues: { name: '', description: '', hodId: '' },
  });

  // Sync form when editTarget changes
  useMemo(() => {
    if (editTarget) {
      reset({
        name:        editTarget.name,
        description: editTarget.description ?? '',
        hodId:       typeof editTarget.hodId === 'object' ? (editTarget.hodId?._id ?? '') : (editTarget.hodId ?? ''),
      });
    } else {
      reset({ name: '', description: '', hodId: '' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget, open]);

  const hodId = watch('hodId');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Department' : 'Create Department'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Department Name</Label>
            <Input {...register('name')} placeholder="e.g. Sciences" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea {...register('description')} placeholder="Brief description of this department" rows={2} className="resize-none" />
          </div>
          <div className="space-y-1.5">
            <Label>Head of Department <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Select value={hodId || '__none__'} onValueChange={(v) => setValue('hodId', v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select HOD" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— None —</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t._id} value={t._id}>{t.firstName} {t.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {editTarget ? 'Save Changes' : 'Create Department'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add member dialog ─────────────────────────────────────────────────────────
function AddMemberDialog({ open, onOpenChange, dept, teachers, onAdd, isPending }) {
  const existing = new Set((dept?.memberIds ?? []).map((m) => m._id ?? m));
  const available = teachers.filter((t) => !existing.has(t._id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Member — {dept?.name}</DialogTitle>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">All teachers are already members of this department.</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto py-1">
            {available.map((t) => (
              <button
                key={t._id}
                disabled={isPending}
                onClick={() => onAdd(dept._id, t._id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
              >
                <Avatar name={`${t.firstName} ${t.lastName}`} className="w-7 h-7" />
                <div>
                  <p className="text-sm font-medium">{t.firstName} {t.lastName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{t.role?.replace('_', ' ')}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Teacher subject card ──────────────────────────────────────────────────────
function TeacherSubjectCard({ subject, isAssigned, onJoin, onLeave, isPending }) {
  const cls = typeof subject.classId === 'object'
    ? `${subject.classId.name}${subject.classId.stream ? ` ${subject.classId.stream}` : ''}`
    : '—';

  return (
    <div className={`flex items-center justify-between rounded-lg border bg-card px-4 py-3 transition-colors ${isAssigned ? 'border-primary/20 bg-primary/5' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isAssigned ? 'bg-primary/15' : 'bg-muted'}`}>
          <BookOpen className={`h-4 w-4 ${isAssigned ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {subject.name}
            {subject.code && <span className="font-mono text-xs text-muted-foreground ml-1.5">{subject.code}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {cls}{subject.department ? ` · ${subject.department}` : ''}
          </p>
        </div>
        {subject.tier && <TierPill tier={subject.tier} />}
      </div>
      {isAssigned ? (
        <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/8 shrink-0"
          disabled={isPending} onClick={() => onLeave(subject._id)}>
          <LogOut className="h-3.5 w-3.5 mr-1" /> Leave
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/8 shrink-0"
          disabled={isPending} onClick={() => onJoin(subject._id)}>
          <LogIn className="h-3.5 w-3.5 mr-1" /> Join
        </Button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SubjectsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const adminUser = isAdmin(user);
  const isTeacher = ['teacher', 'department_head'].includes(user?.role);

  // Subjects tab state
  const [subjectTab, setSubjectTab]               = useState('subjects');
  const [open, setOpen]                           = useState(false);
  const [assignTarget, setAssignTarget]           = useState(null);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState([]);
  const [selectedHodId, setSelectedHodId]         = useState('');
  const [page, setPage]                           = useState(1);
  const { dialog: confirmDialog, openConfirm, closeConfirm } = useConfirmDialog();
  const [deptFilter, setDeptFilter]               = useState('');

  // Teacher state
  const [teacherTab, setTeacherTab]               = useState('mine');

  // Department management state
  const [deptFormOpen, setDeptFormOpen]           = useState(false);
  const [editDept, setEditDept]                   = useState(null);
  const [deleteDeptTarget, setDeleteDeptTarget]   = useState(null);
  const [addMemberTarget, setAddMemberTarget]     = useState(null);
  const [removeMemberConfirm, setRemoveMemberConfirm] = useState({ open: false, deptId: null, userId: null, memberName: '' });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(subjectSchema),
  });

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['subjects', page, deptFilter],
    queryFn: async () => {
      const res = await subjectsApi.list({ page, limit: 50, department: deptFilter || undefined });
      return res.data;
    },
    enabled: !isTeacher,
  });

  const { data: deptsData, isLoading: deptsLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => { const res = await departmentsApi.list(); return res.data; },
    enabled: !isTeacher,
  });

  const { data: mySubjectsData, isLoading: myLoading } = useQuery({
    queryKey: ['my-subjects'],
    queryFn: async () => { const res = await subjectsApi.list({ limit: 200 }); return res.data; },
    enabled: isTeacher,
  });

  const { data: allSubjectsData, isLoading: allLoading } = useQuery({
    queryKey: ['subjects-browse'],
    queryFn: async () => { const res = await subjectsApi.list({ all: 'true', limit: 200 }); return res.data; },
    enabled: isTeacher && teacherTab === 'browse',
  });

  const { data: classesData  } = useClasses();
  const { data: teachersData } = useTeachers();

  const subjects    = data?.subjects ?? data?.data ?? [];
  const departments = deptsData?.departments ?? deptsData?.data ?? [];
  const mySubjects  = mySubjectsData?.subjects ?? mySubjectsData?.data ?? [];
  const allSubjects = allSubjectsData?.subjects ?? allSubjectsData?.data ?? [];
  const teachers    = teachersData ?? [];
  const meta        = data?.meta ?? data?.pagination;

  const deptNames = useMemo(() => departments.map((d) => d.name), [departments]);

  const teacherBrowseDepts = useMemo(
    () => [...new Set(allSubjects.map((s) => s.department).filter(Boolean))].sort(),
    [allSubjects]
  );

  const mySubjectIds = useMemo(() => new Set(mySubjects.map((s) => s._id)), [mySubjects]);

  // ── Subject mutations ──────────────────────────────────────────────────────
  const { mutate: createSubject, isPending: isCreating } = useMutation({
    mutationFn: (data) => {
      // Resolve department name from departmentId
      const dept = departments.find((d) => d._id === data.departmentId);
      return subjectsApi.create({ ...data, department: dept?.name ?? undefined, departmentId: undefined });
    },
    onSuccess: () => {
      toast.success('Subject created');
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      queryClient.refetchQueries({ queryKey: ['subjects', page, deptFilter] });
      setOpen(false);
      reset();
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: deleteSubject } = useMutation({
    mutationFn: (id) => subjectsApi.delete(id),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['subjects'] }); },
    onError: (err) => showApiError(err),
  });

  const { mutate: assignTeachers, isPending: isAssigning } = useMutation({
    mutationFn: ({ id, teacherIds, hodId }) => subjectsApi.assignTeachers(id, { teacherIds, hodId: hodId || null }),
    onSuccess: () => {
      toast.success('Teachers updated');
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      setAssignTarget(null);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: selfAssign, isPending: isSelfAssigning } = useMutation({
    mutationFn: ({ id, action }) => subjectsApi.selfAssign(id, action),
    onSuccess: (_, { action }) => {
      toast.success(action === 'join' ? 'Added to subject' : 'Removed from subject');
      queryClient.invalidateQueries({ queryKey: ['my-subjects'] });
      queryClient.invalidateQueries({ queryKey: ['subjects-browse'] });
    },
    onError: (err) => showApiError(err),
  });

  // ── Department mutations ───────────────────────────────────────────────────
  const { mutate: saveDept, isPending: isSavingDept } = useMutation({
    mutationFn: (data) => {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        hodId: data.hodId || null,
      };
      return editDept
        ? departmentsApi.update(editDept._id, payload)
        : departmentsApi.create(payload);
    },
    onSuccess: () => {
      toast.success(editDept ? 'Department updated' : 'Department created');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      setDeptFormOpen(false);
      setEditDept(null);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: deleteDept, isPending: isDeletingDept } = useMutation({
    mutationFn: (id) => departmentsApi.delete(id),
    onSuccess: () => {
      toast.success('Department deleted');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      setDeleteDeptTarget(null);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: addDeptMember, isPending: isAddingMember } = useMutation({
    mutationFn: ({ deptId, userId }) => departmentsApi.addMember(deptId, userId),
    onSuccess: () => {
      toast.success('Member added');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      setAddMemberTarget(null);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: removeDeptMember, isPending: isRemovingMember } = useMutation({
    mutationFn: ({ deptId, userId }) => departmentsApi.removeMember(deptId, userId),
    onSuccess: () => {
      toast.success('Member removed');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) => showApiError(err),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  const toggleTeacher = (id) =>
    setSelectedTeacherIds((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  const openAssign = (subj) => {
    setAssignTarget(subj);
    setSelectedTeacherIds((subj.teacherIds ?? []).map((t) => (typeof t === 'object' ? t._id : t)));
    setSelectedHodId(typeof subj.hodId === 'object' ? (subj.hodId?._id ?? '') : (subj.hodId ?? ''));
  };

  const confirm = (title, description, onConfirm) =>
    openConfirm({ title, description, onConfirm });

  // ── Teacher view ──────────────────────────────────────────────────────────
  if (isTeacher) {
    const browseList = deptFilter
      ? allSubjects.filter((s) => s.department === deptFilter)
      : allSubjects;

    return (
      <div className="space-y-5">
        <PageHeader
          overline="Subjects"
          title="My Subjects"
          description="View your assigned subjects or join ones you teach"
        />

        <Tabs value={teacherTab} onValueChange={setTeacherTab}>
          <TabsList>
            <TabsTrigger value="mine" className="gap-2">
              <GraduationCap className="h-4 w-4" /> My Subjects
              {mySubjects.length > 0 && <Badge variant="secondary" className="ml-1">{mySubjects.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="browse" className="gap-2">
              <BookOpen className="h-4 w-4" /> Browse All
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {teacherTab === 'mine' && (
          myLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : mySubjects.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm space-y-2">
              <GraduationCap className="h-8 w-8 mx-auto opacity-30" />
              <p>You haven&apos;t been assigned to any subjects yet.</p>
              <p>
                Switch to{' '}
                <button className="underline text-primary" onClick={() => setTeacherTab('browse')}>
                  Browse All
                </button>{' '}
                to find and join subjects you teach.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {mySubjects.map((s) => (
                <TeacherSubjectCard key={s._id} subject={s} isAssigned
                  onLeave={(id) => selfAssign({ id, action: 'leave' })} isPending={isSelfAssigning} />
              ))}
            </div>
          )
        )}

        {teacherTab === 'browse' && (
          <div className="space-y-4">
            {teacherBrowseDepts.length > 0 && (
              <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All departments</SelectItem>
                  {teacherBrowseDepts.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {allLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : browseList.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">No subjects found.</p>
            ) : (
              <div className="space-y-2">
                {browseList.map((s) => (
                  <TeacherSubjectCard key={s._id} subject={s} isAssigned={mySubjectIds.has(s._id)}
                    onJoin={(id) => selfAssign({ id, action: 'join' })}
                    onLeave={(id) => selfAssign({ id, action: 'leave' })}
                    isPending={isSelfAssigning} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Admin view ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader
        overline="Subjects"
        title="Subjects & Departments"
        description="Manage subjects, departments, and teacher assignments"
      >
        {subjectTab === 'subjects' ? (
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Subject
          </Button>
        ) : (
          <Button size="sm" onClick={() => { setEditDept(null); setDeptFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Department
          </Button>
        )}
      </PageHeader>

      {/* ── Main tabs ───────────────────────────────────────────────────────── */}
      <Tabs value={subjectTab} onValueChange={setSubjectTab}>
        <TabsList>
          <TabsTrigger value="subjects" className="gap-2">
            <BookOpen className="h-4 w-4" /> Subjects
            {subjects.length > 0 && <Badge variant="secondary" className="ml-1">{subjects.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-2">
            <FolderOpen className="h-4 w-4" /> Departments
            {departments.length > 0 && <Badge variant="secondary" className="ml-1">{departments.length}</Badge>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Subjects tab ────────────────────────────────────────────────────── */}
      {subjectTab === 'subjects' && (
        <>
          {/* Department filter */}
          {deptNames.length > 0 && (
            <div className="flex gap-2">
              <Select value={deptFilter} onValueChange={(v) => { setDeptFilter(v === '__all__' ? '' : v); setPage(1); }}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="All departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All departments</SelectItem>
                  {deptNames.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              {deptFilter && (
                <Button variant="ghost" size="sm" className="h-8" onClick={() => { setDeptFilter(''); setPage(1); }}>Clear</Button>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : subjects.length === 0 ? (
            <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No subjects yet. Add one to get started.</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Subject</th>
                      <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Tier</th>
                      <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Class</th>
                      <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Teachers</th>
                      <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">HOD</th>
                      <th className="py-2.5 px-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(deptFilter ? subjects.filter((s) => s.department === deptFilter) : subjects).map((s) => {
                      const cls = typeof s.classId === 'object'
                        ? `${s.classId.name}${s.classId.stream ? ` ${s.classId.stream}` : ''}`
                        : '—';
                      const hod = typeof s.hodId === 'object' ? `${s.hodId.firstName} ${s.hodId.lastName}` : '—';
                      const teacherCount = s.teacherIds?.length ?? 0;
                      return (
                        <tr key={s._id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-medium text-sm">
                              {s.name}
                              {s.code && <span className="font-mono text-xs text-muted-foreground ml-1.5">{s.code}</span>}
                            </p>
                            {s.department && <p className="text-xs text-muted-foreground">{s.department}</p>}
                          </td>
                          <td className="py-3 px-3 hidden sm:table-cell"><TierPill tier={s.tier} /></td>
                          <td className="py-3 px-3 text-muted-foreground text-sm hidden md:table-cell">{cls}</td>
                          <td className="py-3 px-3 hidden lg:table-cell">
                            <span className="text-xs text-muted-foreground">{teacherCount} teacher{teacherCount !== 1 ? 's' : ''}</span>
                          </td>
                          <td className="py-3 px-3 text-sm hidden lg:table-cell">{hod}</td>
                          <td className="py-3 px-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openAssign(s)}>
                                  <Users className="h-4 w-4 mr-2" /> Assign Teachers
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive"
                                  onClick={() => confirm('Delete subject?', 'This action cannot be undone.', () => deleteSubject(s._id))}>
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(meta?.totalPages ?? 1) > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Page {page} of {meta.totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Departments tab ──────────────────────────────────────────────────── */}
      {subjectTab === 'departments' && (
        <>
          {deptsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : departments.length === 0 ? (
            <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
              <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium mb-1">No departments yet</p>
              <p className="text-xs mb-4">Create departments to organise your subjects by area of study</p>
              <Button size="sm" onClick={() => { setEditDept(null); setDeptFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Create First Department
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {departments.map((d) => (
                <DepartmentCard
                  key={d._id}
                  dept={d}
                  onEdit={(dept) => { setEditDept(dept); setDeptFormOpen(true); }}
                  onDelete={(dept) => setDeleteDeptTarget(dept)}
                  onAddMember={(dept) => setAddMemberTarget(dept)}
                  onRemoveMember={(deptId, userId, memberName) => setRemoveMemberConfirm({ open: true, deptId, userId, memberName })}
                  isPendingMember={isRemovingMember}
                />
              ))}
            </div>
          )}

          {/* Quick link to subjects filtered by dept */}
          {departments.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                To see subjects within a department, go to the{' '}
                <button
                  className="text-primary underline-offset-2 hover:underline inline-flex items-center gap-0.5"
                  onClick={() => setSubjectTab('subjects')}
                >
                  Subjects tab <ChevronRight className="h-3 w-3" />
                </button>{' '}
                and use the department filter.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── Create subject dialog ──────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Subject</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(createSubject)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Subject Name</Label>
                <Input {...register('name')} placeholder="Mathematics" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Code <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input {...register('code')} placeholder="MTH" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Department <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select onValueChange={(v) => setValue('departmentId', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select dept" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {departments.map((d) => <SelectItem key={d._id} value={d._id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tier <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select onValueChange={(v) => setValue('tier', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Select tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {SUBJECT_TIERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select onValueChange={(v) => setValue('classId', v)}>
                <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                <SelectContent>
                  {(classesData ?? []).map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.classId && <p className="text-xs text-destructive">{errors.classId.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isCreating}>Create Subject</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Assign teachers dialog ─────────────────────────────────────────── */}
      <Dialog open={!!assignTarget} onOpenChange={() => setAssignTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Teachers — {assignTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Teachers</Label>
              <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2">
                {teachers.length === 0 && <p className="text-xs text-muted-foreground p-2">No teachers found</p>}
                {teachers.map((t) => (
                  <label key={t._id} className="flex items-center gap-2 cursor-pointer p-1 hover:bg-muted rounded">
                    <Checkbox checked={selectedTeacherIds.includes(t._id)} onCheckedChange={() => toggleTeacher(t._id)} />
                    <span className="text-sm">{t.firstName} {t.lastName}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Head of Department <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={selectedHodId || '__none__'} onValueChange={(v) => setSelectedHodId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Select HOD" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {teachers.map((t) => <SelectItem key={t._id} value={t._id}>{t.firstName} {t.lastName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button disabled={isAssigning}
              onClick={() => assignTeachers({ id: assignTarget._id, teacherIds: selectedTeacherIds, hodId: selectedHodId })}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Department form dialog ─────────────────────────────────────────── */}
      <DepartmentFormDialog
        open={deptFormOpen}
        onOpenChange={(v) => { setDeptFormOpen(v); if (!v) setEditDept(null); }}
        editTarget={editDept}
        teachers={teachers}
        onSubmit={saveDept}
        isPending={isSavingDept}
      />

      {/* ── Add member dialog ─────────────────────────────────────────────── */}
      <AddMemberDialog
        open={!!addMemberTarget}
        onOpenChange={(v) => !v && setAddMemberTarget(null)}
        dept={addMemberTarget}
        teachers={teachers}
        onAdd={(deptId, userId) => addDeptMember({ deptId, userId })}
        isPending={isAddingMember}
      />

      {/* ── Delete department confirm ──────────────────────────────────────── */}
      <AlertDialog open={!!deleteDeptTarget} onOpenChange={(v) => !v && setDeleteDeptTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteDeptTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDeptTarget?.subjectCount > 0
                ? `This department has ${deleteDeptTarget.subjectCount} subject${deleteDeptTarget.subjectCount !== 1 ? 's' : ''} assigned. Reassign them to another department before deleting.`
                : 'This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletingDept || (deleteDeptTarget?.subjectCount ?? 0) > 0}
              onClick={() => deleteDeptTarget && deleteDept(deleteDeptTarget._id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Remove department member confirm ──────────────────────────────── */}
      <AlertDialog open={removeMemberConfirm.open} onOpenChange={(v) => !v && setRemoveMemberConfirm({ open: false, deptId: null, userId: null, memberName: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeMemberConfirm.memberName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will be removed from this department. You can add them back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRemovingMember}
              onClick={() => {
                removeDeptMember({ deptId: removeMemberConfirm.deptId, userId: removeMemberConfirm.userId });
                setRemoveMemberConfirm({ open: false, deptId: null, userId: null, memberName: '' });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Generic confirm dialog ─────────────────────────────────────────── */}
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
