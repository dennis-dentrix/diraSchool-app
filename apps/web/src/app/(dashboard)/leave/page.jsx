'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Umbrella, Plus, Loader2, Trash2 } from 'lucide-react';
import { leaveApi, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

// ── Constants ─────────────────────────────────────────────────────────────────

const LEAVE_TYPES = [
  { value: 'annual',        label: 'Annual Leave',        entitlement: 21,  color: 'bg-blue-500' },
  { value: 'sick',          label: 'Sick Leave',          entitlement: 10,  color: 'bg-amber-500' },
  { value: 'maternity',     label: 'Maternity Leave',     entitlement: 90,  color: 'bg-pink-500' },
  { value: 'paternity',     label: 'Paternity Leave',     entitlement: 14,  color: 'bg-purple-500' },
  { value: 'compassionate', label: 'Compassionate Leave', entitlement: 5,   color: 'bg-rose-500' },
  { value: 'study',         label: 'Study Leave',         entitlement: 10,  color: 'bg-emerald-500' },
  { value: 'unpaid',        label: 'Unpaid Leave',        entitlement: 365, color: 'bg-slate-400' },
];

const LEAVE_TYPE_MAP = Object.fromEntries(LEAVE_TYPES.map((t) => [t.value, t]));

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   className: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved:  { label: 'Approved',  className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected:  { label: 'Rejected',  className: 'bg-red-100 text-red-800 border-red-200' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── Balance Cards ─────────────────────────────────────────────────────────────

function BalanceCards({ balances, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const visible = LEAVE_TYPES.filter((t) => t.value !== 'unpaid');
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {visible.map((type) => {
        const bal         = balances?.find((b) => b.leaveType === type.value);
        const used        = bal?.used ?? 0;
        const entitlement = bal?.entitlement ?? type.entitlement;
        const remaining   = Math.max(0, entitlement - used);
        const pct         = Math.min(100, Math.round((used / entitlement) * 100));
        const isLow       = remaining <= 2;
        return (
          <Card key={type.value} className="border-border/60">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs text-muted-foreground leading-snug">{type.label}</p>
              <div className="flex items-end justify-between">
                <span className={`text-2xl font-bold ${isLow ? 'text-amber-600' : 'text-slate-900'}`}>{remaining}</span>
                <span className="text-xs text-muted-foreground mb-0.5">/ {entitlement} days</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${isLow ? 'bg-amber-500' : type.color}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground">{used} day{used !== 1 ? 's' : ''} used</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Apply Dialog ──────────────────────────────────────────────────────────────

function ApplyDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ leaveType: '', startDate: '', endDate: '', reason: '' });

  const { mutate: apply, isPending } = useMutation({
    mutationFn: () => leaveApi.apply(form),
    onSuccess: () => {
      toast.success('Leave application submitted');
      queryClient.invalidateQueries({ queryKey: ['my-leaves'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      onClose();
      setForm({ leaveType: '', startDate: '', endDate: '', reason: '' });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const canSubmit = form.leaveType && form.startDate && form.endDate && form.reason.length >= 10;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Apply for Leave</DialogTitle>
          <DialogDescription>
            Your application will be reviewed by the principal or admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="leave-type">Type of leave</Label>
            <Select value={form.leaveType} onValueChange={(v) => setForm((p) => ({ ...p, leaveType: v }))}>
              <SelectTrigger id="leave-type"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="leave-start">From</Label>
              <Input id="leave-start" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-end">To</Label>
              <Input id="leave-end" type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="leave-reason">
              Reason <span className="text-muted-foreground font-normal text-xs">(min 10 characters)</span>
            </Label>
            <Textarea
              id="leave-reason"
              rows={3}
              placeholder="Briefly describe the reason for your leave…"
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => apply()} disabled={!canSubmit || isPending}>
            {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Submit Application'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LeavePage() {
  const queryClient = useQueryClient();
  const [applyOpen, setApplyOpen] = useState(false);

  const { data: balanceData, isLoading: loadingBalances } = useQuery({
    queryKey: ['leave-balances'],
    queryFn: async () => {
      const res = await leaveApi.balances();
      return res.data?.balances ?? [];
    },
    staleTime: 60_000,
  });

  const { data: myLeaves, isLoading: loadingMyLeaves } = useQuery({
    queryKey: ['my-leaves'],
    queryFn: async () => {
      const res = await leaveApi.list({ limit: 50 });
      return res.data?.leaves ?? [];
    },
    staleTime: 30_000,
  });

  const { mutate: cancelLeave } = useMutation({
    mutationFn: (id) => leaveApi.cancel(id),
    onSuccess: () => {
      toast.success('Leave request cancelled');
      queryClient.invalidateQueries({ queryKey: ['my-leaves'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="My Leave"
        description="View your leave balances and submit applications."
      >
        <Button onClick={() => setApplyOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Apply for Leave
        </Button>
      </PageHeader>

      {/* Balance summary */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Leave Balances — {new Date().getFullYear()}</h2>
        <BalanceCards balances={balanceData} loading={loadingBalances} />
      </div>

      {/* My leave history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">My Leave History</CardTitle>
          <CardDescription>All your leave applications this year and beyond.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingMyLeaves ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : myLeaves?.length ? (
            <div>
              {myLeaves.map((leave) => {
                const typeMeta = LEAVE_TYPE_MAP[leave.leaveType];
                return (
                  <div key={leave._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b last:border-0">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{typeMeta?.label ?? leave.leaveType}</span>
                        <StatusBadge status={leave.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(leave.startDate)} → {formatDate(leave.endDate)} · {leave.workingDays} working day{leave.workingDays !== 1 ? 's' : ''}
                      </p>
                      {leave.reason && (
                        <p className="text-xs text-muted-foreground line-clamp-1 italic">"{leave.reason}"</p>
                      )}
                      {leave.approverComment && (
                        <p className="text-xs text-muted-foreground">Note: {leave.approverComment}</p>
                      )}
                    </div>
                    {leave.status === 'pending' && (
                      <Button size="sm" variant="ghost" className="h-8 text-muted-foreground hover:text-red-600 shrink-0" onClick={() => cancelLeave(leave._id)}>
                        <Trash2 className="h-3.5 w-3.5" /> Cancel
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <Umbrella className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No leave applications yet.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setApplyOpen(true)}>
                Apply for Leave
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ApplyDialog open={applyOpen} onClose={() => setApplyOpen(false)} />
    </div>
  );
}
