'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Upload, MoreHorizontal, ChevronDown, ChevronUp, Download, X, Pencil, MoveRight } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { studentsApi, feesApi, exportApi, downloadBlob, classesApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useClasses } from '@/hooks/use-app-queries';
import { useAuthStore } from '@/store/auth.store';
import { formatDate, capitalize, studentStatusStyle } from '@/lib/utils';
import { STUDENT_STATUSES } from '@/lib/constants';
import { PageHeader } from '@/components/shared/page-header';
import { RefreshButton } from '@/components/shared/refresh-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDebounce } from '@/hooks/use-debounce';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PrivateImage } from '@/components/shared/private-image';

const today      = new Date().toISOString().split('T')[0];
const minDobDate = '1990-01-01';

const schema = z.object({
  firstName:              z.string().min(1, 'Required'),
  lastName:               z.string().min(1, 'Required'),
  admissionNumber:        z.string().min(1, 'Required'),
  assessmentNumber:       z.string().optional().or(z.literal('')),
  gender:                 z.enum(['male', 'female']),
  dateOfBirth:            z.string().optional().or(z.literal(''))
    .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), 'Invalid date format'),
  birthCertificateNumber: z.string().optional().or(z.literal('')),
  enrollmentDate:         z.string().optional().or(z.literal(''))
    .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), 'Invalid date format'),
  classId:                z.string().min(1, 'Required'),
  guardians: z.array(
    z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      relationship: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email('Invalid email').optional().or(z.literal('')),
      occupation: z.string().optional(),
    })
  ).optional(),
});

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'other'];


// ── Summary Cards ─────────────────────────────────────────────────────────────

function SummaryCards({ counts }) {
  const active      = counts?.active ?? 0;
  const withdrawn   = counts?.withdrawn ?? 0;
  const transferred = counts?.transferred ?? 0;
  const graduated   = counts?.graduated ?? 0;
  const total       = active + withdrawn + transferred + graduated;
  const activePercent = total > 0 ? Math.round((active / total) * 100) : 0;

  const cards = [
    { label: 'All',         value: total,       hint: 'enrolled',             tone: null,   dot: false },
    { label: 'Active',      value: active,       hint: `${activePercent}% of roster`, tone: 'ok', dot: true },
    { label: 'Withdrawn',   value: withdrawn,    hint: 'no longer enrolled',   tone: withdrawn > 0 ? 'warn' : null, dot: false },
    { label: 'Transferred', value: transferred,  hint: 'moved out',            tone: null,   dot: false },
    { label: 'Graduated',   value: graduated,    hint: 'alumni',               tone: null,   dot: false },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
      {cards.map(({ label, value, hint, tone, dot }) => (
        <div key={label} className="rounded-lg border border-border bg-card px-3 sm:px-4 py-3 sm:py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
            {dot && <span className="w-1.5 h-1.5 rounded-full bg-ok inline-block" />}
            {label}
          </p>
          <p className={cn(
            'font-mono text-2xl font-semibold tabular-nums leading-none',
            tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-foreground',
          )}>
            {value}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
        </div>
      ))}
    </div>
  );
}

// ── Fee progress bar cell ─────────────────────────────────────────────────────

function FeeBalance({ stats }) {
  if (!stats) return <span className="text-xs text-muted-foreground">—</span>;
  const { totalPaid, totalAmount } = stats;
  if (totalAmount == null || totalAmount === 0) {
    if (totalPaid > 0) return (
      <div>
        <p className="font-mono text-xs tabular-nums text-ok font-medium">KES {totalPaid.toLocaleString('en-KE')}</p>
        <p className="text-[10px] text-muted-foreground">paid</p>
      </div>
    );
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const balance = Math.max(0, totalAmount - totalPaid);
  const isPaidUp = balance === 0;
  return (
    <div>
      <p className={cn('font-mono text-xs tabular-nums font-semibold', isPaidUp ? 'text-ok' : 'text-bad')}>
        {isPaidUp ? 'Paid up' : `KES ${balance.toLocaleString('en-KE')}`}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {isPaidUp ? `KES ${totalPaid.toLocaleString('en-KE')} paid` : 'balance due'}
      </p>
    </div>
  );
}


// ── Page ──────────────────────────────────────────────────────────────────────

export default function StudentsPage() {
  const router       = useRouter();
  const queryClient  = useQueryClient();
  const { user }     = useAuthStore();
  const isTeacher    = ['teacher', 'department_head'].includes(user?.role);

  const [search, setSearch]               = useState('');
  const [page, setPage]                   = useState(1);
  const [editNameTarget, setEditNameTarget] = useState(null); // { _id, firstName, lastName }
  const [open, setOpen]                   = useState(false);
  const [importOpen, setImportOpen]         = useState(false);
  const [importMode, setImportMode]         = useState('single'); // 'single' | 'all'
  const [importClassId, setImportClassId]   = useState('');
  const [importFile, setImportFile]         = useState(null);
  const [importJobId, setImportJobId]       = useState(null);
  const [importJobIds, setImportJobIds]     = useState([]); // for all-classes mode
  const [selectedStatus, setSelectedStatus] = useState('active');
  const [classFilter, setClassFilter]       = useState('');
  const [genderFilter, setGenderFilter]     = useState('');
  const [showGuardian, setShowGuardian]   = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [bulkTransferOpen, setBulkTransferOpen] = useState(false);
  const [bulkTransferClassId, setBulkTransferClassId] = useState(null);
  const [bulkTransferNote, setBulkTransferNote] = useState('');
  const { dialog: confirmDialog, openConfirm, closeConfirm } = useConfirmDialog();
  const debouncedSearch = useDebounce(search, 400);

  const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      enrollmentDate: today,
      guardians: [{ relationship: 'mother' }],
    },
  });
  const { fields: guardianFields, append: appendGuardian, remove: removeGuardian } = useFieldArray({
    control,
    name: 'guardians',
  });

  // Teacher: fetch assigned class to filter
  const { data: myClassData } = useQuery({
    queryKey: ['my-class'],
    queryFn: async () => { const res = await classesApi.myClass(); return res.data; },
    enabled: isTeacher,
  });
  const teacherClassId = myClassData?.data?._id ?? myClassData?._id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['students', page, debouncedSearch, selectedStatus, classFilter, genderFilter, teacherClassId],
    queryFn: async () => {
      const res = await studentsApi.list({
        page, limit: 20,
        search: debouncedSearch || undefined,
        status: selectedStatus || undefined,
        gender: genderFilter || undefined,
        ...(isTeacher && teacherClassId ? { classId: teacherClassId } : { classId: classFilter || undefined }),
      });
      return res.data;
    },
    enabled: !isTeacher || myClassData !== undefined,
  });

  // Summary counts per status (admin only — lightweight parallel queries)
  const { data: statusCounts } = useQuery({
    queryKey: ['students-status-counts'],
    queryFn: async () => {
      const results = await Promise.all(
        STUDENT_STATUSES.map((s) =>
          studentsApi.list({ page: 1, limit: 1, status: s })
            .then((r) => [s, r.data?.meta?.total ?? r.data?.pagination?.total ?? 0]),
        ),
      );
      return Object.fromEntries(results);
    },
    enabled: !isTeacher,
    staleTime: 60 * 1000,
  });

  const { data: classesData } = useClasses();
  const classes = classesData ?? [];

  // Fee stats for the current page of students
  const students   = data?.students ?? data?.data ?? [];
  const studentIds = students.map((s) => s._id).filter(Boolean);

  const { data: feeStatsData } = useQuery({
    queryKey: ['students-fee-stats', studentIds.join(',')],
    queryFn: async () => {
      const res = await feesApi.bulkFeeStats({ studentIds: studentIds.join(',') });
      return res.data?.stats ?? {};
    },
    enabled: !isTeacher && studentIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const { mutate: createStudent, isPending } = useMutation({
    mutationFn: (formData) => {
      const { guardians = [], ...studentFields } = formData;
      const normalizedGuardians = guardians
        .map((g) => ({
          firstName:    g.firstName?.trim(),
          lastName:     g.lastName?.trim(),
          relationship: g.relationship || 'guardian',
          phone:        g.phone?.trim(),
          email:        g.email?.trim() || undefined,
          occupation:   g.occupation?.trim() || undefined,
        }))
        .filter((g) => g.firstName || g.lastName || g.phone || g.email);

      // Clean up empty date fields
      const cleanedFields = {
        ...studentFields,
        dateOfBirth: studentFields.dateOfBirth ? studentFields.dateOfBirth : undefined,
        enrollmentDate: studentFields.enrollmentDate ? studentFields.enrollmentDate : undefined,
        assessmentNumber: studentFields.assessmentNumber ? studentFields.assessmentNumber.trim() : undefined,
        birthCertificateNumber: studentFields.birthCertificateNumber ? studentFields.birthCertificateNumber.trim() : undefined,
      };

      return studentsApi.create({
        ...cleanedFields,
        ...(normalizedGuardians.length ? { guardians: normalizedGuardians } : {}),
      });
    },
    onSuccess: () => {
      toast.success('Student enrolled successfully');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-status-counts'] });
      setOpen(false);
      setShowGuardian(false);
      reset({ enrollmentDate: today, guardians: [{ relationship: 'mother' }] });
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: withdrawStudent } = useMutation({
    mutationFn: ({ id }) => studentsApi.withdraw(id, {}),
    onSuccess: () => {
      toast.success('Student withdrawn');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['students-status-counts'] });
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: updateStudentName, isPending: isUpdatingName } = useMutation({
    mutationFn: ({ id, firstName, lastName }) => studentsApi.update(id, { firstName, lastName }),
    onSuccess: () => {
      toast.success('Name updated');
      queryClient.invalidateQueries({ queryKey: ['students'] });
      setEditNameTarget(null);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: bulkTransferStudents, isPending: isBulkTransferring } = useMutation({
    mutationFn: async () => {
      const selectedIds = Array.from(selectedStudentIds);
      const transferPromises = selectedIds.map((id) =>
        studentsApi.transfer(id, {
          newClassId: bulkTransferClassId,
          ...(bulkTransferNote && { note: bulkTransferNote }),
        })
      );
      await Promise.all(transferPromises);
      return { transferred: selectedIds.length };
    },
    onSuccess: (res) => {
      toast.success(`${res.transferred} student(s) transferred successfully`);
      setBulkTransferOpen(false);
      setSelectedStudentIds(new Set());
      setBulkTransferClassId(null);
      setBulkTransferNote('');
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => showApiError(err),
  });

  const resetImportDialog = () => {
    setImportFile(null);
    setImportClassId('');
    setImportMode('single');
  };

  const { mutate: startImport, isPending: importSubmitting } = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('Select a file to import.');
      if (importMode === 'single' && !importClassId) throw new Error('Select a class for this import.');
      const fd = new FormData();
      fd.append('file', importFile);
      if (importMode === 'single') fd.append('classId', importClassId);
      return studentsApi.importCsv(fd);
    },
    onSuccess: (res) => {
      const payload = res?.data?.data ?? res?.data ?? {};
      setImportOpen(false);
      resetImportDialog();

      // All-classes mode returns { jobs: [...] }
      if (payload?.jobs) {
        const ids = payload.jobs.map((j) => j.jobId).filter(Boolean);
        setImportJobIds(ids);
        const unmatched = payload.unmatchedSheets?.length ? ` (${payload.unmatchedSheets.length} sheet(s) not matched)` : '';
        toast.success(`${payload.jobs.length} class import(s) queued.${unmatched}`);
        return;
      }

      // Single-class mode
      const jobId = payload?.jobId;
      if (!jobId) { toast.error(payload?.message ?? 'Import queued, but no job ID was returned.'); return; }
      setImportJobId(jobId);
      toast.success('Import queued. Processing has started.');
    },
    onError: (err) => showApiError(err),
  });

  // Poll single-class import job
  const { data: importStatus } = useQuery({
    queryKey: ['students-import-status', importJobId],
    queryFn: async () => { const res = await studentsApi.importStatus(importJobId); return res.data; },
    enabled: !!importJobId,
    refetchInterval: (query) => {
      const result = query.state.data?.result ?? query.state.data?.data?.result ?? query.state.data?.data ?? query.state.data;
      return (result?.status === 'complete' || result?.status === 'failed') ? false : 2000;
    },
  });

  useEffect(() => {
    if (!importJobId) return;
    const result = importStatus?.result ?? importStatus?.data?.result ?? importStatus?.data ?? importStatus;
    if (result?.status !== 'complete' && result?.status !== 'failed') return;
    const succeeded = result?.succeeded ?? 0;
    const failed    = result?.failed ?? 0;
    if (result?.status === 'failed')   toast.error(result?.error ?? 'Student import failed.');
    else if (failed > 0)               toast.warning(`Import complete: ${succeeded} succeeded, ${failed} failed.`);
    else                               toast.success(`Import complete: ${succeeded} students added.`);
    setImportJobId(null);
    queryClient.invalidateQueries({ queryKey: ['students'] });
    queryClient.invalidateQueries({ queryKey: ['students-status-counts'] });
  }, [importJobId, importStatus, queryClient]);

  // Poll all-classes import jobs and aggregate completion
  const { data: multiImportStatuses } = useQuery({
    queryKey: ['students-import-status-multi', importJobIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(importJobIds.map((id) => studentsApi.importStatus(id).then((r) => r.data)));
      return results;
    },
    enabled: importJobIds.length > 0,
    refetchInterval: (query) => {
      const statuses = query.state.data ?? [];
      const allDone = statuses.every((s) => {
        const r = s?.result ?? s?.data?.result ?? s?.data ?? s;
        return r?.status === 'complete' || r?.status === 'failed';
      });
      return allDone ? false : 2000;
    },
  });

  useEffect(() => {
    if (importJobIds.length === 0 || !multiImportStatuses) return;
    const resolved = multiImportStatuses.map((s) => s?.result ?? s?.data?.result ?? s?.data ?? s);
    const allDone = resolved.every((r) => r?.status === 'complete' || r?.status === 'failed');
    if (!allDone) return;
    const totalSucceeded = resolved.reduce((sum, r) => sum + (r?.succeeded ?? 0), 0);
    const totalFailed    = resolved.reduce((sum, r) => sum + (r?.failed ?? 0), 0);
    if (totalFailed > 0) toast.warning(`All-classes import done: ${totalSucceeded} added, ${totalFailed} failed.`);
    else toast.success(`All-classes import done: ${totalSucceeded} students added across ${importJobIds.length} class(es).`);
    setImportJobIds([]);
    queryClient.invalidateQueries({ queryKey: ['students'] });
    queryClient.invalidateQueries({ queryKey: ['students-status-counts'] });
  }, [importJobIds, multiImportStatuses, queryClient]);

  const confirm = (title, description, onConfirm) =>
    openConfirm({ title, description, onConfirm });

  const toggleStudentSelection = (studentId) => {
    const newSelection = new Set(selectedStudentIds);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedStudentIds(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === students.length) {
      setSelectedStudentIds(new Set());
    } else {
      const allIds = new Set(students.map((s) => s._id));
      setSelectedStudentIds(allIds);
    }
  };

  const openBulkTransferDialog = () => {
    if (selectedStudentIds.size === 0) {
      toast.error('Please select at least one student');
      return;
    }
    setBulkTransferClassId(null);
    setBulkTransferNote('');
    setBulkTransferOpen(true);
  };

  const submitBulkTransfer = () => {
    if (!bulkTransferClassId) {
      toast.error('Please select a class');
      return;
    }
    bulkTransferStudents();
  };

  const pagination = data?.meta ?? data?.pagination;
  const totalCount = pagination?.total ?? students.length;

  // Overline: for teachers show their class; for admin show active count
  const overlineLabel = isTeacher
    ? (myClassData ? `Class · ${myClassData?.data?.fullName ?? myClassData?.fullName ?? 'Your class'}` : 'Teacher view')
    : (statusCounts ? `${statusCounts.active ?? 0} active` : 'Students');

  const statusFilters = [
    { value: '',           label: 'All'         },
    { value: 'active',     label: 'Active'      },
    { value: 'withdrawn',  label: 'Withdrawn'   },
    { value: 'transferred',label: 'Transferred' },
    { value: 'graduated',  label: 'Graduated'   },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        overline={overlineLabel}
        title="Students"
        description={isTeacher ? 'Students in your assigned class' : 'Enroll and manage student records'}
      >
        <RefreshButton queryKeys={[['students'], ['students-status-counts']]} />
        {!isTeacher && (
          <>
            <Button
              variant="outline" size="sm"
              onClick={async () => {
                try { downloadBlob(await exportApi.students(), 'students.csv'); }
                catch { toast.error('Export failed'); }
              }}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Enroll Student
            </Button>
          </>
        )}
      </PageHeader>

      {/* Summary cards — admin only */}
      {!isTeacher && statusCounts && <SummaryCards counts={statusCounts} />}

      {/* Filter row */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-wrap">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Name or admission no."
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setPage(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {statusFilters.map(({ value, label }) => (
            <button
              key={value || '__all__'}
              type="button"
              onClick={() => { setSelectedStatus(value); setPage(1); }}
              className={cn(
                'inline-flex items-center h-7 px-3 rounded-full text-xs font-medium border transition-colors shrink-0',
                selectedStatus === value
                  ? 'bg-foreground text-background border-transparent'
                  : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
              )}
            >
              {label}
              {value && statusCounts?.[value] != null && (
                <span className={cn(
                  'ml-1.5 font-mono tabular-nums text-[10px]',
                  selectedStatus === value ? 'text-background/70' : 'text-muted-foreground',
                )}>
                  {statusCounts[value]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Class filter — admin only */}
        {!isTeacher && classes.length > 0 && (
          <Select value={classFilter || '__all__'} onValueChange={(v) => { setClassFilter(v === '__all__' ? '' : v); setPage(1); }}>
            <SelectTrigger className="h-8 text-xs w-full sm:w-40 shrink-0"><SelectValue placeholder="All classes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All classes</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls._id} value={cls._id}>
                  {cls.name}{cls.stream ? ` ${cls.stream}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Gender filter */}
        <Select value={genderFilter || '__all__'} onValueChange={(v) => { setGenderFilter(v === '__all__' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-8 text-xs w-full sm:w-32 shrink-0"><SelectValue placeholder="Gender" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All genders</SelectItem>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
          </SelectContent>
        </Select>

        {/* Active filters indicator + clear */}
        {(classFilter || genderFilter) && (
          <button
            type="button"
            onClick={() => { setClassFilter(''); setGenderFilter(''); setPage(1); }}
            className="inline-flex items-center h-7 gap-1 px-2.5 rounded-full text-xs font-medium border border-primary/30 text-primary bg-primary/8 hover:bg-primary/15 transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}

        {/* Result count — only when filtered */}
        {(debouncedSearch || selectedStatus || classFilter || genderFilter) && !isLoading && (
          <p className="text-xs text-muted-foreground self-center sm:ml-auto shrink-0">
            <span className="font-mono tabular-nums font-semibold text-foreground">{totalCount}</span> result{totalCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Selection toolbar */}
      {!isTeacher && selectedStudentIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <span className="text-sm font-medium text-foreground">
            {selectedStudentIds.size} student{selectedStudentIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2 ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedStudentIds(new Set())}
            >
              Clear
            </Button>
            <Button
              size="sm"
              onClick={openBulkTransferDialog}
            >
              <MoveRight className="h-3.5 w-3.5 mr-1.5" /> Transfer
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{debouncedSearch || selectedStatus || classFilter ? 'No students match your filters.' : 'No students enrolled yet.'}</p>
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30">
                  {!isTeacher && (
                    <th className="text-left py-2.5 px-3 w-12">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.size > 0 && selectedStudentIds.size === students.length}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 cursor-pointer"
                        title="Select all students on this page"
                      />
                    </th>
                  )}
                  <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-28">Adm. Nº</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Name</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Class</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Parent / Guardian</th>
                  {!isTeacher && <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Fee Balance</th>}
                  <th className="text-center py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                  <th className="py-2.5 px-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {students.map((s) => {
                  const cls = typeof s.classId === 'object' ? `${s.classId.name}${s.classId.stream ? ` ${s.classId.stream}` : ''}` : '—';
                  const g = s.parentIds?.[0] ?? s.guardians?.[0];
                  const guardianName = g ? [g.firstName, g.lastName].filter(Boolean).join(' ') : null;
                  return (
                    <tr key={s._id} className="hover:bg-muted/20 transition-colors"
                      onClick={() => !isTeacher && router.push(`/students/${s._id}`)}>
                      {!isTeacher && (
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(s._id)}
                            onChange={() => toggleStudentSelection(s._id)}
                            className="rounded border-gray-300 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">{s.admissionNumber ?? '—'}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          {s.photo ? (
                            <PrivateImage src={s.photo} alt="" className="w-8 h-8 rounded-full object-cover border shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0 border border-primary/15 uppercase">
                              {s.firstName?.[0]}{s.lastName?.[0]}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{s.firstName} {s.lastName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground text-sm">{cls}</td>
                      <td className="py-3 px-3 hidden lg:table-cell">
                        {guardianName ? (
                          <div>
                            <p className="text-sm">{guardianName}</p>
                            {g?.phone && <p className="text-[11px] text-muted-foreground font-mono tabular-nums">{g.phone}</p>}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      {!isTeacher && (
                        <td className="py-3 px-3 hidden lg:table-cell">
                          <FeeBalance stats={feeStatsData?.[s._id] ?? null} />
                        </td>
                      )}
                      <td className="py-3 px-3 text-center">
                        <span className={cn('inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium border capitalize',
                          studentStatusStyle[s.status] ?? 'text-muted-foreground border-border')}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!isTeacher && (
                              <DropdownMenuItem onClick={() => router.push(`/students/${s._id}`)}>View details</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setEditNameTarget({ _id: s._id, firstName: s.firstName, lastName: s.lastName })}>
                              Edit name
                            </DropdownMenuItem>
                            {!isTeacher && s.status === 'active' && (
                              <DropdownMenuItem className="text-destructive" onClick={() => confirm(
                                `Withdraw ${s.firstName} ${s.lastName}?`,
                                'The student will be marked as withdrawn. This can be reversed later.',
                                () => withdrawStudent({ id: s._id }),
                              )}>Withdraw</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {students.map((s) => {
              const cls = typeof s.classId === 'object' ? `${s.classId.name}${s.classId.stream ? ` ${s.classId.stream}` : ''}` : '—';
              const g = s.parentIds?.[0] ?? s.guardians?.[0];
              const guardianName = g ? [g.firstName, g.lastName].filter(Boolean).join(' ') : null;
              return (
                <div
                  key={s._id}
                  className="rounded-lg border bg-card p-4 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => router.push(`/students/${s._id}`)}
                >
                  {/* Header: Name + Status + Menu */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      {s.photo ? (
                        <PrivateImage src={s.photo} alt="" className="w-10 h-10 rounded-full object-cover border shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0 border border-primary/15 uppercase">
                          {s.firstName?.[0]}{s.lastName?.[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{s.firstName} {s.lastName}</p>
                        <p className="text-xs text-muted-foreground">{s.admissionNumber}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={cn('inline-flex items-center h-6 px-2 rounded-full text-[10px] font-medium border capitalize',
                        studentStatusStyle[s.status] ?? 'text-muted-foreground border-border')}>
                        {s.status}
                      </span>
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!isTeacher && (
                              <DropdownMenuItem onClick={() => router.push(`/students/${s._id}`)}>View details</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setEditNameTarget({ _id: s._id, firstName: s.firstName, lastName: s.lastName })}>
                              Edit name
                            </DropdownMenuItem>
                            {!isTeacher && s.status === 'active' && (
                              <DropdownMenuItem className="text-destructive" onClick={() => confirm(
                                `Withdraw ${s.firstName} ${s.lastName}?`,
                                'The student will be marked as withdrawn. This can be reversed later.',
                                () => withdrawStudent({ id: s._id }),
                              )}>Withdraw</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Class</p>
                      <p className="font-medium">{cls}</p>
                    </div>
                    {guardianName && (
                      <div>
                        <p className="text-muted-foreground">Guardian</p>
                        <p className="font-medium truncate">{guardianName}</p>
                      </div>
                    )}
                    {!isTeacher && (
                      <div>
                        <p className="text-muted-foreground">Fee Balance</p>
                        <div>
                          <FeeBalance stats={feeStatsData?.[s._id] ?? null} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {(pagination?.totalPages ?? 1) > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Page {page} of {pagination.totalPages} · {totalCount} students</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Import dialog ─────────────────────────────────────────────────── */}
      {!isTeacher && (
        <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) resetImportDialog(); }}>
          <DialogContent className="max-w-sm md:max-w-md">
            <DialogHeader>
              <DialogTitle>Import Students</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Mode selector */}
              <div className="space-y-1.5">
                <Label>Import Mode</Label>
                <Select value={importMode} onValueChange={(v) => { setImportMode(v); setImportClassId(''); setImportFile(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single class</SelectItem>
                    <SelectItem value="all">All classes (multi-sheet Excel)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Class selector — only for single-class mode */}
              {importMode === 'single' && (
                <div className="space-y-1.5">
                  <Label>Class *</Label>
                  <Select value={importClassId} onValueChange={setImportClassId}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((cls) => (
                        <SelectItem key={cls._id} value={cls._id}>
                          {cls.name}{cls.stream ? ` ${cls.stream}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* File input */}
              <div className="space-y-1.5">
                <Label>File *</Label>
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls,.ods"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                />
                {importMode === 'single' ? (
                  <p className="text-xs text-muted-foreground">
                    CSV or Excel (.csv, .xlsx, .xls, .ods). Required columns:{' '}
                    <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">admissionNumber, firstName, lastName, gender</code>
                  </p>
                ) : (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Excel file (.xlsx, .xls, .ods) with one worksheet per class.</p>
                    <p>Each <strong>sheet name</strong> must exactly match a class name (e.g. <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">Grade 1</code> or <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">Grade 1 North</code>).</p>
                    <p>Required columns: <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">admissionNumber, firstName, lastName, gender</code></p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
              <Button
                disabled={importSubmitting || !importFile || (importMode === 'single' && !importClassId)}
                onClick={() => startImport()}
              >
                {importSubmitting ? 'Uploading…' : 'Start Import'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Enroll dialog ─────────────────────────────────────────────────── */}
      {!isTeacher && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowGuardian(false); }}>
          <DialogContent className="max-w-sm md:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Enroll New Student</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(createStudent)} className="space-y-4">
              {/* Student Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>First Name *</Label>
                  <Input {...register('firstName')} placeholder="John" />
                  {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Last Name *</Label>
                  <Input {...register('lastName')} placeholder="Kamau" />
                  {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
                </div>
              </div>

              {/* Admission & Assessment Numbers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Admission No. *</Label>
                  <Input {...register('admissionNumber')} placeholder="ADM/2024/001" className="font-mono" />
                  {errors.admissionNumber && <p className="text-xs text-destructive">{errors.admissionNumber.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Assessment No. <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input {...register('assessmentNumber')} placeholder="e.g. 12345678" className="font-mono" />
                </div>
              </div>

              {/* Gender & Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Gender *</Label>
                  <Select onValueChange={(v) => setValue('gender', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.gender && <p className="text-xs text-destructive">{errors.gender.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Date of Birth <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input type="date" {...register('dateOfBirth')} min={minDobDate} max={today} />
                </div>
                <div className="space-y-1.5">
                  <Label>Enrollment Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input type="date" {...register('enrollmentDate')} max={today} />
                </div>
              </div>

              {/* Birth Certificate & Class */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Birth Certificate No. <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input {...register('birthCertificateNumber')} placeholder="12345678" className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Class *</Label>
                  <Select onValueChange={(v) => setValue('classId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((cls) => (
                        <SelectItem key={cls._id} value={cls._id}>
                          {cls.name}{cls.stream ? ` ${cls.stream}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.classId && <p className="text-xs text-destructive">{errors.classId.message}</p>}
                </div>
              </div>

              {/* Guardian section */}
              <div className="border border-border rounded-md">
                <button
                  type="button"
                  onClick={() => setShowGuardian((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/40 rounded-md transition-colors"
                >
                  <span>
                    Parent / Guardian Details
                    <span className="text-muted-foreground font-normal ml-1 text-xs">(optional)</span>
                  </span>
                  {showGuardian ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>

                {showGuardian && (
                  <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                    {guardianFields.map((g, idx) => (
                      <div key={g.id} className="rounded-md border border-border p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Guardian {idx + 1}
                          </p>
                          {guardianFields.length > 1 && (
                            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={() => removeGuardian(idx)}>
                              Remove
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>First Name</Label>
                            <Input {...register(`guardians.${idx}.firstName`)} placeholder="Mary" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Last Name</Label>
                            <Input {...register(`guardians.${idx}.lastName`)} placeholder="Kamau" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Relationship</Label>
                            <Select
                              onValueChange={(v) => setValue(`guardians.${idx}.relationship`, v)}
                              defaultValue={idx === 0 ? 'mother' : 'guardian'}
                            >
                              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                {RELATIONSHIPS.map((r) => (
                                  <SelectItem key={r} value={r}>{capitalize(r)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Occupation</Label>
                            <Input {...register(`guardians.${idx}.occupation`)} placeholder="Farmer" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Phone</Label>
                            <Input {...register(`guardians.${idx}.phone`)} placeholder="0712 345 678" className="font-mono" />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Email <span className="text-muted-foreground text-xs font-normal">(sends portal invite)</span></Label>
                            <Input {...register(`guardians.${idx}.email`)} type="email" placeholder="parent@email.com" />
                            {errors.guardians?.[idx]?.email && <p className="text-xs text-destructive">{errors.guardians[idx].email.message}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button
                      type="button" variant="outline" size="sm"
                      onClick={() => appendGuardian({ relationship: 'guardian' })}
                    >
                      Add another guardian
                    </Button>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setOpen(false); setShowGuardian(false); }}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? 'Enrolling…' : 'Enroll Student'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Confirm dialog ─────────────────────────────────────────────────── */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && closeConfirm()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            {confirmDialog.description && (
              <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
            )}
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

      {/* ── Bulk transfer dialog ──────────────────────────────────────── */}
      {!isTeacher && (
        <Dialog open={bulkTransferOpen} onOpenChange={setBulkTransferOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Transfer {selectedStudentIds.size} Student{selectedStudentIds.size !== 1 ? 's' : ''}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-transfer-class">Move to Class</Label>
                <Select value={bulkTransferClassId || ''} onValueChange={setBulkTransferClassId}>
                  <SelectTrigger id="bulk-transfer-class">
                    <SelectValue placeholder="Select a class..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(classes ?? []).map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.name}{c.stream ? ` ${c.stream}` : ''} — {c.levelCategory} ({c.academicYear})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="bulk-transfer-note">Note (optional)</Label>
                <Input
                  id="bulk-transfer-note"
                  placeholder="e.g. End-of-term movement..."
                  value={bulkTransferNote}
                  onChange={(e) => setBulkTransferNote(e.target.value)}
                />
              </div>

              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{selectedStudentIds.size}</span> student{selectedStudentIds.size !== 1 ? 's' : ''} will be transferred
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkTransferOpen(false)}
                disabled={isBulkTransferring}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitBulkTransfer}
                disabled={isBulkTransferring || !bulkTransferClassId}
              >
                {isBulkTransferring ? 'Transferring…' : 'Transfer'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Edit name dialog (teachers + admins) ───────────────────────── */}
      {editNameTarget && (
        <Dialog open onOpenChange={(v) => { if (!v) setEditNameTarget(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Student Name</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input
                  defaultValue={editNameTarget.firstName}
                  onChange={(e) => setEditNameTarget((p) => ({ ...p, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input
                  defaultValue={editNameTarget.lastName}
                  onChange={(e) => setEditNameTarget((p) => ({ ...p, lastName: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditNameTarget(null)}>Cancel</Button>
              <Button
                disabled={isUpdatingName || !editNameTarget.firstName?.trim() || !editNameTarget.lastName?.trim()}
                onClick={() => updateStudentName({ id: editNameTarget._id, firstName: editNameTarget.firstName.trim(), lastName: editNameTarget.lastName.trim() })}
              >
                {isUpdatingName ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
