'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, MoreHorizontal, ClipboardList, ExternalLink, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { examsApi, classesApi, subjectsApi, getErrorMessage } from '@/lib/api';
import { capitalize, formatDate } from '@/lib/utils';
import { EXAM_TYPES, ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';

const TYPE_LABELS = { opener: 'Opener', midterm: 'Mid Term', endterm: 'End Term', sba: 'SBA' };
const TYPE_COLORS = {
  opener:  'bg-blue-50 text-blue-700 border-blue-200',
  midterm: 'bg-amber-50 text-amber-700 border-amber-200',
  endterm: 'bg-green-50 text-green-700 border-green-200',
  sba:     'bg-purple-50 text-purple-700 border-purple-200',
};

const schema = z.object({
  name:         z.string().min(1, 'Required'),
  classId:      z.string().min(1, 'Required'),
  subjectId:    z.string().min(1, 'Required'),
  type:         z.string().min(1, 'Required'),
  term:         z.string().min(1, 'Required'),
  academicYear: z.string().min(1, 'Required'),
  totalMarks:   z.coerce.number().positive(),
  examPaperUrl: z.string().url('Enter a valid URL').optional().or(z.literal('')),
});

function buildColumns(onDelete, onEnterResults) {
  return [
    {
      accessorKey: 'name',
      header: 'Exam',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">
            {typeof row.original.subjectId === 'object' ? row.original.subjectId.name : '—'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'classId',
      header: 'Class',
      cell: ({ row }) => {
        const c = row.original.classId;
        return (
          <span className="text-sm">
            {typeof c === 'object' ? `${c.name}${c.stream ? ` ${c.stream}` : ''}` : '—'}
          </span>
        );
      },
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const t = row.original.type;
        return (
          <Badge variant="outline" className={`text-xs ${TYPE_COLORS[t] ?? ''}`}>
            {TYPE_LABELS[t] ?? capitalize(t)}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'term',
      header: 'Term / Year',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.term} · {row.original.academicYear}
        </span>
      ),
    },
    {
      accessorKey: 'totalMarks',
      header: 'Marks',
      cell: ({ row }) => <span className="text-sm tabular-nums">/{row.original.totalMarks}</span>,
    },
    {
      id: 'paper',
      header: 'Paper',
      cell: ({ row }) =>
        row.original.examPaperUrl ? (
          <a href={row.original.examPaperUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <FileText className="h-3.5 w-3.5" /> View
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEnterResults(row.original._id)}>
              <ClipboardList className="h-4 w-4 mr-2" /> Enter Results
            </DropdownMenuItem>
            {row.original.examPaperUrl && (
              <DropdownMenuItem asChild>
                <a href={row.original.examPaperUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> View Exam Paper
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => { if (confirm('Delete this exam and all its results?')) onDelete(row.original._id); }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}

export default function ExamsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { academicYear: defaultAcademicYear, term: defaultTerm } = useSchoolTermDefaults(['exams', 'term-defaults']);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Filters
  const [filterClass, setFilterClass] = useState('');
  const [filterType,  setFilterType]  = useState('');
  const [filterTerm,  setFilterTerm]  = useState('');
  const [filterYear,  setFilterYear]  = useState('');

  const hasFilters = filterClass || filterType || filterTerm || filterYear;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      academicYear: defaultAcademicYear,
      term: defaultTerm,
      totalMarks: 100,
      examPaperUrl: '',
    },
  });
  const classId = watch('classId');
  const formAcademicYear = watch('academicYear');
  const formTerm = watch('term');

  useEffect(() => {
    setValue('academicYear', defaultAcademicYear);
    setValue('term', defaultTerm);
  }, [defaultAcademicYear, defaultTerm, setValue]);

  const { data, isLoading } = useQuery({
    queryKey: ['exams', page, filterClass, filterType, filterTerm, filterYear],
    queryFn: async () => {
      const res = await examsApi.list({
        page,
        limit: 20,
        classId:      filterClass || undefined,
        type:         filterType  || undefined,
        term:         filterTerm  || undefined,
        academicYear: filterYear  || undefined,
      });
      return res.data;
    },
  });

  const { data: classesData } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => { const res = await classesApi.list({ limit: 100 }); return res.data; },
  });

  const { data: subjectsData } = useQuery({
    queryKey: ['subjects', 'class', classId],
    queryFn: async () => { const res = await subjectsApi.list({ classId, limit: 100 }); return res.data; },
    enabled: !!classId,
  });

  const { mutate: createExam, isPending } = useMutation({
    mutationFn: (data) => examsApi.create({
      ...data,
      examPaperUrl: data.examPaperUrl || undefined,
    }),
    onSuccess: () => {
      toast.success('Exam created');
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      setOpen(false);
      reset({
        academicYear: defaultAcademicYear,
        term: defaultTerm,
        totalMarks: 100,
        examPaperUrl: '',
      });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: deleteExam } = useMutation({
    mutationFn: (id) => examsApi.delete(id),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['exams'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const classes = classesData?.data ?? classesData?.classes ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title="Exams" description="Configure exams and enter student results">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Create Exam
        </Button>
      </PageHeader>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterClass} onValueChange={(v) => { setFilterClass(v === '__all__' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="All classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All classes</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={(v) => { setFilterType(v === '__all__' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All types</SelectItem>
            {EXAM_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? capitalize(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTerm} onValueChange={(v) => { setFilterTerm(v === '__all__' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-28 text-xs"><SelectValue placeholder="All terms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All terms</SelectItem>
            {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterYear} onValueChange={(v) => { setFilterYear(v === '__all__' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-24 text-xs"><SelectValue placeholder="All years" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All years</SelectItem>
            {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFilterClass(''); setFilterType(''); setFilterTerm(''); setFilterYear(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={buildColumns(deleteExam, (id) => router.push(`/exams/${id}`))}
        data={data?.data}
        loading={isLoading}
        pageCount={data?.pagination?.totalPages}
        currentPage={page}
        onPageChange={setPage}
      />

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          reset({
            academicYear: defaultAcademicYear,
            term: defaultTerm,
            totalMarks: 100,
            examPaperUrl: '',
          });
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Exam</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(createExam)} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Exam Name <span className="text-destructive">*</span></Label>
              <Input {...register('name')} placeholder="e.g. End Term Mathematics" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            {/* Class + Subject */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Class <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => { setValue('classId', v, { shouldValidate: true }); setValue('subjectId', ''); }}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.classId && <p className="text-xs text-destructive">{errors.classId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Subject <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => setValue('subjectId', v, { shouldValidate: true })} disabled={!classId}>
                  <SelectTrigger><SelectValue placeholder={classId ? 'Select' : 'Pick class first'} /></SelectTrigger>
                  <SelectContent>
                    {(subjectsData?.data ?? []).map((s) => (
                      <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.subjectId && <p className="text-xs text-destructive">{errors.subjectId.message}</p>}
              </div>
            </div>

            {/* Type + Total marks */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Exam Type <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => setValue('type', v, { shouldValidate: true })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {EXAM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? capitalize(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Total Marks <span className="text-destructive">*</span></Label>
                <Input {...register('totalMarks')} type="number" min={1} />
                {errors.totalMarks && <p className="text-xs text-destructive">{errors.totalMarks.message}</p>}
              </div>
            </div>

            {/* Term + Year */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Term</Label>
                <Select value={formTerm || defaultTerm} onValueChange={(v) => setValue('term', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Academic Year</Label>
                <Select value={formAcademicYear || defaultAcademicYear} onValueChange={(v) => setValue('academicYear', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Exam paper URL */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                Exam Paper URL
                <span className="text-muted-foreground font-normal text-xs">(optional — Google Drive, Dropbox, etc.)</span>
              </Label>
              <Input
                {...register('examPaperUrl')}
                placeholder="https://drive.google.com/..."
                type="url"
              />
              {errors.examPaperUrl && <p className="text-xs text-destructive">{errors.examPaperUrl.message}</p>}
              <p className="text-xs text-muted-foreground">
                Upload the exam paper to Google Drive or Dropbox and paste the sharing link here.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setOpen(false);
                reset({
                  academicYear: defaultAcademicYear,
                  term: defaultTerm,
                  totalMarks: 100,
                  examPaperUrl: '',
                });
              }}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Creating…' : 'Create Exam'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
