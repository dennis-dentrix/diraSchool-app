'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, Download, Wallet, Printer, Receipt, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  feesApi, exportApi, settingsApi, schoolsApi,
  downloadBlob, getErrorMessage,
} from '@/lib/api';
import { useClasses, useAllStudents } from '@/hooks/use-app-queries';
import { formatCurrency, formatDate, capitalize } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PAYMENT_METHODS, ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { getCurrentTermFromSettings } from '@/lib/school-term';
import { useAuth } from '@/hooks/use-auth';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/shared/page-header';
import { RefreshButton } from '@/components/shared/refresh-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

const METHODS = ['cash', 'mpesa', 'bank', 'cheque'];

const schema = z.object({
  studentId:    z.string().min(1, 'Please select a student'),
  amount:       z.coerce.number().positive('Amount must be positive'),
  method:       z.enum(['cash', 'mpesa', 'bank', 'cheque']),
  paymentType:  z.enum(['fees', 'other']).default('fees'),
  feeItemName:  z.string().optional(),
  reference:    z.string().optional(),
  paymentDate:  z.string().optional(),
  academicYear: z.string().min(4, 'Required'),
  term:         z.string().min(1, 'Required'),
  notes:        z.string().optional(),
});

// ── Method pill ───────────────────────────────────────────────────────────────
const METHOD_CLS = {
  mpesa:  'border-ok/30 text-ok bg-ok/5',
  bank:   'border-primary/30 text-primary bg-primary/5',
  cash:   'border-border text-foreground',
  cheque: 'border-muted-foreground/30 text-muted-foreground',
};
function MethodPill({ method }) {
  const m = (method ?? '').toLowerCase();
  const label = m === 'mpesa' ? 'M-Pesa' : m ? m[0].toUpperCase() + m.slice(1) : 'Cash';
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium', METHOD_CLS[m] ?? METHOD_CLS.cash)}>
      {label}
    </span>
  );
}

// ── Ledger totals strip ───────────────────────────────────────────────────────
function TotalsStrip({ payments, loading }) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const all = Array.isArray(payments) ? payments : [];

  const todayItems = all.filter((p) => String(p.paymentDate ?? p.createdAt ?? '').slice(0, 10) === today);
  const weekItems  = all.filter((p) => String(p.paymentDate ?? p.createdAt ?? '').slice(0, 10) >= weekAgo);

  const stats = [
    { label: "Today's count", value: loading ? '—' : String(todayItems.length) },
    { label: "Today's KES",   value: loading ? '—' : formatCurrency(todayItems.reduce((s, p) => s + (p.amount ?? 0), 0)) },
    { label: 'Week to date',  value: loading ? '—' : formatCurrency(weekItems.reduce((s, p) => s + (p.amount ?? 0), 0)) },
  ];

  // Itemize by payment type for all payments
  const feesTotal = all.filter((p) => p.paymentType === 'fees').reduce((s, p) => s + (p.amount ?? 0), 0);
  const otherByType = {};
  all.filter((p) => p.paymentType === 'other').forEach((p) => {
    const type = p.feeItemName || 'Other';
    otherByType[type] = (otherByType[type] ?? 0) + (p.amount ?? 0);
  });

  return (
    <div className="space-y-4 mb-4">
      {/* Daily and weekly totals */}
      <div className="grid grid-cols-3 gap-px rounded-lg border bg-border overflow-hidden">
        {stats.map((s) => (
          <div key={s.label} className="bg-card px-3 py-3 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 leading-tight">{s.label}</p>
            <p className="font-mono text-sm sm:text-base font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Itemized breakdown */}
      {!loading && all.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Payment Breakdown</p>
          </div>
          <div className="divide-y">
            {feesTotal > 0 && (
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm text-foreground">School Fees</span>
                <span className="font-mono font-semibold text-sm tabular-nums">{formatCurrency(feesTotal)}</span>
              </div>
            )}
            {Object.entries(otherByType).map(([type, amount]) => (
              <div key={type} className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm text-foreground capitalize">{type}</span>
                <span className="font-mono font-semibold text-sm tabular-nums">{formatCurrency(amount)}</span>
              </div>
            ))}
            {all.length > 0 && (
              <div className="flex justify-between items-center px-4 py-2.5 bg-muted/20 font-medium">
                <span className="text-sm">Total</span>
                <span className="font-mono font-semibold text-sm tabular-nums">{formatCurrency(all.reduce((s, p) => s + (p.amount ?? 0), 0))}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Receipt preview ───────────────────────────────────────────────────────────
function ReceiptPreview({ data }) {
  const rows = [
    ['Date', data.paymentDate ? formatDate(data.paymentDate) : formatDate(new Date().toISOString())],
    ['Student', data.studentName],
    ['Admission No.', data.admissionNumber],
    ['Class', data.className],
    ['Academic Year', data.academicYear],
    ['Term', data.term],
    ['Payment For', data.paymentType === 'other' && data.feeItemName ? data.feeItemName : 'School Fees'],
    ['Payment Method', capitalize(data.method)],
    data.reference ? ['Reference / Code', data.reference] : null,
    ['Issued By', data.recordedBy],
    data.notes ? ['Notes', data.notes] : null,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-start justify-between gap-3 bg-muted/40 px-4 py-3 border-b">
        <p className="text-xs font-bold uppercase tracking-wider">{data.paymentType === 'other' ? 'Payment Receipt' : 'Fee Payment Receipt'}</p>
        <div className="text-right">
          <p className="text-[10px] uppercase text-muted-foreground">Receipt No.</p>
          <p className="font-mono text-sm font-semibold">{data.receiptNumber ?? 'Pending'}</p>
        </div>
      </div>
      <div className="divide-y">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between px-4 py-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-right max-w-[55%]">{value}</span>
          </div>
        ))}
      </div>
      <div className="border-t-2 border-foreground px-4 py-3 flex justify-between items-center">
        <span className="font-bold text-sm uppercase tracking-wide">Total Paid</span>
        <span className="font-mono font-bold text-2xl tabular-nums">{formatCurrency(data.amount)}</span>
      </div>
    </div>
  );
}

// ── Record Payment side panel (3-step flow) ──────────────────────────────────
function RecordPaymentPanel({ open, onClose, settingsData, schoolData, studentsData, classesData, user, onSuccess }) {
  const [step, setStep]             = useState(1);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [studentSearch, setStudentSearch]     = useState('');
  const [pendingPayload, setPendingPayload]   = useState(null);
  const [previewData, setPreviewData]         = useState(null);

  const defaultYear = settingsData?.currentAcademicYear ?? String(new Date().getFullYear());
  const defaultTerm = getCurrentTermFromSettings(settingsData);
  const todayIso    = new Date().toISOString().split('T')[0];

  const { register, handleSubmit, reset, setValue, watch, formState: { errors }, trigger, getValues } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { academicYear: defaultYear, term: defaultTerm, paymentDate: todayIso, method: 'cash', paymentType: 'fees' },
  });
  const method          = watch('method');
  const formAcademicYear= watch('academicYear');
  const formTerm        = watch('term');
  const amountVal       = watch('amount');
  const paymentType     = watch('paymentType');

  useEffect(() => {
    if (settingsData) {
      setValue('academicYear', settingsData.currentAcademicYear ?? String(new Date().getFullYear()));
      setValue('term', getCurrentTermFromSettings(settingsData));
    }
  }, [settingsData, setValue]);

  const { mutate: createPayment, isPending } = useMutation({
    mutationFn: (data) => feesApi.createPayment(data),
    onSuccess: () => {
      toast.success('Payment recorded');
      onSuccess?.();
      handleClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleClose = () => {
    setStep(1);
    setSelectedClassId('');
    setStudentSearch('');
    setPendingPayload(null);
    setPreviewData(null);
    reset({ academicYear: defaultYear, term: defaultTerm, paymentDate: todayIso, method: 'cash', paymentType: 'fees' });
    onClose();
  };

  const filteredStudents = useMemo(() => {
    const all = studentsData ?? [];
    const byClass = selectedClassId
      ? all.filter((s) => (s.classId?._id ?? s.classId) === selectedClassId)
      : all;
    if (!studentSearch.trim()) return byClass;
    const q = studentSearch.toLowerCase();
    return byClass.filter(
      (s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.admissionNumber?.toLowerCase().includes(q)
    );
  }, [studentsData, selectedClassId, studentSearch]);

  const goToStep2 = async () => {
    const valid = await trigger(['studentId']);
    if (valid) setStep(2);
  };

  const goToStep3 = async () => {
    const valid = await trigger(['amount', 'method']);
    if (!valid) return;
    const values   = getValues();
    const student  = (studentsData ?? []).find((s) => s._id === values.studentId);
    // Use student's actual class, not the filter class
    const cls      = (classesData ?? []).find((c) => c._id === (student?.classId?._id ?? student?.classId));
    const payload  = {
      studentId:    values.studentId,
      amount:       Number(values.amount),
      method:       values.method,
      paymentType:  values.paymentType || 'fees',
      feeItemName:  values.paymentType === 'other' ? (values.feeItemName || undefined) : undefined,
      reference:    values.reference || undefined,
      paymentDate:  values.paymentDate || undefined,
      academicYear: values.academicYear,
      term:         values.term,
      notes:        values.notes || undefined,
    };
    setPendingPayload(payload);
    setPreviewData({
      studentName:    student ? `${student.firstName} ${student.lastName}` : '—',
      admissionNumber:student?.admissionNumber ?? '—',
      className:      cls ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—',
      academicYear:   values.academicYear,
      term:           values.term,
      amount:         Number(values.amount),
      method:         values.method,
      paymentType:    values.paymentType || 'fees',
      feeItemName:    values.feeItemName || '',
      reference:      values.reference ?? '',
      paymentDate:    values.paymentDate ?? todayIso,
      notes:          values.notes ?? '',
      recordedBy:     user ? `${user.firstName} ${user.lastName}` : '—',
    });
    setStep(3);
  };

  const classes = classesData ?? [];
  const selectedStudent = (studentsData ?? []).find((s) => s._id === watch('studentId'));

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[420px] p-0 flex flex-col border-l border-border"
      >
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-semibold">Record Payment</SheetTitle>
          </div>
          {/* Step indicators */}
          <div className="flex gap-1 mt-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  s <= step ? 'bg-foreground' : 'bg-muted',
                )}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span className={step >= 1 ? 'text-foreground font-medium' : ''}>Student</span>
            <span className={step >= 2 ? 'text-foreground font-medium' : ''}>Payment</span>
            <span className={step >= 3 ? 'text-foreground font-medium' : ''}>Review</span>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Step 1: Student picker */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Class</Label>
                <Select
                  value={selectedClassId}
                  onValueChange={(v) => { setSelectedClassId(v); setValue('studentId', ''); setStudentSearch(''); }}
                >
                  <SelectTrigger><SelectValue placeholder="Filter by class (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All classes</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Search student</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Name or admission number…"
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Select student</Label>
                <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto divide-y">
                  {filteredStudents.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No students found</p>
                  ) : filteredStudents.slice(0, 50).map((s) => {
                    const isSelected = watch('studentId') === s._id;
                    return (
                      <button
                        key={s._id}
                        type="button"
                        onClick={() => setValue('studentId', s._id)}
                        className={cn(
                          'w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors',
                          isSelected ? 'bg-primary/8 text-primary' : 'hover:bg-muted/40',
                        )}
                      >
                        <div>
                          <p className="text-sm font-medium">{s.firstName} {s.lastName}</p>
                          <p className="font-mono text-[11px] text-muted-foreground tabular-nums">{s.admissionNumber}</p>
                        </div>
                        {isSelected && <ChevronRight className="h-4 w-4 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {errors.studentId && <p className="text-xs text-destructive">{errors.studentId.message}</p>}
              </div>
            </div>
          )}

          {/* Step 2: Payment details */}
          {step === 2 && (
            <div className="space-y-4">
              {selectedStudent && (
                <div className="rounded-lg bg-muted/40 border px-4 py-3">
                  <p className="text-sm font-medium">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                  <p className="font-mono text-xs text-muted-foreground tabular-nums">{selectedStudent.admissionNumber}</p>
                </div>
              )}

              {/* Method segmented control */}
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setValue('method', m)}
                      className={cn(
                        'py-2 text-xs rounded-md border transition-colors font-medium',
                        method === m
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
                      )}
                    >
                      {m === 'mpesa' ? 'M-Pesa' : m[0].toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
                {errors.method && <p className="text-xs text-destructive">{errors.method.message}</p>}
              </div>

              {/* Payment type */}
              <div className="space-y-1.5">
                <Label>Payment Type</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[{ value: 'fees', label: 'School Fees' }, { value: 'other', label: 'Other' }].map((pt) => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => setValue('paymentType', pt.value)}
                      className={cn(
                        'py-2 text-xs rounded-md border transition-colors font-medium',
                        paymentType === pt.value
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
                      )}
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fee item name (only for 'other' type) */}
              {paymentType === 'other' && (
                <div className="space-y-1.5">
                  <Label>Fee Item <span className="text-muted-foreground text-xs">(e.g. Transport, Lunch)</span></Label>
                  <Input {...register('feeItemName')} placeholder="Describe what this payment is for" />
                </div>
              )}

              {/* Amount (large mono) */}
              <div className="space-y-1.5">
                <Label>Amount (KES)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">KES</span>
                  <Input
                    {...register('amount')}
                    type="number"
                    placeholder="0"
                    className="pl-12 font-mono text-2xl h-14 tabular-nums"
                  />
                </div>
                {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <Label>Reference <span className="text-muted-foreground text-xs">(M-Pesa code, slip no.)</span></Label>
                <Input {...register('reference')} placeholder="e.g. QGK7XXXXXXX" className="font-mono" />
              </div>

              {/* Date + Year + Term */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Payment Date</Label>
                  <Input {...register('paymentDate')} type="date" />
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
                <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea {...register('notes')} placeholder="Any additional notes…" rows={2} />
              </div>
            </div>
          )}

          {/* Step 3: Receipt preview + confirm */}
          {step === 3 && previewData && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Review before submitting:</p>
              <ReceiptPreview data={previewData} />
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t shrink-0 flex gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="flex-1">
              Back
            </Button>
          )}
          {step === 1 && (
            <Button onClick={goToStep2} className="flex-1" disabled={!watch('studentId')}>
              Next: Payment <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={goToStep3} className="flex-1">
              Preview Receipt <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 3 && (
            <Button
              onClick={() => pendingPayload && createPayment(pendingPayload)}
              disabled={isPending}
              className="flex-1"
            >
              {isPending ? 'Saving…' : 'Confirm & Save'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Check Balance dialog ──────────────────────────────────────────────────────
function BalanceDialog({ open, onClose, studentsData, settingsData }) {
  const [studentId, setStudentId] = useState('');
  const [year, setYear]           = useState(String(new Date().getFullYear()));
  const [term, setTerm]           = useState(TERMS[0]);

  const { data: balanceData, isFetching, refetch } = useQuery({
    queryKey: ['balance', studentId, year, term],
    queryFn: async () => {
      const res = await feesApi.getBalance({ studentId, academicYear: year, term });
      return res.data.data;
    },
    enabled: false,
  });

  const students = studentsData ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Check Fee Balance</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Student</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
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
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Term</Label>
              <Select value={term} onValueChange={setTerm}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" disabled={!studentId || isFetching} onClick={() => refetch()}>
            {isFetching ? 'Loading…' : 'Fetch Balance'}
          </Button>
          {balanceData && (
            <div className="rounded-lg border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expected fee</span>
                <span className="font-mono font-medium tabular-nums">{formatCurrency(balanceData.feeStructure?.totalAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total paid</span>
                <span className="font-mono font-medium text-ok tabular-nums">{formatCurrency(balanceData.totalPaid)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <span className="font-semibold">Outstanding</span>
                <span className={cn('font-mono font-bold tabular-nums', balanceData.outstanding > 0 ? 'text-bad' : 'text-ok')}>
                  {balanceData.outstanding > 0 ? formatCurrency(balanceData.outstanding) : 'Fully paid'}
                </span>
              </div>
              {balanceData.overpaid > 0 && (
                <div className="flex justify-between text-primary">
                  <span>Overpaid</span>
                  <span className="font-mono font-medium tabular-nums">{formatCurrency(balanceData.overpaid)}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cls = status === 'completed' ? 'text-ok border-ok/30 bg-ok/5'
    : status === 'reversed' ? 'text-bad border-bad/30 bg-bad/5'
    : status === 'pending'  ? 'text-warn border-warn/30 bg-warn/5'
    : 'border-border text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium', cls)}>
      {status ?? '—'}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const { user }    = useAuth();
  const canIssueReceipts = ['secretary', 'accountant', 'school_admin', 'director', 'headteacher', 'deputy_headteacher'].includes(user?.role);

  const [page, setPage]               = useState(1);
  const [panelOpen, setPanelOpen]     = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [search, setSearch]           = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter]   = useState('');
  const [termFilter, setTermFilter]   = useState('');
  const [dateFilter, setDateFilter]   = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('');
  const [feeItemFilter, setFeeItemFilter] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  // Compute date range from dateFilter preset
  const dateRange = useMemo(() => {
    const today = new Date();
    const toIso = (d) => d.toISOString().slice(0, 10);
    if (dateFilter === 'today') return { from: toIso(today), to: toIso(today) };
    if (dateFilter === 'week') {
      const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
      return { from: toIso(mon), to: toIso(today) };
    }
    if (dateFilter === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toIso(first), to: toIso(today) };
    }
    return {};
  }, [dateFilter]);

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => { const res = await settingsApi.get(); return res.data?.settings ?? res.data?.data ?? res.data; },
  });
  const { data: schoolData } = useQuery({
    queryKey: ['school', 'me'],
    queryFn: async () => { const res = await schoolsApi.me(); return res.data.data ?? res.data; },
  });
  const { data: studentsData } = useAllStudents();
  const { data: classesData  } = useClasses();

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, debouncedSearch, methodFilter, statusFilter, yearFilter, termFilter, dateFilter, paymentTypeFilter, feeItemFilter],
    queryFn: async () => {
      const res = await feesApi.listPayments({
        page, limit: 25,
        search: debouncedSearch || undefined,
        method: methodFilter || undefined,
        status: statusFilter || undefined,
        academicYear: yearFilter || undefined,
        term: termFilter || undefined,
        paymentType: paymentTypeFilter || undefined,
        dateFrom: dateRange.from || undefined,
        dateTo: dateRange.to || undefined,
      });
      return res.data;
    },
  });

  const allPayments = data?.data ?? [];
  const pagination  = data?.pagination ?? {};
  const hasFilters  = search || methodFilter || statusFilter || yearFilter || termFilter || dateFilter || paymentTypeFilter || feeItemFilter;

  // Apply client-side filtering for fee item name
  const payments = useMemo(() => {
    if (!feeItemFilter) return allPayments;
    return allPayments.filter((p) => p.feeItemName === feeItemFilter);
  }, [allPayments, feeItemFilter]);

  // Extract unique fee item names from all payments (for filtering)
  const uniqueFeeItems = useMemo(() => {
    const items = new Set();
    allPayments.forEach((p) => {
      if (p.paymentType === 'other' && p.feeItemName) {
        items.add(p.feeItemName);
      }
    });
    return Array.from(items).sort();
  }, [allPayments]);

  return (
    <div>
      <PageHeader title="Payments" description="Record and manage fee payments">
        <RefreshButton queryKeys={[['payments']]} />
        <Button variant="outline" size="sm" onClick={() => setBalanceOpen(true)}>
          <Wallet className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Check Balance</span>
        </Button>
        <Button
          variant="outline" size="sm"
          onClick={async () => {
            try { downloadBlob(await exportApi.payments(), 'payments.csv'); }
            catch { toast.error('Export failed'); }
          }}
        >
          <Download className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Export CSV</span>
        </Button>
        <Button size="sm" onClick={() => setPanelOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Record Payment
        </Button>
      </PageHeader>

      {/* Running-totals strip */}
      <div className="grid grid-cols-3 gap-px rounded-lg border bg-border overflow-hidden mb-6">
        {[
          { label: "Today's count", value: isLoading ? '—' : String(payments.length) },
          { label: "Today's KES", value: isLoading ? '—' : formatCurrency(payments.filter((p) => String(p.paymentDate ?? p.createdAt ?? '').slice(0, 10) === new Date().toISOString().slice(0, 10)).reduce((s, p) => s + (p.amount ?? 0), 0)) },
          { label: 'Week to date', value: isLoading ? '—' : formatCurrency(payments.filter((p) => String(p.paymentDate ?? p.createdAt ?? '').slice(0, 10) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)).reduce((s, p) => s + (p.amount ?? 0), 0)) },
        ].map((s) => (
          <div key={s.label} className="bg-card px-3 py-3 sm:px-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 leading-tight">{s.label}</p>
            <p className="font-mono text-sm sm:text-base font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters - Clean organized layout */}
      <div className="space-y-3 mb-6">
        {/* Search bar */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search reference or student…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10 h-9 text-sm"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="flex flex-wrap gap-2">
          <Select value={paymentTypeFilter} onValueChange={(v) => { setPaymentTypeFilter(v === 'all' ? '' : v); setFeeItemFilter(''); setPage(1); }}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Payment Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="fees">School Fees</SelectItem>
              <SelectItem value="other">Other Fees</SelectItem>
            </SelectContent>
          </Select>

          {paymentTypeFilter === 'other' && uniqueFeeItems.length > 0 && (
            <Select value={feeItemFilter} onValueChange={(v) => { setFeeItemFilter(v === 'all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Fee Item" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                {uniqueFeeItems.map((item) => (
                  <SelectItem key={item} value={item}>{capitalize(item)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={methodFilter} onValueChange={(v) => { setMethodFilter(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{capitalize(m)}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[110px]"><SelectValue placeholder="Year" /></SelectTrigger>
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

          <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v === 'all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="Date" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-9 px-3 text-muted-foreground hover:text-foreground"
              onClick={() => { setSearch(''); setMethodFilter(''); setStatusFilter(''); setYearFilter(''); setTermFilter(''); setDateFilter(''); setPaymentTypeFilter(''); setFeeItemFilter(''); setPage(1); }}>
              ✕ Clear
            </Button>
          )}
        </div>
      </div>

      {/* Hairline table */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {['Date / Time', 'Student', 'Class', 'Method', 'Amount', 'Reference', 'Status', ''].map((h) => (
                  <th key={h} className="py-2.5 px-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap first:pl-4 last:pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5 first:pl-4 last:pr-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-muted-foreground text-sm">
                    {hasFilters ? 'No payments match your filters.' : 'No payments recorded yet.'}
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const student  = p.studentId;
                  const cls      = p.classId ? `${p.classId.name}${p.classId.stream ? ` ${p.classId.stream}` : ''}` : '—';
                  const dateTime = p.paymentDate ?? p.createdAt;
                  return (
                    <tr key={p._id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5 pl-4 whitespace-nowrap">
                        <p className="text-sm tabular-nums">{dateTime ? formatDate(dateTime) : '—'}</p>
                        <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                          {dateTime ? new Date(dateTime).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium leading-tight">{student?.firstName ?? '—'} {student?.lastName ?? ''}</p>
                        <p className="font-mono text-[11px] text-muted-foreground tabular-nums">{student?.admissionNumber ?? ''}</p>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{cls}</td>
                      <td className="px-3 py-2.5"><MethodPill method={p.method} /></td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="font-mono text-sm font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        {p.paymentType === 'other' && p.feeItemName && (
                          <p className="text-xs font-medium text-foreground leading-tight">{p.feeItemName}</p>
                        )}
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{p.reference ?? '—'}</span>
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                      <td className="px-3 py-2.5 pr-4 text-right whitespace-nowrap">
                        {canIssueReceipts && (
                          <button
                            onClick={() => window.open(`/fees/payments/${p._id}/print`, '_blank')}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Printer className="h-3 w-3" /> Receipt
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
            <span>
              Page {pagination.currentPage ?? page} of {pagination.totalPages}
              {pagination.totalCount ? ` · ${pagination.totalCount} payments` : ''}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      <RecordPaymentPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        settingsData={settingsData}
        schoolData={schoolData}
        studentsData={studentsData}
        classesData={classesData}
        user={user}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['payments'] })}
      />

      {/* Balance dialog */}
      <BalanceDialog
        open={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        studentsData={studentsData}
        settingsData={settingsData}
      />
    </div>
  );
}
