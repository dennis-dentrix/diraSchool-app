'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, UserCheck, Search } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { visitorsApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const today = new Date().toISOString().split('T')[0];

const fmt12h = (t) => {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const schema = z.object({
  visitDate: z.string().min(1, 'Date is required'),
  timeIn: z.string().optional(),
  timeOut: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  reason: z.string().min(1, 'Reason is required'),
  comment: z.string().optional(),
});

const nowTime = () => new Date().toTimeString().slice(0, 5);
const EMPTY_FORM = () => ({ visitDate: today, timeIn: nowTime(), timeOut: '', name: '', reason: '', comment: '' });

function VisitorDialog({ open, onClose, initial }) {
  const qc = useQueryClient();
  const isEdit = !!initial?._id;

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? { visitDate: initial.visitDate?.split('T')[0] ?? today, timeIn: initial.timeIn ?? '', timeOut: initial.timeOut ?? '', name: initial.name, reason: initial.reason, comment: initial.comment ?? '' }
      : EMPTY_FORM(),
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => isEdit ? visitorsApi.update(initial._id, data) : visitorsApi.create(data),
    onSuccess: () => {
      toast.success(isEdit ? 'Visitor record updated' : 'Visitor logged');
      qc.invalidateQueries({ queryKey: ['visitors'] });
      reset(EMPTY_FORM());
      onClose();
    },
    onError: (err) => showApiError(err),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(EMPTY_FORM()); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Visitor Record' : 'Log Visitor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(mutate)} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Date of Visit</Label>
            <Input type="date" max={today} {...register('visitDate')} />
            {errors.visitDate && <p className="text-xs text-destructive">{errors.visitDate.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Time In <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input type="time" {...register('timeIn')} />
            </div>
            <div className="space-y-1.5">
              <Label>Time Out <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input type="time" {...register('timeOut')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Visitor Name</Label>
            <Input {...register('name')} placeholder="John Kamau" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Reason for Visit</Label>
            <Input {...register('reason')} placeholder="Parent meeting, Delivery, Inspection…" />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Comment <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea {...register('comment')} placeholder="Additional notes…" rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(EMPTY_FORM()); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : isEdit ? 'Update' : 'Log Visitor'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function VisitorsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['visitors', page, debouncedSearch, fromDate, toDate],
    queryFn: async () => {
      const res = await visitorsApi.list({ page, limit: 20, search: debouncedSearch || undefined, from: fromDate || undefined, to: toDate || undefined });
      return res.data;
    },
  });

  const { mutate: deleteVisitor, isPending: deleting } = useMutation({
    mutationFn: (id) => visitorsApi.remove(id),
    onSuccess: () => {
      toast.success('Visitor record deleted');
      qc.invalidateQueries({ queryKey: ['visitors'] });
      setDeleteTarget(null);
    },
    onError: (err) => showApiError(err),
  });

  const visitors = data?.visitors ?? [];
  const meta = data?.meta ?? {};


  return (
    <div className="space-y-5">
      <PageHeader
        title="Visitors"
        description="Log and track school visitors"
        action={
          <Button onClick={() => { setEditTarget(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Log Visitor
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or reason…"
            className="pl-8 h-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">From</Label>
          <Input type="date" className="h-9 w-36 text-sm" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" className="h-9 w-36 text-sm" value={toDate} onChange={(e) => { setToDate(e.target.value); setPage(1); }} />
        </div>
        {(fromDate || toDate || search) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => { setSearch(''); setFromDate(''); setToDate(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : visitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <UserCheck className="h-10 w-10 opacity-30" />
          <p className="text-sm">No visitor records found.</p>
          <Button size="sm" onClick={() => { setEditTarget(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Log First Visitor
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[380px]">
              <thead>
                <tr className="bg-muted/30">
                  <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-28">Date</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Visitor</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Reason</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Time In</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Time Out</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Comment</th>
                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden xl:table-cell">Recorded By</th>
                  <th className="py-2.5 px-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {visitors.map((v) => {
                  const recorder = v.recordedBy;
                  return (
                    <tr key={v._id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDate(v.visitDate)}</span>
                      </td>
                      <td className="py-3 px-3 font-medium">{v.name}</td>
                      <td className="py-3 px-3 text-muted-foreground hidden sm:table-cell">{v.reason}</td>
                      <td className="py-3 px-3 text-xs tabular-nums text-muted-foreground hidden md:table-cell">{fmt12h(v.timeIn)}</td>
                      <td className="py-3 px-3 text-xs tabular-nums text-muted-foreground hidden md:table-cell">{fmt12h(v.timeOut)}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground hidden lg:table-cell">{v.comment || '—'}</td>
                      <td className="py-3 px-3 text-xs text-muted-foreground hidden xl:table-cell">
                        {recorder ? `${recorder.firstName} ${recorder.lastName}` : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditTarget(v); setDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(v)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
          {(meta.pages ?? 1) > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Page {page} of {meta.pages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}

      <VisitorDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditTarget(null); }}
        initial={editTarget}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete visitor record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the record for <strong>{deleteTarget?.name}</strong> on {deleteTarget && formatDate(deleteTarget.visitDate)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteVisitor(deleteTarget._id)} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
