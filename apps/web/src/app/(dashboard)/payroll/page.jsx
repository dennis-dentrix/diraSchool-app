'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, CheckCircle2, Wallet, Receipt, Loader2, AlertTriangle, Printer,
} from 'lucide-react';
import { payrollApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader } from '@/components/shared/page-header';
import { RefreshButton } from '@/components/shared/refresh-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const APPROVE_ROLES = ['school_admin', 'director', 'headteacher'];
const MONTH_NAMES   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const STATUS_MAP = {
  draft:    { label: 'Draft',    cls: 'border-warn/30 text-warn' },
  approved: { label: 'Approved', cls: 'border-primary/30 text-primary' },
  paid:     { label: 'Paid',     cls: 'border-ok/30 text-ok' },
};

function StatusPill({ status }) {
  const cfg = STATUS_MAP[status] ?? STATUS_MAP.draft;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0 text-[10px] font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ── Salary Grades Tab (unchanged data flow, cleaner layout) ───────────────────

function emptyGrade() {
  return { name: '', basicSalary: '', houseAllowance: '', transportAllowance: '', medicalAllowance: '', otherAllowances: '' };
}

function GradesTab() {
  const queryClient = useQueryClient();
  const [dialogOpen,    setDialogOpen]    = useState(false);
  const [editing,       setEditing]       = useState(null);
  const [form,          setForm]          = useState(emptyGrade());
  const [deleteTarget,  setDeleteTarget]  = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-grades'],
    queryFn: async () => { const r = await payrollApi.listGrades(); return r.data?.salaryGrades ?? []; },
  });

  const invalidate   = () => queryClient.invalidateQueries({ queryKey: ['payroll-grades'] });
  const closeDialog  = () => { setDialogOpen(false); setEditing(null); };
  const openCreate   = () => { setEditing(null); setForm(emptyGrade()); setDialogOpen(true); };
  const openEdit     = (g)  => {
    setEditing(g);
    setForm({ name: g.name, basicSalary: g.basicSalary, houseAllowance: g.houseAllowance, transportAllowance: g.transportAllowance, medicalAllowance: g.medicalAllowance, otherAllowances: g.otherAllowances });
    setDialogOpen(true);
  };

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: (vals) => editing ? payrollApi.updateGrade(editing._id, vals) : payrollApi.createGrade(vals),
    onSuccess:  () => { toast.success(editing ? 'Grade updated' : 'Grade created'); invalidate(); closeDialog(); },
    onError:    (err) => showApiError(err),
  });

  const { mutate: remove, isPending: deleting } = useMutation({
    mutationFn: (id) => payrollApi.deleteGrade(id),
    onSuccess:  () => { toast.success('Grade deleted'); invalidate(); setDeleteTarget(null); },
    onError:    (err) => showApiError(err),
  });

  const handleSave = () => {
    const vals = {
      name: form.name.trim(),
      basicSalary: Number(form.basicSalary) || 0,
      houseAllowance: Number(form.houseAllowance) || 0,
      transportAllowance: Number(form.transportAllowance) || 0,
      medicalAllowance: Number(form.medicalAllowance) || 0,
      otherAllowances: Number(form.otherAllowances) || 0,
    };
    if (!vals.name) return toast.error('Grade name is required');
    save(vals);
  };

  const f      = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const grades = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> New Grade</Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border bg-card divide-y">
          {[...Array(3)].map((_, i) => <div key={i} className="px-4 py-3"><Skeleton className="h-12 w-full" /></div>)}
        </div>
      ) : grades.length === 0 ? (
        <div className="rounded-lg border bg-card py-14 text-center text-muted-foreground">
          <Wallet className="h-7 w-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No salary grades yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[320px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="py-2 px-4 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Grade</th>
                <th className="py-2 px-4 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Basic</th>
                <th className="py-2 px-4 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Gross</th>
                <th className="py-2 px-4 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {grades.map((g) => {
                const gross = g.basicSalary + g.houseAllowance + g.transportAllowance + g.medicalAllowance + g.otherAllowances;
                return (
                  <tr key={g._id} className="hover:bg-muted/20">
                    <td className="py-2.5 px-4 font-medium">{g.name}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatCurrency(g.basicSalary)}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums hidden sm:table-cell">{formatCurrency(gross)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(g)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-bad hover:text-bad" onClick={() => setDeleteTarget(g)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Salary Grade' : 'New Salary Grade'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Grade Name</Label>
              <Input value={form.name} onChange={f('name')} placeholder="e.g. Grade 5 / Senior Teacher" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { k: 'basicSalary',         label: 'Basic Salary' },
                { k: 'houseAllowance',      label: 'House Allowance' },
                { k: 'transportAllowance',  label: 'Transport' },
                { k: 'medicalAllowance',    label: 'Medical' },
                { k: 'otherAllowances',     label: 'Other Allowances', span: true },
              ].map(({ k, label, span }) => (
                <div key={k} className={cn('space-y-1.5', span && 'col-span-2')}>
                  <Label>{label}</Label>
                  <Input type="number" min="0" value={form[k]} onChange={f(k)} placeholder="0" />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Save Changes' : 'Create Grade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Salary Grade</DialogTitle>
            <DialogDescription>This will permanently remove <strong>{deleteTarget?.name}</strong>. Existing payroll runs will not be affected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => remove(deleteTarget._id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Payslip Side Panel ────────────────────────────────────────────────────────

function PayslipPanel({ payslip, open, onClose }) {
  if (!payslip) return null;
  const staff = payslip.staffId;
  const name  = staff ? `${staff.firstName ?? ''} ${staff.lastName ?? ''}`.trim() : '—';
  const rows  = [
    ['Basic salary',   payslip.basicSalary ?? 0],
    ['House allowance', payslip.houseAllowance ?? 0],
    ['Transport',       payslip.transportAllowance ?? 0],
    ['Medical',         payslip.medicalAllowance ?? 0],
    ['Other allowances', payslip.otherAllowances ?? 0],
    ['Gross pay',       payslip.grossPay ?? 0, true],
    ['NSSF deduction',  -(payslip.nssf ?? 0)],
    ['NHIF deduction',  -(payslip.nhif ?? 0)],
    ['PAYE',            -(payslip.paye ?? 0)],
    ['Net pay',         payslip.netPay ?? 0, true],
  ].filter(([, v]) => v !== 0);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[380px] flex flex-col">
        <SheetHeader className="border-b pb-4">
          <SheetTitle>Payslip</SheetTitle>
          <p className="text-sm font-medium">{name}</p>
          {staff?.staffId && <p className="font-mono text-xs text-muted-foreground">{staff.staffId}</p>}
          {payslip.salaryGrade && <p className="text-xs text-muted-foreground">{payslip.salaryGrade}</p>}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="divide-y">
            {rows.map(([label, value, isBold]) => (
              <div key={label} className={cn('flex justify-between py-2.5', isBold && 'font-semibold border-t-2 border-foreground mt-1')}>
                <span className={cn('text-sm', !isBold && 'text-muted-foreground')}>{label}</span>
                <span className={cn('font-mono tabular-nums text-sm', value < 0 ? 'text-bad' : isBold ? 'text-ok' : '')}>
                  {value < 0 ? `(${formatCurrency(Math.abs(value))})` : formatCurrency(value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" /> Print Payslip
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Payroll Runs Tab ──────────────────────────────────────────────────────────

function RunsTab({ canApprove }) {
  const queryClient = useQueryClient();
  const now         = new Date();
  const [genMonth,  setGenMonth]  = useState(String(now.getMonth() + 1));
  const [genYear,   setGenYear]   = useState(String(now.getFullYear()));
  const [selMonth,  setSelMonth]  = useState(String(now.getMonth() + 1));
  const [selYear,   setSelYear]   = useState(String(now.getFullYear()));
  const [generateOpen, setGenerateOpen] = useState(false);
  const [openPayslip,  setOpenPayslip]  = useState(null);

  const { data: runsData, isLoading } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: async () => { const r = await payrollApi.listRuns(); return r.data?.runs ?? []; },
  });

  const runs          = runsData ?? [];
  const selectedRun   = useMemo(() =>
    runs.find((r) => String(r.month) === selMonth && String(r.year) === selYear) ?? null,
  [runs, selMonth, selYear]);

  const { data: runDetail } = useQuery({
    queryKey: ['payroll-run', selectedRun?._id],
    queryFn: async () => { const r = await payrollApi.getRun(selectedRun._id); return r.data?.run ?? null; },
    enabled: !!selectedRun?._id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payroll-runs'] });
    if (selectedRun?._id) queryClient.invalidateQueries({ queryKey: ['payroll-run', selectedRun._id] });
  };

  const { mutate: generate, isPending: generating } = useMutation({
    mutationFn: () => payrollApi.generateRun({ month: Number(genMonth), year: Number(genYear) }),
    onSuccess: () => {
      toast.success('Payroll run generated');
      invalidate();
      setGenerateOpen(false);
      setSelMonth(genMonth);
      setSelYear(genYear);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: approve } = useMutation({
    mutationFn: (id) => payrollApi.approveRun(id),
    onSuccess:  () => { toast.success('Payroll approved'); invalidate(); },
    onError:    (err) => showApiError(err),
  });

  const { mutate: markPaid } = useMutation({
    mutationFn: (id) => payrollApi.markPaid(id),
    onSuccess:  () => { toast.success('Payroll marked as paid'); invalidate(); },
    onError:    (err) => showApiError(err),
  });

  const { mutate: deleteRun } = useMutation({
    mutationFn: (id) => payrollApi.deleteRun(id),
    onSuccess:  () => { toast.success('Run deleted'); invalidate(); },
    onError:    (err) => showApiError(err),
  });

  const payslips = runDetail?.payslips ?? [];

  const ledgerStats = selectedRun ? [
    { label: 'Gross',  value: formatCurrency(selectedRun.totalGross ?? 0) },
    { label: 'PAYE',   value: formatCurrency(selectedRun.totalPaye  ?? 0) },
    { label: 'NSSF',   value: formatCurrency(selectedRun.totalNssf  ?? 0) },
    { label: 'NHIF',   value: formatCurrency(selectedRun.totalNhif  ?? 0) },
    { label: 'Net',    value: formatCurrency(selectedRun.totalNet   ?? 0), accent: true },
  ] : null;

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={selMonth}
            onChange={(e) => setSelMonth(e.target.value)}
            className="h-8 rounded-full border border-input bg-transparent px-3 text-xs"
          >
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <Input
            type="number"
            min="2020"
            max="2099"
            value={selYear}
            onChange={(e) => setSelYear(e.target.value)}
            className="h-8 w-20 text-xs rounded-full"
          />
          {selectedRun && <StatusPill status={selectedRun.status} />}
        </div>
        <div className="flex gap-2">
          {selectedRun && canApprove && selectedRun.status === 'draft' && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => approve(selectedRun._id)}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </Button>
          )}
          {selectedRun && canApprove && selectedRun.status === 'approved' && (
            <Button size="sm" variant="outline" className="h-8 text-xs text-ok border-ok/30" onClick={() => markPaid(selectedRun._id)}>
              Mark Paid
            </Button>
          )}
          {selectedRun && selectedRun.status === 'draft' && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-bad hover:text-bad" onClick={() => deleteRun(selectedRun._id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" onClick={() => setGenerateOpen(true)}><Plus className="h-4 w-4" /> Generate Run</Button>
        </div>
      </div>

      {/* Summary ledger strip */}
      {ledgerStats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px rounded-lg border bg-border overflow-hidden">
          {ledgerStats.map(({ label, value, accent }) => (
            <div key={label} className="bg-card px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
              <p className={cn('font-mono text-sm font-semibold tabular-nums', accent && 'text-ok')}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Staff payroll table */}
      {isLoading ? (
        <div className="rounded-lg border bg-card divide-y">
          {[...Array(4)].map((_, i) => <div key={i} className="px-4 py-3"><Skeleton className="h-10 w-full" /></div>)}
        </div>
      ) : !selectedRun ? (
        <div className="rounded-lg border bg-card py-14 text-center text-muted-foreground">
          <Receipt className="h-7 w-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No run for {MONTH_NAMES[Number(selMonth) - 1]} {selYear}.</p>
          <button
            onClick={() => { setGenMonth(selMonth); setGenYear(selYear); setGenerateOpen(true); }}
            className="text-xs text-primary hover:underline mt-1 inline-block"
          >
            Generate one →
          </button>
        </div>
      ) : !runDetail ? (
        <div className="rounded-lg border bg-card divide-y">
          {[...Array(4)].map((_, i) => <div key={i} className="px-4 py-3"><Skeleton className="h-10 w-full" /></div>)}
        </div>
      ) : payslips.length === 0 ? (
        <div className="rounded-lg border bg-card py-14 text-center text-muted-foreground">
          <p className="text-sm">No payslips in this run.</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="py-2 pl-4 pr-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Staff</th>
                  <th className="py-2 px-2 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Basic</th>
                  <th className="py-2 px-2 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Allowances</th>
                  <th className="py-2 px-2 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Deductions</th>
                  <th className="py-2 px-2 pr-4 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Net</th>
                  <th className="py-2 px-2 pr-4 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {payslips.map((p, i) => {
                  const staff = p.staffId;
                  const allowances = [
                    p.houseAllowance     > 0 ? { label: 'House',     val: p.houseAllowance     } : null,
                    p.transportAllowance > 0 ? { label: 'Transport', val: p.transportAllowance } : null,
                    p.medicalAllowance   > 0 ? { label: 'Medical',   val: p.medicalAllowance   } : null,
                    p.otherAllowances    > 0 ? { label: 'Other',     val: p.otherAllowances    } : null,
                  ].filter(Boolean);
                  const totalDeductions = (p.nssf ?? 0) + (p.nhif ?? 0) + (p.paye ?? 0);
                  return (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="py-2.5 pl-4 pr-2">
                        <p className="font-medium leading-tight">{staff?.firstName} {staff?.lastName}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{staff?.staffId ?? ''}</p>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums hidden sm:table-cell">
                        {formatCurrency(p.basicSalary ?? 0)}
                      </td>
                      <td className="py-2.5 px-2 hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {allowances.map(({ label, val }) => (
                            <span key={label} className="text-[10px] border rounded-full px-1.5 py-0 text-muted-foreground">
                              {label} {formatCurrency(val)}
                            </span>
                          ))}
                          {allowances.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-bad hidden md:table-cell">
                        ({formatCurrency(totalDeductions)})
                      </td>
                      <td className="py-2.5 px-2 pr-4 text-right font-mono tabular-nums font-semibold text-ok">
                        {formatCurrency(p.netPay ?? 0)}
                      </td>
                      <td className="py-2.5 px-2 pr-4 text-right">
                        <button
                          onClick={() => setOpenPayslip(p)}
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generate dialog */}
      <Dialog open={generateOpen} onOpenChange={(v) => !v && setGenerateOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate Payroll Run</DialogTitle>
            <DialogDescription>Computes payslips for all BOM/contract staff based on their salary grade.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Month</Label>
              <select value={genMonth} onChange={(e) => setGenMonth(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input type="number" min="2020" max="2099" value={genYear} onChange={(e) => setGenYear(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>Cancel</Button>
            <Button disabled={generating} onClick={() => generate()}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PayslipPanel payslip={openPayslip} open={!!openPayslip} onClose={() => setOpenPayslip(null)} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const { user }      = useAuthStore();
  const canApprove    = APPROVE_ROLES.includes(user?.role);

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll" description="Manage salary grades and monthly payroll runs">
        <RefreshButton queryKeys={[['payroll-grades'], ['payroll-runs']]} />
      </PageHeader>

      <div className="flex items-start gap-2 rounded-md border px-3 py-2.5">
        <AlertTriangle className="h-3.5 w-3.5 text-warn mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">
          TSC teachers are excluded — their salaries are paid directly by the government. Only BOM, contract, and permanent staff are included.
        </p>
      </div>

      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs" className="gap-1.5">
            <Receipt className="h-3.5 w-3.5" /> Payroll Runs
          </TabsTrigger>
          <TabsTrigger value="grades" className="gap-1.5">
            <Wallet className="h-3.5 w-3.5" /> Salary Grades
          </TabsTrigger>
        </TabsList>
        <TabsContent value="runs"   className="mt-4"><RunsTab canApprove={canApprove} /></TabsContent>
        <TabsContent value="grades" className="mt-4"><GradesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
