'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Download, Receipt, Wallet, Printer } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  feesApi, studentsApi, classesApi, exportApi, settingsApi, schoolsApi,
  downloadBlob, getErrorMessage,
} from '@/lib/api';
import { buildDocumentHeaderHtml, getDocumentHeaderCss, getDocumentHeaderData, escapeHtml } from '@/lib/document-print';
import { formatCurrency, formatDate, getStatusColor, capitalize } from '@/lib/utils';
import { PAYMENT_METHODS, ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { getCurrentTermFromSettings } from '@/lib/school-term';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/shared/page-header';
import { RefreshButton } from '@/components/shared/refresh-button';
import { SchoolDocumentHeader } from '@/components/shared/school-document-header';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/use-debounce';

const schema = z.object({
  studentId: z.string().min(1, 'Please select a student'),
  amount: z.coerce.number().positive('Amount must be positive'),
  method: z.enum(['cash', 'mpesa', 'bank']),
  reference: z.string().optional(),
  paymentDate: z.string().optional(),
  academicYear: z.string().min(4, 'Required'),
  term: z.string().min(1, 'Required'),
  notes: z.string().optional(),
});

function ReceiptPreview({ data }) {
  const receiptRef = useRef(null);

  const handlePrint = () => {
    const header = getDocumentHeaderData({
      school: data.school || {},
      settings: data.settings || {},
      title: 'Finance',
      subtitle: 'Fee Payment Receipt',
      serial: data.receiptNumber ?? '',
      generatedAt: data.paymentDate ? formatDate(data.paymentDate) : formatDate(new Date().toISOString()),
    });
    const win = window.open('', '', 'width=700,height=950');
    win.document.write(`<!DOCTYPE html><html><head><title>Fee Receipt</title><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:Arial,sans-serif;padding:24px;color:#111;}
      ${getDocumentHeaderCss()}
      .title-bar{background:#eef2f7;text-align:center;padding:10px;border:1px solid #ccd6e0;border-top:none;font-size:13px;font-weight:700;letter-spacing:1.5px;}
      .body{border:1px solid #ccd6e0;border-top:none;padding:20px;}
      .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:13px;}
      .row:last-child{border-bottom:none;}
      .lbl{color:#555;}
      .val{font-weight:500;}
      .total{background:#fff7ed;padding:12px;border-radius:4px;margin-top:14px;display:flex;justify-content:space-between;align-items:center;}
      .total .t-label{font-size:14px;font-weight:700;}
      .total .t-amount{font-size:18px;font-weight:800;color:#d97706;}
      .footer{border:1px solid #ccd6e0;border-top:1px solid #eee;border-radius:0 0 6px 6px;padding:12px;text-align:center;font-size:11px;color:#888;}
    </style></head><body>
      ${buildDocumentHeaderHtml(header)}
      <div class="title-bar">Fee Payment Receipt</div>
      <div class="body">
        ${[
          ['Student', data.studentName],
          ['Admission No.', data.admissionNumber],
          ['Class', data.className],
          ['Academic Year', data.academicYear],
          ['Term', data.term],
          ['Payment Method', capitalize(data.method)],
          data.reference ? ['Reference / Code', data.reference] : null,
          data.notes ? ['Notes', data.notes] : null,
          ['Issued By', data.recordedBy],
        ]
          .filter(Boolean)
          .map(([label, value]) => `<div class="row"><span class="lbl">${escapeHtml(label)}</span><span class="val">${escapeHtml(value)}</span></div>`)
          .join('')}
        <div class="total">
          <span class="t-label">TOTAL PAID</span>
          <span class="t-amount">${escapeHtml(formatCurrency(data.amount))}</span>
        </div>
      </div>
      <div class="footer">This is an official receipt. Please retain for your records. Powered by Diraschool</div>
    </body></html>`);
    win.document.close();
    win.print();
    win.close();
  };

  return (
    <div>
      <div ref={receiptRef}>
        <SchoolDocumentHeader
          school={data.school}
          settings={data.settings}
          title="Finance"
          subtitle="Fee Payment Receipt"
          serial={data.receiptNumber ?? ''}
          generatedAt={data.paymentDate ? formatDate(data.paymentDate) : formatDate(new Date().toISOString())}
        />
        <div className="bg-blue-50 text-center py-2 text-xs font-bold tracking-widest border border-t-0 border-blue-200 uppercase">
          Fee Payment Receipt
        </div>
        {/* Receipt tracking info strip */}
        <div className="border border-t-0 border-b-0 px-4 py-2.5 bg-gray-50 flex items-start justify-between gap-3 text-xs">
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Receipt No.</p>
            <p className="font-bold text-sm text-blue-800 font-mono">{data.receiptNumber ?? 'Generating…'}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Date</p>
            <p className="font-semibold">{data.paymentDate ? formatDate(data.paymentDate) : formatDate(new Date().toISOString())}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 uppercase tracking-wide text-[10px]">Issued By</p>
            <p className="font-semibold">{data.recordedBy}</p>
          </div>
        </div>
        <div className="border border-t-0 px-4 py-3">
          {[
            ['Student', data.studentName],
            ['Admission No.', data.admissionNumber],
            ['Class', data.className],
            ['Academic Year', data.academicYear],
            ['Term', data.term],
            ['Payment Method', capitalize(data.method)],
            data.reference ? ['Reference / Code', data.reference] : null,
            data.notes ? ['Notes', data.notes] : null,
          ].filter(Boolean).map(([label, value]) => (
            <div key={label} className="flex justify-between py-2 border-b last:border-0 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-right max-w-[60%]">{value}</span>
            </div>
          ))}
          <div className="bg-amber-50 rounded p-3 mt-3 flex justify-between items-center">
            <span className="font-bold text-sm">TOTAL PAID</span>
            <span className="font-bold text-amber-600 text-xl">{formatCurrency(data.amount)}</span>
          </div>
        </div>
        <div className="border border-t-0 rounded-b-md p-3 text-center text-xs text-muted-foreground">
          This is an official receipt. Please retain for your records. Powered by Diraschool
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" /> Print Receipt
        </Button>
      </div>
    </div>
  );
}

const buildColumns = ({ canIssueReceipts }) => [
  {
    id: 'receiptNumber',
    header: 'Receipt No.',
    cell: ({ row }) => (
      <span className="font-mono text-xs font-semibold text-blue-700">
        {row.original.receiptNumber ?? '—'}
      </span>
    ),
  },
  {
    id: 'student',
    header: 'Student',
    cell: ({ row }) => (
      <div>
        <p className="font-medium text-sm">
          {row.original.studentId?.firstName ?? '—'} {row.original.studentId?.lastName ?? ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {row.original.studentId?.admissionNumber ?? ''} · {row.original.term} · {row.original.academicYear}
        </p>
      </div>
    ),
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    cell: ({ row }) => <span className="font-semibold">{formatCurrency(row.original.amount)}</span>,
  },
  {
    accessorKey: 'method',
    header: 'Method',
    cell: ({ row }) => <span className="capitalize text-sm">{row.original.method}</span>,
  },
  {
    accessorKey: 'reference',
    header: 'Ref / Code',
    cell: ({ row }) => <span className="text-sm font-mono">{row.original.reference ?? '—'}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getStatusColor(row.original.status)}`}>
        {row.original.status}
      </span>
    ),
  },
  {
    id: 'dateRecorder',
    header: 'Date / By',
    cell: ({ row }) => {
      const recorder = row.original.recordedByUserId;
      return (
        <div>
          <p className="text-sm">{formatDate(row.original.paymentDate ?? row.original.createdAt)}</p>
          {recorder && (
            <p className="text-xs text-muted-foreground">
              {recorder.firstName} {recorder.lastName}
            </p>
          )}
        </div>
      );
    },
  },
  {
    id: 'receipt',
    header: 'Receipt',
    cell: ({ row }) => (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-blue-600 hover:text-blue-700 h-7 px-2 disabled:text-gray-400 disabled:hover:text-gray-400"
          onClick={() => window.open(`/fees/payments/${row.original._id}/print`, '_blank')}
          disabled={!canIssueReceipts}
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
        {row.original.receiptUrl && (
          <a href={row.original.receiptUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm" className="gap-1 h-7 px-2">
              <Receipt className="h-3.5 w-3.5" /> PDF
            </Button>
          </a>
        )}
      </div>
    ),
  },
];

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canIssueReceipts = ['secretary', 'accountant', 'school_admin', 'director', 'headteacher', 'deputy_headteacher'].includes(user?.role);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [balanceStudentId, setBalanceStudentId] = useState('');
  const [balanceYear, setBalanceYear] = useState(String(new Date().getFullYear()));
  const [balanceTerm, setBalanceTerm] = useState(TERMS[0]);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [termFilter, setTermFilter] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
  });

  const { data: schoolData } = useQuery({
    queryKey: ['school', 'me'],
    queryFn: async () => {
      const res = await schoolsApi.me();
      return res.data.data ?? res.data;
    },
  });

  const defaultYear = settingsData?.currentAcademicYear ?? String(new Date().getFullYear());
  const defaultTerm = getCurrentTermFromSettings(settingsData);
  const todayIso = new Date().toISOString().split('T')[0];

  const { register, handleSubmit, reset, setValue, watch, formState: { errors }, trigger, getValues } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { academicYear: defaultYear, term: defaultTerm, paymentDate: todayIso },
  });
  const formAcademicYear = watch('academicYear');
  const formTerm = watch('term');

  // Sync defaults when settings load
  useEffect(() => {
    if (settingsData) {
      const year = settingsData.currentAcademicYear ?? String(new Date().getFullYear());
      const term = getCurrentTermFromSettings(settingsData);
      reset({ academicYear: year, term, paymentDate: todayIso });
      setBalanceYear(year);
      setBalanceTerm(term);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData]);

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, debouncedSearch, methodFilter, statusFilter, yearFilter, termFilter],
    queryFn: async () => {
      const res = await feesApi.listPayments({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        method: methodFilter || undefined,
        status: statusFilter || undefined,
        academicYear: yearFilter || undefined,
        term: termFilter || undefined,
      });
      return res.data;
    },
  });

  const { data: studentsData } = useQuery({
    queryKey: ['students', 'all'],
    queryFn: async () => {
      const res = await studentsApi.list({ limit: 500, status: 'active' });
      return res.data;
    },
  });

  const { data: classesData } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const res = await classesApi.list({ limit: 100 });
      return res.data;
    },
  });

  const { data: balanceData, isFetching: balanceFetching, refetch: fetchBalance } = useQuery({
    queryKey: ['balance', balanceStudentId, balanceYear, balanceTerm],
    queryFn: async () => {
      const res = await feesApi.getBalance({ studentId: balanceStudentId, academicYear: balanceYear, term: balanceTerm });
      return res.data.data;
    },
    enabled: false,
  });

  const { mutate: createPayment, isPending } = useMutation({
    mutationFn: (data) => feesApi.createPayment(data),
    onSuccess: () => {
      toast.success('Payment recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setOpen(false);
      setPreviewOpen(false);
      setPendingPayload(null);
      setSelectedClassId('');
      setStudentSearch('');
      reset({ academicYear: defaultYear, term: defaultTerm, paymentDate: todayIso });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const filteredStudents = useMemo(() => {
    const all = studentsData?.data ?? [];
    const byClass = selectedClassId
      ? all.filter((s) => (s.classId?._id ?? s.classId) === selectedClassId)
      : all;
    if (!studentSearch.trim()) return byClass;
    const q = studentSearch.toLowerCase();
    return byClass.filter(
      (s) =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
        s.admissionNumber?.toLowerCase().includes(q)
    );
  }, [studentsData, selectedClassId, studentSearch]);

  const buildReceiptData = (values, fromTable = null) => {
    if (fromTable) {
      return {
        studentName: `${fromTable.studentId?.firstName ?? ''} ${fromTable.studentId?.lastName ?? ''}`.trim() || '—',
        admissionNumber: fromTable.studentId?.admissionNumber ?? '—',
        className: fromTable.classId
          ? `${fromTable.classId.name}${fromTable.classId.stream ? ` ${fromTable.classId.stream}` : ''}`
          : '—',
        academicYear: fromTable.academicYear,
        term: fromTable.term,
        amount: fromTable.amount,
        method: fromTable.method,
        reference: fromTable.reference ?? '',
        paymentDate: fromTable.paymentDate ?? fromTable.createdAt,
        notes: fromTable.notes ?? '',
        recordedBy: fromTable.recordedByUserId
          ? `${fromTable.recordedByUserId.firstName} ${fromTable.recordedByUserId.lastName}`
          : '—',
        schoolName: schoolData?.name ?? '',
        school: schoolData ?? {},
        settings: settingsData ?? {},
      };
    }
    const student = (studentsData?.data ?? []).find((s) => s._id === values.studentId);
    const cls = (classesData?.data ?? []).find((c) => c._id === selectedClassId);
    return {
      studentName: student ? `${student.firstName} ${student.lastName}` : '—',
      admissionNumber: student?.admissionNumber ?? '—',
      className: cls ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—',
      academicYear: values.academicYear,
      term: values.term,
      amount: Number(values.amount),
      method: values.method,
      reference: values.reference ?? '',
      paymentDate: values.paymentDate ?? todayIso,
      notes: values.notes ?? '',
      recordedBy: user ? `${user.firstName} ${user.lastName}` : '—',
      schoolName: schoolData?.name ?? '',
      school: schoolData ?? {},
      settings: settingsData ?? {},
    };
  };

  const handlePreview = async () => {
    const valid = await trigger();
    if (!valid) return;
    const values = getValues();
    const preview = buildReceiptData(values);
    const payload = {
      studentId: values.studentId,
      amount: Number(values.amount),
      method: values.method,
      reference: values.reference || undefined,
      paymentDate: values.paymentDate || undefined,
      academicYear: values.academicYear,
      term: values.term,
      notes: values.notes || undefined,
    };
    setPendingPayload(payload);
    setPreviewData(preview);
    setPreviewOpen(true);
  };

  const handleCloseForm = () => {
    setOpen(false);
    setSelectedClassId('');
    setStudentSearch('');
    reset({ academicYear: defaultYear, term: defaultTerm, paymentDate: todayIso });
  };

  return (
    <div>
      <PageHeader title="Payments" description="Record and manage fee payments">
        <RefreshButton queryKeys={[['payments']]} />
        <Button variant="outline" size="sm" onClick={() => setBalanceOpen(true)}>
          <Wallet className="h-4 w-4 mr-1" /> Check Balance
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try { downloadBlob(await exportApi.payments(), 'payments.csv'); }
            catch { toast.error('Export failed'); }
          }}
        >
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Record Payment
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-9"
          />
        </div>
        <Select value={methodFilter} onValueChange={(v) => { setMethodFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{capitalize(m)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={termFilter} onValueChange={(v) => { setTermFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[110px]"><SelectValue placeholder="Term" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All terms</SelectItem>
            {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || methodFilter || yearFilter || termFilter) && (
          <Button variant="ghost" size="sm" className="h-9"
            onClick={() => { setSearch(''); setMethodFilter(''); setYearFilter(''); setTermFilter(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={buildColumns({ canIssueReceipts })}
        data={data?.data}
        loading={isLoading}
        pageCount={data?.pagination?.totalPages}
        currentPage={page}
        onPageChange={setPage}
      />

      {/* Record Payment Dialog */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleCloseForm(); else setOpen(true); }}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form
            onSubmit={handleSubmit((values) =>
              createPayment({
                studentId: values.studentId,
                amount: Number(values.amount),
                method: values.method,
                reference: values.reference || undefined,
                paymentDate: values.paymentDate || undefined,
                academicYear: values.academicYear,
                term: values.term,
                notes: values.notes || undefined,
              })
            )}
            className="space-y-4"
          >
            {/* 1. Class */}
            <div className="space-y-1.5">
              <Label>Class</Label>
              <Select
                value={selectedClassId}
                onValueChange={(v) => {
                  setSelectedClassId(v);
                  setValue('studentId', '');
                  setStudentSearch('');
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select class to filter students" /></SelectTrigger>
                <SelectContent>
                  {classesData?.data?.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}{c.stream ? ` ${c.stream}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Student with search */}
            <div className="space-y-1.5">
              <Label>Student</Label>
              <Input
                placeholder="Search by name or admission number…"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
              <Select onValueChange={(v) => setValue('studentId', v)} disabled={!selectedClassId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      selectedClassId
                        ? filteredStudents.length
                          ? `${filteredStudents.length} student(s) — select one`
                          : 'No matching students'
                        : 'Select a class first'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredStudents.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">No students found</div>
                  ) : (
                    filteredStudents.map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.firstName} {s.lastName} — {s.admissionNumber}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {errors.studentId && <p className="text-xs text-destructive">{errors.studentId.message}</p>}
            </div>

            {/* 3. Method + Amount */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select onValueChange={(v) => setValue('method', v)}>
                  <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{capitalize(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.method && <p className="text-xs text-destructive">{errors.method.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Amount (KES)</Label>
                <Input {...register('amount')} type="number" placeholder="5000" />
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              </div>
            </div>

            {/* 4. Reference + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Transaction Reference</Label>
                <Input {...register('reference')} placeholder="M-Pesa code, slip no." />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Date</Label>
                <Input {...register('paymentDate')} type="date" />
              </div>
            </div>

            {/* 5. Year + Term */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Academic Year</Label>
                <Select value={formAcademicYear || defaultYear} onValueChange={(v) => setValue('academicYear', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Term</Label>
                <Select value={formTerm || defaultTerm} onValueChange={(v) => setValue('term', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 6. Notes */}
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea {...register('notes')} placeholder="Any additional information…" rows={2} />
            </div>

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={handleCloseForm}>Cancel</Button>
              <Button type="button" variant="outline" onClick={handlePreview} disabled={isPending}>
                <Receipt className="h-4 w-4 mr-1" /> Preview Receipt
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Receipt Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Receipt Preview</DialogTitle></DialogHeader>
          {previewData && <ReceiptPreview data={previewData} />}
          {pendingPayload && (
            <DialogFooter className="mt-2">
              <Button variant="outline" onClick={() => setPreviewOpen(false)}>Back to Form</Button>
              <Button onClick={() => createPayment(pendingPayload)} disabled={isPending}>
                {isPending ? 'Saving…' : 'Save Payment'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Check Balance Dialog */}
      <Dialog open={balanceOpen} onOpenChange={setBalanceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Check Fee Balance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Student</Label>
              <Select value={balanceStudentId} onValueChange={setBalanceStudentId}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {studentsData?.data?.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.firstName} {s.lastName} — {s.admissionNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Select value={balanceYear} onValueChange={setBalanceYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Term</Label>
                <Select value={balanceTerm} onValueChange={setBalanceTerm}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!balanceStudentId || balanceFetching}
              onClick={() => fetchBalance()}
            >
              {balanceFetching ? 'Loading…' : 'Fetch Balance'}
            </Button>
            {balanceData && (
              <div className="rounded-lg border p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expected fee</span>
                  <span className="font-medium">{formatCurrency(balanceData.feeStructure?.totalAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total paid</span>
                  <span className="font-medium text-green-600">{formatCurrency(balanceData.totalPaid)}</span>
                </div>
                <div className="flex justify-between border-t pt-1.5">
                  <span className="font-semibold">Outstanding</span>
                  <span className={`font-bold ${balanceData.outstanding > 0 ? 'text-destructive' : 'text-green-600'}`}>
                    {balanceData.outstanding > 0 ? formatCurrency(balanceData.outstanding) : 'Fully paid'}
                  </span>
                </div>
                {balanceData.overpaid > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Overpaid</span>
                    <span className="font-medium">{formatCurrency(balanceData.overpaid)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBalanceOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
