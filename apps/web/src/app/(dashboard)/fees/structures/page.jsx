'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Printer, Copy, Pencil, Layers, Check, X } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { feesApi, schoolsApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useClasses } from '@/hooks/use-app-queries';
import { buildDocumentHeaderHtml, getDocumentHeaderCss, getDocumentHeaderData } from '@/lib/document-print';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ACADEMIC_YEARS, TERMS, CURRENT_YEAR, ADMIN_ROLES } from '@/lib/constants';
import { useAuth } from '@/hooks/use-auth';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const CATEGORIES = [
  'School Fees', 'One-Time Payment', 'Boarding / Hostel',
  'Transport', 'Stationery / Books', 'Uniform', 'Activity / Sports', 'Other',
];
const CONFIRM_INIT = { open: false, id: null };

function groupByCategory(items = []) {
  return items.reduce((acc, item) => {
    const cat = item.category || 'School Fees';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
}

function printStructure(structure, options = {}) {
  const className = typeof structure.classId === 'object'
    ? `${structure.classId.name}${structure.classId.stream ? ` ${structure.classId.stream}` : ''}`
    : '—';
  const grouped = groupByCategory(structure.items);
  const serial  = `FST-${structure.academicYear}-${structure.term.replace(/\s+/g, '').toUpperCase()}-${String(structure._id).slice(-6).toUpperCase()}`;
  const header  = getDocumentHeaderData({
    school: options.school || {}, settings: options.settings || {},
    title: 'Fee Structure', subtitle: `${className} · ${structure.term} ${structure.academicYear}`,
    serial, generatedAt: new Date().toLocaleString(),
  });
  const rows = Object.entries(grouped).map(([cat, items]) => `
    <tr><td colspan="2" class="cat">${cat}</td></tr>
    ${items.map((item) => `<tr><td>${item.name}</td><td class="amt">${formatCurrency(item.amount)}</td></tr>`).join('')}
  `).join('');

  const win = window.open('', '_blank', 'width=680,height=900');
  if (!win) {
    alert('Pop-ups are blocked. Please allow pop-ups for this site, then try again.');
    return;
  }

  win.document.write(`<!DOCTYPE html><html><head><title>Fee Structure — ${className}</title>
<style>body{font-family:Arial,sans-serif;font-size:13px;margin:32px;color:#111;}${getDocumentHeaderCss()}
table{width:100%;border-collapse:collapse;}th{text-align:left;border-bottom:2px solid #333;padding:6px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#555;}
td{padding:5px 4px;border-bottom:1px solid #eee;}.cat{font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#444;padding-top:14px;border-bottom:none;}
.amt{text-align:right;font-weight:600;font-variant-numeric:tabular-nums;}.total{border-top:2px solid #333;font-weight:700;font-size:14px;}
@media print{body{margin:16px;}}</style></head><body>
  ${buildDocumentHeaderHtml(header)}
  <table><thead><tr><th>Description</th><th style="text-align:right">Amount (KES)</th></tr></thead>
  <tbody>${rows}<tr class="total"><td>Total Per Term</td><td class="amt">${formatCurrency(structure.totalAmount)}</td></tr></tbody></table>
  ${structure.notes ? `<div style="margin-top:20px;font-size:11px;color:#555;background:#f8f8f8;padding:10px 12px;border-radius:4px;"><strong>NB:</strong> ${structure.notes}</div>` : ''}
</body></html>`);
  win.document.close();
  win.focus();
  // Give the browser time to render content before triggering print
  setTimeout(() => {
    win.print();
    win.onafterprint = () => win.close();
  }, 300);
}

// ── Detail pane — definition-list with inline-edit affordances ────────────────
function StructureDetailPane({ structure, canEdit, onEdit, onDelete, printOptions }) {
  const grouped = groupByCategory(structure.items ?? []);
  const cls = typeof structure.classId === 'object'
    ? `${structure.classId.name}${structure.classId.stream ? ` ${structure.classId.stream}` : ''}`
    : '—';

  return (
    <div className="flex flex-col h-full">
      {/* Pane header */}
      <div className="px-5 py-4 border-b shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Fee Structure</p>
            <h2 className="text-lg font-semibold leading-tight">{cls}</h2>
            <div className="flex gap-1.5 mt-1.5">
              <Badge variant="outline" className="text-[11px]">{structure.term}</Badge>
              <Badge variant="secondary" className="text-[11px] font-mono">{structure.academicYear}</Badge>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"
              onClick={() => printStructure(structure, printOptions)} title="Print">
              <Printer className="h-3.5 w-3.5" />
            </Button>
            {canEdit && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onEdit} title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={onDelete} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable line items */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No line items.</p>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{cat}</p>
                <div className="rounded-md border overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody className="divide-y">
                      {items.map((item, i) => (
                        <tr key={i} className="hover:bg-muted/20 transition-colors group">
                          <td className="px-4 py-2.5 text-foreground">{item.name}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="font-mono tabular-nums font-medium">{formatCurrency(item.amount)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total row */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <span className="text-sm font-bold uppercase tracking-wide">Total Per Term</span>
          <span className="font-mono text-xl font-bold tabular-nums text-primary">
            {formatCurrency(structure.totalAmount ?? 0)}
          </span>
        </div>

        {structure.notes && (
          <p className="mt-4 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2.5 border italic">
            NB: {structure.notes}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Left pane list item ───────────────────────────────────────────────────────
function StructureListItem({ structure, selected, onClick }) {
  const cls = typeof structure.classId === 'object'
    ? `${structure.classId.name}${structure.classId.stream ? ` ${structure.classId.stream}` : ''}`
    : '—';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors flex items-center justify-between gap-3',
        selected ? 'bg-primary/8 border-l-2 border-l-primary' : 'hover:bg-muted/40 border-l-2 border-l-transparent',
      )}
    >
      <div className="min-w-0">
        <p className={cn('text-sm font-medium leading-tight truncate', selected && 'text-primary')}>{cls}</p>
        <div className="flex gap-1.5 mt-1">
          <span className="text-[10px] text-muted-foreground">{structure.term}</span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{structure.academicYear}</span>
        </div>
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
        {formatCurrency(structure.totalAmount ?? 0)}
      </span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FeeStructuresPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen]               = useState(false);
  const [adaptOpen, setAdaptOpen]     = useState(false);
  const [selectedId, setSelectedId]   = useState(null);
  const [mobileView, setMobileView]   = useState('list');
  const [filterYear,  setFilterYear]  = useState(String(CURRENT_YEAR));
  const [filterTerm,  setFilterTerm]  = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [confirmDialog, setConfirmDialog]   = useState(CONFIRM_INIT);
  const [editingStructure, setEditingStructure] = useState(null);
  const [adaptFromYear, setAdaptFromYear] = useState(String(CURRENT_YEAR - 1));
  const [adaptToYear,   setAdaptToYear]   = useState(String(CURRENT_YEAR));
  const [adaptFromTerm, setAdaptFromTerm] = useState(TERMS[0]);
  const [adaptToTerm,   setAdaptToTerm]   = useState(TERMS[0]);
  const [adaptClassId,  setAdaptClassId]  = useState('');
  const [adaptOverwrite, setAdaptOverwrite] = useState(false);

  const canManageStructures = ADMIN_ROLES.includes(user?.role);
  const { settings: settingsData, academicYear: defaultAcademicYear, term: defaultTerm } =
    useSchoolTermDefaults(['settings-structures']);

  // ── Create form ──────────────────────────────────────────────────────────
  const { register, handleSubmit, reset, setValue, control, watch } = useForm({
    defaultValues: {
      classId: '', academicYear: defaultAcademicYear, term: defaultTerm, notes: '',
      items: [
        { category: 'School Fees', name: 'Tuition Fee', amount: '' },
        { category: 'School Fees', name: 'Admission Fee (One Time)', amount: '' },
      ],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const selectedAcademicYear = watch('academicYear');
  const selectedTerm         = watch('term');
  const items                = watch('items');
  const total = items?.reduce((s, i) => s + (Number(i.amount) || 0), 0) ?? 0;

  // ── Edit form ────────────────────────────────────────────────────────────
  const editForm = useForm({ defaultValues: { notes: '', items: [{ category: 'School Fees', name: '', amount: '' }] } });
  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEdit,
          setValue: setEditValue, control: controlEdit, watch: watchEdit } = editForm;
  const { fields: editFields, append: appendEdit, remove: removeEdit, replace: replaceEdit } =
    useFieldArray({ control: controlEdit, name: 'items' });
  const editItems = watchEdit('items');
  const editTotal = editItems?.reduce((s, i) => s + (Number(i.amount) || 0), 0) ?? 0;

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['fee-structures', filterYear, filterTerm, filterClass],
    queryFn: async () => {
      const params = { limit: 200 };
      if (filterYear)  params.academicYear = filterYear;
      if (filterTerm)  params.term         = filterTerm;
      if (filterClass) params.classId      = filterClass;
      const res = await feesApi.listStructures(params);
      return res.data;
    },
  });

  const { data: classesData } = useClasses();

  const { data: schoolData } = useQuery({
    queryKey: ['school-me-structures'],
    queryFn: async () => { const res = await schoolsApi.me(); return res.data?.school ?? res.data?.data ?? res.data; },
  });

  useEffect(() => {
    const previousYear = Number(defaultAcademicYear) > 0 ? String(Number(defaultAcademicYear) - 1) : String(CURRENT_YEAR - 1);
    setAdaptFromYear(previousYear);
    setAdaptToYear(defaultAcademicYear);
    setAdaptFromTerm(defaultTerm);
    setAdaptToTerm(defaultTerm);
    setValue('academicYear', defaultAcademicYear);
    setValue('term', defaultTerm);
  }, [defaultAcademicYear, defaultTerm, setValue]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const { mutate: createStructure, isPending } = useMutation({
    mutationFn: (data) => feesApi.createStructure({
      ...data,
      items: data.items.filter((i) => i.name && i.amount).map((i) => ({ category: i.category || 'School Fees', name: i.name, amount: Number(i.amount) })),
      notes: data.notes || undefined,
    }),
    onSuccess: () => {
      toast.success('Fee structure created');
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] });
      setOpen(false);
      reset({ classId: '', academicYear: defaultAcademicYear, term: defaultTerm, notes: '',
        items: [{ category: 'School Fees', name: 'Tuition Fee', amount: '' }, { category: 'School Fees', name: 'Admission Fee (One Time)', amount: '' }],
      });
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: deleteStructure } = useMutation({
    mutationFn: (id) => feesApi.deleteStructure(id),
    onSuccess: () => { toast.success('Deleted'); queryClient.invalidateQueries({ queryKey: ['fee-structures'] }); setSelectedId(null); },
    onError: (err) => showApiError(err),
  });

  const { mutate: updateStructure, isPending: updating } = useMutation({
    mutationFn: ({ id, data }) => feesApi.updateStructure(id, {
      items: (data.items || []).filter((i) => i.name && i.amount !== '' && i.amount !== null && i.amount !== undefined)
        .map((i) => ({ category: i.category || 'School Fees', name: i.name, amount: Number(i.amount) })),
      notes: data.notes || undefined,
    }),
    onSuccess: () => {
      toast.success('Fee structure updated');
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] });
      setEditingStructure(null);
      resetEdit({ notes: '', items: [{ category: 'School Fees', name: '', amount: '' }] });
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: adaptStructures, isPending: adapting } = useMutation({
    mutationFn: () => feesApi.adaptStructures({
      fromAcademicYear: adaptFromYear, toAcademicYear: adaptToYear,
      fromTerm: adaptFromTerm, toTerm: adaptToTerm,
      classId: adaptClassId || undefined, overwrite: adaptOverwrite,
    }),
    onSuccess: (res) => {
      const summary = res?.data?.summary ?? res?.data?.data?.summary;
      toast.success(summary ? `Adapted: ${summary.created} created, ${summary.updated} updated, ${summary.skippedExisting} skipped.` : 'Structures adapted.');
      queryClient.invalidateQueries({ queryKey: ['fee-structures'] });
      setAdaptOpen(false); setAdaptOverwrite(false); setAdaptClassId('');
    },
    onError: (err) => showApiError(err),
  });

  const structures = data?.data ?? [];
  const classes    = classesData ?? [];
  const hasFilters = filterYear || filterTerm || filterClass;

  // Sort structures by class name then term
  const sortedStructures = useMemo(() =>
    [...structures].sort((a, b) => {
      const ca = typeof a.classId === 'object' ? `${a.classId.name}${a.classId.stream ?? ''}` : '';
      const cb = typeof b.classId === 'object' ? `${b.classId.name}${b.classId.stream ?? ''}` : '';
      return ca.localeCompare(cb) || (a.term ?? '').localeCompare(b.term ?? '');
    }),
  [structures]);

  const selectedStructure = sortedStructures.find((s) => s._id === selectedId) ?? sortedStructures[0] ?? null;
  const printOptions = { school: schoolData, settings: settingsData };

  return (
    <div className="space-y-4">
      <PageHeader overline="Fees" title="Fee Structures" description="Configure term fees per class">
        {canManageStructures && (
          <>
            <Button size="sm" variant="outline" onClick={() => setAdaptOpen(true)}>
              <Copy className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Adapt from Previous Year</span>
            </Button>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Structure
            </Button>
          </>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterYear} onValueChange={(v) => setFilterYear(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-9 w-28 text-xs"><SelectValue placeholder="All years" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All years</SelectItem>
            {ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTerm} onValueChange={(v) => setFilterTerm(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-9 w-28 text-xs"><SelectValue placeholder="All terms" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All terms</SelectItem>
            {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterClass} onValueChange={(v) => setFilterClass(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue placeholder="All classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All classes</SelectItem>
            {classes.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9"
            onClick={() => { setFilterYear(''); setFilterTerm(''); setFilterClass(''); }}>
            Clear
          </Button>
        )}
      </div>

      {/* Two-pane layout */}
      {isLoading ? (
        <div className="h-96 flex items-center justify-center">
          <div className="space-y-2 w-full max-w-sm">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </div>
      ) : structures.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground rounded-lg border">
          <Layers className="h-10 w-10 opacity-30" />
          <div className="text-center space-y-1">
            <p className="font-semibold text-foreground">
              {hasFilters ? 'No structures match your filters' : 'No fee structures yet'}
            </p>
            <p className="text-sm max-w-xs mx-auto">
              {hasFilters ? 'Try clearing your filters.' : 'Set up a fee structure for each class and term.'}
            </p>
          </div>
          {!hasFilters && canManageStructures && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Set Up First Fee Structure
            </Button>
          )}
        </div>
      ) : (
        <div className="flex gap-0 rounded-lg border overflow-hidden" style={{ minHeight: '520px' }}>
          {/* Left list */}
          <div className={cn(
            'border-r flex flex-col',
            mobileView === 'detail' ? 'hidden lg:flex lg:w-64 lg:shrink-0' : 'flex w-full lg:w-64 lg:shrink-0',
          )}>
            <div className="px-4 py-2.5 border-b bg-muted/30">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {sortedStructures.length} structure{sortedStructures.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sortedStructures.map((s) => (
                <StructureListItem
                  key={s._id}
                  structure={s}
                  selected={s._id === (selectedId ?? sortedStructures[0]?._id)}
                  onClick={() => { setSelectedId(s._id); setMobileView('detail'); }}
                />
              ))}
            </div>
          </div>

          {/* Right detail */}
          <div className={cn(
            'flex-1 min-w-0 bg-background',
            mobileView === 'list' ? 'hidden lg:block' : 'block',
          )}>
            {/* Mobile back button */}
            <button
              onClick={() => setMobileView('list')}
              className="lg:hidden flex items-center gap-1.5 px-4 py-2.5 border-b text-sm text-muted-foreground hover:text-foreground w-full"
            >
              <span className="text-base leading-none">←</span> All Structures
            </button>
            {selectedStructure ? (
              <StructureDetailPane
                structure={selectedStructure}
                canEdit={canManageStructures}
                printOptions={printOptions}
                onEdit={() => {
                  replaceEdit(
                    (selectedStructure.items || []).map((i) => ({
                      category: i.category || 'School Fees',
                      name: i.name || '',
                      amount: i.amount ?? '',
                    }))
                  );
                  setEditValue('notes', selectedStructure.notes || '');
                  setEditingStructure(selectedStructure);
                }}
                onDelete={() => setConfirmDialog({ open: true, id: selectedStructure._id })}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Select a structure to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create dialog ─────────────────────────────────────────────────── */}
      {canManageStructures && (
        <Dialog open={open} onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset({ classId: '', academicYear: defaultAcademicYear, term: defaultTerm, notes: '',
            items: [{ category: 'School Fees', name: 'Tuition Fee', amount: '' }, { category: 'School Fees', name: 'Admission Fee (One Time)', amount: '' }],
          });
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Fee Structure</DialogTitle>
              <p className="text-sm text-muted-foreground">Add all fee items for this class and term. Empty rows are ignored.</p>
            </DialogHeader>
            <form onSubmit={handleSubmit(createStructure)} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Class <span className="text-destructive">*</span></Label>
                  <Select onValueChange={(v) => setValue('classId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {classes.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Academic Year</Label>
                  <Select value={selectedAcademicYear || defaultAcademicYear} onValueChange={(v) => setValue('academicYear', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Term</Label>
                  <Select value={selectedTerm || defaultTerm} onValueChange={(v) => setValue('term', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Fee Items</Label>
                  <Button type="button" size="sm" variant="outline" onClick={() => append({ category: 'School Fees', name: '', amount: '' })}>
                    <Plus className="h-3 w-3" /> Add Row
                  </Button>
                </div>
                <div className="overflow-x-auto">
                <div className="grid grid-cols-[1fr_1.5fr_6rem_2rem] gap-2 px-1 min-w-[400px]">
                  <p className="text-xs font-medium text-muted-foreground">Category</p>
                  <p className="text-xs font-medium text-muted-foreground">Description</p>
                  <p className="text-xs font-medium text-muted-foreground text-right">Amount (KES)</p>
                  <span />
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 min-w-[400px]">
                  {fields.map((field, i) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1.5fr_6rem_2rem] gap-2 items-center">
                      <Select defaultValue={field.category || 'School Fees'} onValueChange={(v) => setValue(`items.${i}.category`, v)}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                      </Select>
                      <Input {...register(`items.${i}.name`)} placeholder="e.g. Tuition Fee" className="h-9 text-sm" />
                      <Input {...register(`items.${i}.amount`)} placeholder="0" type="number" min="0" className="h-9 text-sm text-right" />
                      {fields.length > 1 ? (
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-8 text-muted-foreground hover:text-destructive" onClick={() => remove(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
                </div>
                <div className="flex justify-end pt-2 border-t">
                  <span className="text-sm font-semibold flex gap-4">
                    <span className="text-muted-foreground">Total Per Term:</span>
                    <span className="font-mono tabular-nums text-primary">{formatCurrency(total)}</span>
                  </span>
                </div>
              </div>
              <Separator />
              <div className="space-y-1.5">
                <Label>Notes / NB <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea {...register('notes')} placeholder="e.g. Tuition fee inclusive of meals." rows={2} className="text-sm resize-none" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending}>{isPending ? 'Creating…' : 'Create Structure'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Adapt dialog ──────────────────────────────────────────────────── */}
      {canManageStructures && (
        <Dialog open={adaptOpen} onOpenChange={setAdaptOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Adapt Fee Structures</DialogTitle>
              <p className="text-sm text-muted-foreground">Copy fee structures from one year/term into another for easy rollover.</p>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>From Year</Label>
                  <Select value={adaptFromYear} onValueChange={setAdaptFromYear}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>To Year</Label>
                  <Select value={adaptToYear} onValueChange={setAdaptToYear}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>From Term</Label>
                  <Select value={adaptFromTerm} onValueChange={setAdaptFromTerm}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>To Term</Label>
                  <Select value={adaptToTerm} onValueChange={setAdaptToTerm}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Class <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Select value={adaptClassId || '__all__'} onValueChange={(v) => setAdaptClassId(v === '__all__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All classes</SelectItem>
                    {classes.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={adaptOverwrite} onChange={(e) => setAdaptOverwrite(e.target.checked)} className="mt-1" />
                <span>
                  Overwrite existing target structures
                  <span className="block text-xs text-muted-foreground">Structures with recorded payments are protected.</span>
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdaptOpen(false)}>Cancel</Button>
              <Button onClick={() => adaptStructures()} disabled={adapting}>{adapting ? 'Adapting…' : 'Adapt Structures'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Edit dialog ───────────────────────────────────────────────────── */}
      {canManageStructures && (
        <Dialog open={!!editingStructure} onOpenChange={(v) => !v && setEditingStructure(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Fee Structure</DialogTitle>
              <p className="text-sm text-muted-foreground">Update fee items and notes. Class/year/term stay unchanged.</p>
            </DialogHeader>
            <form onSubmit={handleSubmitEdit((data) => { if (editingStructure?._id) updateStructure({ id: editingStructure._id, data }); })} className="space-y-5">
              <div className="overflow-x-auto">
              <div className="grid grid-cols-[1fr_1.5fr_6rem_2rem] gap-2 px-1 min-w-[400px]">
                <p className="text-xs font-medium text-muted-foreground">Category</p>
                <p className="text-xs font-medium text-muted-foreground">Description</p>
                <p className="text-xs font-medium text-muted-foreground text-right">Amount (KES)</p>
                <span />
              </div>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 min-w-[400px]">
                {editFields.map((field, i) => (
                  <div key={field.id} className="grid grid-cols-[1fr_1.5fr_6rem_2rem] gap-2 items-center">
                    <Select defaultValue={field.category || 'School Fees'} onValueChange={(v) => setEditValue(`items.${i}.category`, v)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input {...registerEdit(`items.${i}.name`)} placeholder="e.g. Tuition Fee" className="h-9 text-sm" />
                    <Input {...registerEdit(`items.${i}.amount`)} placeholder="0" type="number" min="0" className="h-9 text-sm text-right" />
                    {editFields.length > 1 ? (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeEdit(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : <span />}
                  </div>
                ))}
              </div>
              </div>
              <div className="flex justify-between items-center">
                <Button type="button" size="sm" variant="outline" onClick={() => appendEdit({ category: 'School Fees', name: '', amount: '' })}>
                  <Plus className="h-3 w-3" /> Add Row
                </Button>
                <span className="text-sm font-semibold flex gap-4">
                  <span className="text-muted-foreground">Total Per Term:</span>
                  <span className="font-mono tabular-nums text-primary">{formatCurrency(editTotal)}</span>
                </span>
              </div>
              <div className="space-y-1.5">
                <Label>Notes / NB <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Textarea {...registerEdit('notes')} placeholder="e.g. Tuition fee inclusive of meals." rows={2} className="text-sm resize-none" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingStructure(null)}>Cancel</Button>
                <Button type="submit" disabled={updating}>{updating ? 'Saving…' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete confirm ────────────────────────────────────────────────── */}
      {canManageStructures && (
        <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog(CONFIRM_INIT)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete fee structure?</AlertDialogTitle>
              <AlertDialogDescription>
                This structure will be permanently removed. Student invoices that reference it will not be affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { deleteStructure(confirmDialog.id); setConfirmDialog(CONFIRM_INIT); }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
