'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Search, X, MoreHorizontal, Mail, KeyRound, PauseCircle, PlayCircle,
  UserCheck, UserX, AlertTriangle, Pencil, Trash2,
  CheckCircle2, XCircle, AlertCircle, Umbrella, Loader2,
  CalendarDays, MapPin, ChevronLeft, ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { usersApi, leaveApi, checkInsApi, getErrorMessage } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader } from '@/components/shared/page-header';
import { RefreshButton } from '@/components/shared/refresh-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard } from '@/components/shared/section-card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { SkeletonList } from '@/components/shared/skeleton-list';
import { useDebounce } from '@/hooks/use-debounce';

// ── Constants ─────────────────────────────────────────────────────────────────

const STAFF_ROLES = [
  'school_admin', 'director', 'headteacher', 'deputy_headteacher',
  'secretary', 'accountant', 'teacher', 'department_head',
];
const DEPUTY_MANAGEABLE_ROLES = ['teacher', 'department_head'];
const LEAVE_APPROVER_ROLES = ['school_admin', 'director', 'headteacher', 'deputy_headteacher'];

const LEAVE_TYPES = [
  { value: 'annual',        label: 'Annual Leave',        color: 'bg-blue-500' },
  { value: 'sick',          label: 'Sick Leave',          color: 'bg-amber-500' },
  { value: 'maternity',     label: 'Maternity Leave',     color: 'bg-pink-500' },
  { value: 'paternity',     label: 'Paternity Leave',     color: 'bg-purple-500' },
  { value: 'compassionate', label: 'Compassionate Leave', color: 'bg-rose-500' },
  { value: 'study',         label: 'Study Leave',         color: 'bg-emerald-500' },
  { value: 'unpaid',        label: 'Unpaid Leave',        color: 'bg-slate-400' },
];
const LEAVE_TYPE_MAP = Object.fromEntries(LEAVE_TYPES.map((t) => [t.value, t]));

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   className: 'text-warn border-warn/30 bg-warn/8' },
  approved:  { label: 'Approved',  className: 'text-ok border-ok/30 bg-ok/8' },
  rejected:  { label: 'Rejected',  className: 'text-bad border-bad/30 bg-bad/8' },
  cancelled: { label: 'Cancelled', className: 'text-muted-foreground border-border bg-muted/40' },
};

// Role → visual tone (for badge coloring)
const ROLE_TONE = {
  school_admin:         'text-primary border-primary/20 bg-primary/8',
  director:             'text-primary border-primary/20 bg-primary/8',
  headteacher:          'text-primary border-primary/20 bg-primary/8',
  deputy_headteacher:   'text-primary border-primary/20 bg-primary/8',
  secretary:            'text-warn border-warn/30 bg-warn/8',
  accountant:           'text-warn border-warn/30 bg-warn/8',
  teacher:              'text-ok border-ok/30 bg-ok/8',
  department_head:      'text-ok border-ok/30 bg-ok/8',
};

const inviteSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName:  z.string().min(1, 'Required'),
  email:     z.string().email('Enter valid email'),
  role:      z.string().min(1, 'Required'),
  phone:     z.string().optional(),
  tscNumber: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function staffName(staffId) {
  if (!staffId) return '—';
  if (typeof staffId === 'string') return staffId;
  return `${staffId.firstName ?? ''} ${staffId.lastName ?? ''}`.trim();
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={cn('inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-medium', cfg.className)}>
      {cfg.label}
    </span>
  );
}


// ── Leave: Approve / Reject Dialog ───────────────────────────────────────────

function LeaveActionDialog({ leave, action, onClose }) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () => action === 'approve'
      ? leaveApi.approve(leave._id, { comment })
      : leaveApi.reject(leave._id, { comment }),
    onSuccess: () => {
      toast.success(action === 'approve' ? 'Leave approved' : 'Leave rejected');
      queryClient.invalidateQueries({ queryKey: ['staff-all-leaves'] });
      queryClient.invalidateQueries({ queryKey: ['staff-pending-leaves'] });
      onClose();
      setComment('');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const isReject  = action === 'reject';
  const canSubmit = !isReject || comment.trim().length >= 5;
  if (!leave) return null;

  return (
    <Dialog open={!!leave} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReject
              ? <XCircle className="h-5 w-5 text-red-500" />
              : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            {isReject ? 'Reject Leave' : 'Approve Leave'}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{staffName(leave.staffId)}</span> —{' '}
            {LEAVE_TYPE_MAP[leave.leaveType]?.label} · {leave.workingDays} day{leave.workingDays !== 1 ? 's' : ''}
            {' '}({formatDate(leave.startDate)} → {formatDate(leave.endDate)})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-1">
          <Label htmlFor="leave-action-comment">
            {isReject ? 'Reason for rejection' : 'Comment'}{' '}
            {!isReject && <span className="text-muted-foreground font-normal text-xs">(optional)</span>}
          </Label>
          <Textarea
            id="leave-action-comment"
            rows={2}
            placeholder={isReject ? 'Provide a reason…' : 'Add a note (optional)…'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutate()}
            disabled={!canSubmit || isPending}
            variant={isReject ? 'destructive' : 'default'}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isReject ? 'Reject' : 'Approve'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Leave: Row ────────────────────────────────────────────────────────────────

function LeaveRow({ leave, onApprove, onReject }) {
  const typeMeta = LEAVE_TYPE_MAP[leave.leaveType];
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-semibold truncate">{staffName(leave.staffId)}</p>
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
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-ok border-ok/30 hover:bg-ok/8" onClick={() => onApprove(leave)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-bad border-bad/30 hover:bg-bad/8" onClick={() => onReject(leave)}>
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Leave Tab ─────────────────────────────────────────────────────────────────

function LeaveTab() {
  const queryClient = useQueryClient();
  const [actionLeave, setActionLeave] = useState(null);
  const [actionType,  setActionType]  = useState(null);
  const [leaveFilter, setLeaveFilter] = useState('pending');

  const { data: pendingLeaves, isLoading: loadingPending } = useQuery({
    queryKey: ['staff-pending-leaves'],
    queryFn: async () => {
      const res = await leaveApi.list({ status: 'pending', limit: 100 });
      return res.data?.leaves ?? [];
    },
    staleTime: 30_000,
  });

  const { data: allLeaves, isLoading: loadingAll } = useQuery({
    queryKey: ['staff-all-leaves'],
    queryFn: async () => {
      const res = await leaveApi.list({ limit: 200 });
      return res.data?.leaves ?? [];
    },
    staleTime: 30_000,
  });

  const { data: onLeaveToday } = useQuery({
    queryKey: ['staff-on-leave-today'],
    queryFn: async () => {
      const res = await leaveApi.onLeaveToday();
      return res.data?.leaves ?? [];
    },
    staleTime: 60_000,
  });

  const openApprove = (leave) => { setActionLeave(leave); setActionType('approve'); };
  const openReject  = (leave) => { setActionLeave(leave); setActionType('reject'); };
  const closeAction = ()      => { setActionLeave(null);  setActionType(null); };

  const pendingCount = pendingLeaves?.length ?? 0;
  const displayLeaves = leaveFilter === 'pending'
    ? pendingLeaves ?? []
    : (allLeaves ?? []).filter((l) => leaveFilter === 'all' || l.status === leaveFilter);

  return (
    <div className="space-y-4">

      {/* On leave today banner */}
      {onLeaveToday?.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3">
          <p className="text-xs font-semibold text-warn mb-2 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {onLeaveToday.length} staff member{onLeaveToday.length !== 1 ? 's' : ''} on leave today
          </p>
          <div className="flex flex-wrap gap-1.5">
            {onLeaveToday.map((l) => (
              <span key={l._id} className="text-xs border border-warn/30 rounded-full px-2.5 py-1 text-warn bg-background">
                {staffName(l.staffId)} · {LEAVE_TYPE_MAP[l.leaveType]?.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Leave list */}
      <SectionCard
        title={`Leave Requests${pendingCount > 0 ? ` · ${pendingCount} pending` : ''}`}
        action={
          <Select value={leaveFilter} onValueChange={setLeaveFilter}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        }
      >
        {(leaveFilter === 'pending' ? loadingPending : loadingAll) ? (
          <SkeletonList count={4} className="h-16" spacing="space-y-3" />
        ) : displayLeaves.length > 0 ? (
          <div>
            {displayLeaves.map((leave) => (
              <LeaveRow
                key={leave._id}
                leave={leave}
                onApprove={openApprove}
                onReject={openReject}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <Umbrella className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {leaveFilter === 'pending' ? 'No pending leave requests — all caught up.' : 'No leave records found.'}
            </p>
          </div>
        )}
      </SectionCard>

      <LeaveActionDialog leave={actionLeave} action={actionType} onClose={closeAction} />
    </div>
  );
}

// ── Check-ins Tab ─────────────────────────────────────────────────────────────

const TODAY_STR = new Date().toISOString().split('T')[0];

function CheckInsTab() {
  const [date, setDate] = useState(TODAY_STR);

  const { data, isLoading } = useQuery({
    queryKey: ['checkins-roster', date],
    queryFn: async () => {
      const res = await checkInsApi.roster(date);
      return res.data;
    },
  });

  function stepDate(delta) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split('T')[0]);
  }

  const present  = data?.present ?? [];
  const absent   = data?.absent  ?? [];
  const counts   = data?.counts  ?? {};

  const TYPE_LABEL = { morning_in: 'Morning In', afternoon_out: 'Afternoon Out', afternoon_in: 'Afternoon In', evening_out: 'Evening Out' };

  return (
    <div className="space-y-4 mt-4">
      {/* Date navigator */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => stepDate(-1)}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={date}
          max={TODAY_STR}
          onChange={(e) => setDate(e.target.value)}
          className="text-sm border rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          onClick={() => stepDate(1)}
          disabled={date >= TODAY_STR}
          className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-40"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        {date !== TODAY_STR && (
          <button onClick={() => setDate(TODAY_STR)} className="text-xs text-primary hover:underline ml-1">
            Today
          </button>
        )}
      </div>

      {/* Summary */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Present', value: counts.present ?? present.length, tone: 'ok',   bar: 'bg-ok' },
            { label: 'Absent',  value: counts.absent  ?? absent.length,  tone: 'bad',  bar: 'bg-bad' },
            { label: 'On Time', value: counts.on_time ?? 0,              tone: null,   bar: 'bg-primary' },
            { label: 'Late',    value: counts.late    ?? 0,              tone: 'warn', bar: 'bg-warn' },
          ].map(({ label, value, tone, bar }) => (
            <div key={label} className="relative rounded-lg border border-border bg-card pl-5 pr-4 py-3 overflow-hidden">
              <span className={cn('absolute left-0 inset-y-0 w-[3px] rounded-l-lg', bar)} />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
              <p className={cn(
                'font-mono text-2xl font-semibold tabular-nums leading-none',
                tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-foreground',
              )}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <SkeletonList count={6} className="h-12" spacing="space-y-2" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Present */}
          <SectionCard
            icon={CheckCircle2}
            title={`Checked In (${present.length})`}
          >
            {present.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No check-ins recorded</p>
            ) : (
              <div className="divide-y">
                {present.map((c) => {
                  const staff = c.staffId;
                  const name  = staff ? `${staff.firstName} ${staff.lastName}` : '—';
                  const time  = new Date(c.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={c._id} className="flex items-center justify-between py-2.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ROLE_LABELS[staff?.role] ?? staff?.role} · {TYPE_LABEL[c.check_in_type] ?? c.check_in_type} · {time}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.off_site && (
                          <Badge variant="outline" className="text-[10px] border-primary/20 text-primary bg-primary/8 gap-1">
                            <MapPin className="h-2.5 w-2.5" /> Off-site
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={cn('text-[10px]', c.status === 'late'
                            ? 'border-warn/30 text-warn bg-warn/8'
                            : 'border-ok/30 text-ok bg-ok/8',
                          )}
                        >
                          {c.status === 'late' ? 'Late' : 'On Time'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* Absent */}
          <SectionCard
            icon={XCircle}
            title={`Not Checked In (${absent.length})`}
          >
            {absent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">All staff have checked in</p>
            ) : (
              <div className="divide-y">
                {absent.map((s) => (
                  <div key={s._id} className="flex items-center gap-3 py-2.5">
                    <AlertCircle className="h-4 w-4 text-bad shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.firstName} {s.lastName}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_LABELS[s.role] ?? s.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const searchParams = useSearchParams();

  const isDeputy      = user?.role === 'deputy_headteacher';
  const canManageLeave = LEAVE_APPROVER_ROLES.includes(user?.role);
  const roleOptions   = isDeputy ? DEPUTY_MANAGEABLE_ROLES : STAFF_ROLES;

  const [activeTab, setActiveTab] = useState('directory');
  const [search,       setSearch]      = useState('');
  const [page,         setPage]        = useState(1);
  const [open,         setOpen]        = useState(false);
  const [roleFilter,   setRoleFilter]  = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pauseTarget,  setPauseTarget] = useState(null);
  const [pauseReason,  setPauseReason] = useState('');
  const [editTarget,   setEditTarget]  = useState(null);
  const [editValues,   setEditValues]  = useState({
    firstName: '', lastName: '', email: '', role: '', phone: '', tscNumber: '',
    employmentType: '', dateOfJoining: '', nationalId: '', salaryGrade: '',
    emergencyName: '', emergencyPhone: '', emergencyRelation: '',
    bankName: '', accountNumber: '', branchCode: '',
  });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const debouncedSearch = useDebounce(search, 400);

  // Set active tab from URL search params
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['directory', 'leave', 'checkins'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Total counts per status for summary cards
  const { data: staffCounts } = useQuery({
    queryKey: ['staff-status-counts'],
    queryFn: async () => {
      const [active, invite, paused] = await Promise.all([
        usersApi.list({ limit: 1, isActive: 'true',  invitePending: 'false' }).then((r) => r.data?.pagination?.total ?? r.data?.meta?.total ?? 0),
        usersApi.list({ limit: 1, isActive: 'true',  invitePending: 'true'  }).then((r) => r.data?.pagination?.total ?? r.data?.meta?.total ?? 0),
        usersApi.list({ limit: 1, isActive: 'false'                         }).then((r) => r.data?.pagination?.total ?? r.data?.meta?.total ?? 0),
      ]);
      return { active, invite, paused };
    },
    staleTime: 60_000,
  });

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(inviteSchema),
  });

  const statusParams = {
    active: { isActive: 'true',  invitePending: 'false' },
    invite: { isActive: 'true',  invitePending: 'true'  },
    paused: { isActive: 'false' },
  }[statusFilter] ?? {};

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['users', page, debouncedSearch, roleFilter, statusFilter],
    queryFn: async () => {
      const res = await usersApi.list({
        page, limit: 20,
        search: debouncedSearch || undefined,
        role:   roleFilter || undefined,
        ...statusParams,
      });
      return res.data;
    },
  });

  // Pending leave count for badge
  const { data: pendingLeavesData } = useQuery({
    queryKey: ['staff-pending-leaves'],
    queryFn: async () => {
      const res = await leaveApi.list({ status: 'pending', limit: 100 });
      return res.data?.leaves ?? [];
    },
    enabled: canManageLeave,
    staleTime: 30_000,
  });
  const pendingLeaveCount = pendingLeavesData?.length ?? 0;

  const staffRows  = rawData?.users ?? (Array.isArray(rawData?.data) ? rawData.data : Array.isArray(rawData) ? rawData : []);
  const pagination = rawData?.pagination ?? rawData?.meta;

  const active  = staffRows.filter((u) => u.isActive && !u.invitePending);
  const pending = staffRows.filter((u) => u.isActive && u.invitePending);
  const paused  = staffRows.filter((u) => !u.isActive);

  const { mutate: createUser,   isPending: creating }   = useMutation({
    mutationFn: (data) => usersApi.create(data),
    onSuccess:  () => { toast.success('Staff member invited via email'); queryClient.invalidateQueries({ queryKey: ['users'] }); setOpen(false); reset(); },
    onError:    (err) => toast.error(getErrorMessage(err)),
  });
  const { mutate: resendInvite  } = useMutation({ mutationFn: (id) => usersApi.resendInvite(id),   onSuccess: () => toast.success('Invite resent'),                 onError: (err) => toast.error(getErrorMessage(err)) });
  const { mutate: resetPassword } = useMutation({ mutationFn: (id) => usersApi.resetPassword(id), onSuccess: () => toast.success('Password reset email sent'),     onError: (err) => toast.error(getErrorMessage(err)) });
  const { mutate: toggleActive  } = useMutation({
    mutationFn: ({ id, isActive, reason }) => usersApi.toggleActive(id, isActive, reason),
    onSuccess: (_, { isActive }) => { toast.success(isActive ? 'Account reactivated' : 'Account paused'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const { mutate: updateUser, isPending: updatingUser } = useMutation({
    mutationFn: ({ id, data }) => usersApi.update(id, data),
    onSuccess:  () => { toast.success('User details updated'); queryClient.invalidateQueries({ queryKey: ['users'] }); setEditTarget(null); },
    onError:    (err) => toast.error(getErrorMessage(err)),
  });
  const { mutate: deleteUser, isPending: deletingUser } = useMutation({
    mutationFn: (id) => usersApi.delete(id),
    onSuccess:  () => { toast.success('User deleted'); queryClient.invalidateQueries({ queryKey: ['users'] }); setDeleteTarget(null); },
    onError:    (err) => toast.error(getErrorMessage(err)),
  });

  const handleConfirmPause = () => {
    if (!pauseTarget) return;
    toggleActive({ id: pauseTarget._id, isActive: false, reason: pauseReason || undefined });
    setPauseTarget(null); setPauseReason('');
  };

  const actionHandlers = {
    onResendInvite:  (id)   => resendInvite(id),
    onResetPassword: (id)   => resetPassword(id),
    onToggleActive:  (id, isActive) => toggleActive({ id, isActive }),
    onPauseRequest:  (u)    => { setPauseTarget(u); setPauseReason(''); },
    onEdit:          (u)    => { setEditTarget(u); setEditValues({ firstName: u.firstName ?? '', lastName: u.lastName ?? '', email: u.email ?? '', role: u.role ?? '', phone: u.phone ?? '', tscNumber: u.tscNumber ?? '', employmentType: u.employmentType ?? '', dateOfJoining: u.dateOfJoining ? new Date(u.dateOfJoining).toISOString().slice(0, 10) : '', nationalId: u.nationalId ?? '', salaryGrade: u.salaryGrade ?? '', emergencyName: u.emergencyContact?.name ?? '', emergencyPhone: u.emergencyContact?.phone ?? '', emergencyRelation: u.emergencyContact?.relation ?? '', bankName: u.bankDetails?.bankName ?? '', accountNumber: u.bankDetails?.accountNumber ?? '', branchCode: u.bankDetails?.branchCode ?? '' }); },
    onDeleteRequest: (u)    => setDeleteTarget(u),
  };

  const totalStaff = (staffCounts?.active ?? 0) + (staffCounts?.invite ?? 0) + (staffCounts?.paused ?? 0);

  return (
    <div className="space-y-4">
      <PageHeader
        overline={staffCounts ? `${staffCounts.active} active` : undefined}
        title="Staff"
        description={isDeputy ? 'Manage teacher records' : 'Teaching and non-teaching staff directory'}
      >
        <RefreshButton queryKeys={[['users'], ['staff-status-counts']]} />
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Invite Staff
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="directory">Directory</TabsTrigger>
          {canManageLeave && (
            <TabsTrigger value="leave" className="gap-1.5">
              <Umbrella className="h-3.5 w-3.5" />
              Leave
              {pendingLeaveCount > 0 && (
                <span className="ml-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 leading-none">
                  {pendingLeaveCount}
                </span>
              )}
            </TabsTrigger>
          )}
          {canManageLeave && (
            <TabsTrigger value="checkins" className="gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Check-ins
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Directory tab ────────────────────────────────────────────────── */}
        <TabsContent value="directory" className="space-y-4 mt-4">

          {/* Summary cards — ledger cell style */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Total',          value: totalStaff,               hint: 'on staff',           tone: null,   bar: 'bg-border' },
              { label: 'Active',         value: staffCounts?.active ?? 0, hint: 'with system access',  tone: 'ok',   bar: 'bg-ok' },
              { label: 'Invite Pending', value: staffCounts?.invite ?? 0, hint: 'awaiting acceptance', tone: 'warn', bar: 'bg-warn' },
              { label: 'Paused',         value: staffCounts?.paused ?? 0, hint: 'access suspended',    tone: 'bad',  bar: 'bg-bad' },
            ].map(({ label, value, hint, tone, bar }) => (
              <div key={label} className="relative rounded-lg border border-border bg-card pl-5 pr-4 py-3 overflow-hidden">
                <span className={cn('absolute left-0 inset-y-0 w-[3px] rounded-l-lg', bar)} />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">{label}</p>
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

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Name or email…"
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

            {/* Role select */}
            <Select value={roleFilter || '__all__'} onValueChange={(v) => { setRoleFilter(v === '__all__' ? '' : v); setPage(1); }}>
              <SelectTrigger className="h-8 text-xs w-44 shrink-0"><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All roles</SelectItem>
                {roleOptions.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Status chips */}
            <div className="flex items-center gap-1.5">
              {[
                { value: '',       label: 'All'            },
                { value: 'active', label: 'Active'         },
                { value: 'invite', label: 'Invite Pending' },
                { value: 'paused', label: 'Paused'         },
              ].map(({ value, label }) => (
                <button
                  key={value || '__all__'}
                  type="button"
                  onClick={() => { setStatusFilter(value); setPage(1); }}
                  className={cn(
                    'inline-flex items-center h-7 px-3 rounded-full text-xs font-medium border transition-colors shrink-0',
                    statusFilter === value
                      ? 'bg-foreground text-background border-transparent'
                      : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : staffRows.length === 0 ? (
            <div className="rounded-lg border bg-card py-16 text-center text-muted-foreground">
              <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{search || roleFilter || statusFilter ? 'No staff match your filters.' : 'No staff invited yet.'}</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="text-left py-2.5 px-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Staff Member</th>
                      <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden sm:table-cell">Role</th>
                      <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Phone</th>
                      <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">TSC No.</th>
                      <th className="text-center py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                      <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hidden md:table-cell">Joined</th>
                      <th className="py-2.5 px-3 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {staffRows.map((u) => {
                      const canManageThisUser = u.role !== 'school_admin';
                      const statusEl = !u.isActive
                        ? <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium border text-bad border-bad/30 bg-bad/8">Paused</span>
                        : u.invitePending
                          ? <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium border text-warn border-warn/30 bg-warn/8">Invite Pending</span>
                          : <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium border text-ok border-ok/30 bg-ok/8">Active</span>;
                      return (
                        <tr key={u._id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center shrink-0 border border-primary/15 uppercase">
                                {u.firstName?.[0]}{u.lastName?.[0]}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{u.firstName} {u.lastName}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 hidden sm:table-cell">
                            <span className={cn('inline-flex items-center h-5 px-2 rounded-full text-[10px] font-medium border capitalize',
                              ROLE_TONE[u.role] ?? 'text-muted-foreground border-border bg-muted/40')}>
                              {ROLE_LABELS[u.role] ?? u.role}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-xs text-muted-foreground font-mono tabular-nums hidden md:table-cell">{u.phone ?? '—'}</td>
                          <td className="py-3 px-3 text-xs text-muted-foreground font-mono tabular-nums hidden lg:table-cell">{u.tscNumber ?? '—'}</td>
                          <td className="py-3 px-3 text-center">{statusEl}</td>
                          <td className="py-3 px-3 text-xs text-muted-foreground font-mono tabular-nums hidden md:table-cell">{formatDate(u.createdAt)}</td>
                          <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {u.invitePending && u.isActive && canManageThisUser && (
                                  <DropdownMenuItem onClick={() => actionHandlers.onResendInvite(u._id)}>
                                    <Mail className="h-4 w-4 mr-2" /> Resend Invite
                                  </DropdownMenuItem>
                                )}
                                {canManageThisUser && (
                                  <DropdownMenuItem onClick={() => actionHandlers.onEdit(u)}>
                                    <Pencil className="h-4 w-4 mr-2" /> Edit Details
                                  </DropdownMenuItem>
                                )}
                                {!u.invitePending && canManageThisUser && (
                                  <DropdownMenuItem onClick={() => actionHandlers.onResetPassword(u._id)}>
                                    <KeyRound className="h-4 w-4 mr-2" /> Send Password Reset
                                  </DropdownMenuItem>
                                )}
                                {canManageThisUser && (
                                  <>
                                    <DropdownMenuSeparator />
                                    {u.isActive ? (
                                      <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => actionHandlers.onPauseRequest(u)}>
                                        <PauseCircle className="h-4 w-4 mr-2" /> Pause Account
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem className="text-green-700 focus:text-green-700" onClick={() => actionHandlers.onToggleActive(u._id, true)}>
                                        <PlayCircle className="h-4 w-4 mr-2" /> Reactivate Account
                                      </DropdownMenuItem>
                                    )}
                                    {user?.role !== 'deputy_headteacher' && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => actionHandlers.onDeleteRequest(u)}>
                                          <Trash2 className="h-4 w-4 mr-2" /> Delete User
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </>
                                )}
                                {!canManageThisUser && (
                                  <DropdownMenuItem disabled>
                                    <span className="text-muted-foreground text-xs">School admin record is protected</span>
                                  </DropdownMenuItem>
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
              </div>
              {(pagination?.totalPages ?? 1) > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Page {page} of {pagination.totalPages}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Leave tab ────────────────────────────────────────────────────── */}
        {canManageLeave && (
          <TabsContent value="leave" className="mt-4">
            <LeaveTab />
          </TabsContent>
        )}

        {/* ── Check-ins tab ─────────────────────────────────────────────────── */}
        {canManageLeave && (
          <TabsContent value="checkins">
            <CheckInsTab />
          </TabsContent>
        )}
      </Tabs>

      {/* ── Edit dialog ────────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Staff Details</DialogTitle></DialogHeader>
          <Tabs defaultValue="basic">
            <TabsList className="mb-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="hr">HR Details</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-first">First Name</Label>
                  <Input id="edit-first" value={editValues.firstName} onChange={(e) => setEditValues((p) => ({ ...p, firstName: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-last">Last Name</Label>
                  <Input id="edit-last" value={editValues.lastName} onChange={(e) => setEditValues((p) => ({ ...p, lastName: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email Address</Label>
                <Input id="edit-email" type="email" value={editValues.email} onChange={(e) => setEditValues((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-role">Role</Label>
                  <Select value={editValues.role} onValueChange={(v) => setEditValues((p) => ({ ...p, role: v }))}>
                    <SelectTrigger id="edit-role"><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input id="edit-phone" value={editValues.phone} onChange={(e) => setEditValues((p) => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-tsc">TSC Number</Label>
                <Input id="edit-tsc" value={editValues.tscNumber} onChange={(e) => setEditValues((p) => ({ ...p, tscNumber: e.target.value }))} />
              </div>
            </TabsContent>

            <TabsContent value="hr" className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-emptype">Employment Type</Label>
                  <Select value={editValues.employmentType} onValueChange={(v) => setEditValues((p) => ({ ...p, employmentType: v }))}>
                    <SelectTrigger id="edit-emptype"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TSC">TSC (Government)</SelectItem>
                      <SelectItem value="BOM">BOM (Board of Management)</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="permanent">Permanent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-doj">Date of Joining</Label>
                  <Input id="edit-doj" type="date" value={editValues.dateOfJoining} onChange={(e) => setEditValues((p) => ({ ...p, dateOfJoining: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-nid">National ID</Label>
                  <Input id="edit-nid" value={editValues.nationalId} onChange={(e) => setEditValues((p) => ({ ...p, nationalId: e.target.value }))} placeholder="e.g. 12345678" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-sg">Salary Grade</Label>
                  <Input id="edit-sg" value={editValues.salaryGrade} onChange={(e) => setEditValues((p) => ({ ...p, salaryGrade: e.target.value }))} placeholder="e.g. Grade 5" />
                </div>
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Emergency Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-ec-name">Name</Label>
                  <Input id="edit-ec-name" value={editValues.emergencyName} onChange={(e) => setEditValues((p) => ({ ...p, emergencyName: e.target.value }))} placeholder="Full name" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-ec-rel">Relation</Label>
                  <Input id="edit-ec-rel" value={editValues.emergencyRelation} onChange={(e) => setEditValues((p) => ({ ...p, emergencyRelation: e.target.value }))} placeholder="e.g. Spouse" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-ec-phone">Emergency Phone</Label>
                <Input id="edit-ec-phone" value={editValues.emergencyPhone} onChange={(e) => setEditValues((p) => ({ ...p, emergencyPhone: e.target.value }))} placeholder="0712 345 678" />
              </div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Bank Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-bank">Bank Name</Label>
                  <Input id="edit-bank" value={editValues.bankName} onChange={(e) => setEditValues((p) => ({ ...p, bankName: e.target.value }))} placeholder="e.g. KCB" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-branch">Branch Code</Label>
                  <Input id="edit-branch" value={editValues.branchCode} onChange={(e) => setEditValues((p) => ({ ...p, branchCode: e.target.value }))} placeholder="e.g. 01200" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-acc">Account Number</Label>
                <Input id="edit-acc" value={editValues.accountNumber} onChange={(e) => setEditValues((p) => ({ ...p, accountNumber: e.target.value }))} placeholder="e.g. 1234567890" />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              disabled={updatingUser}
              onClick={() => updateUser({
                id: editTarget._id,
                data: {
                  firstName: editValues.firstName,
                  lastName: editValues.lastName,
                  email: editValues.email,
                  role: editValues.role,
                  phone: editValues.phone || undefined,
                  tscNumber: editValues.tscNumber || undefined,
                  employmentType: editValues.employmentType || undefined,
                  dateOfJoining: editValues.dateOfJoining || undefined,
                  nationalId: editValues.nationalId || undefined,
                  salaryGrade: editValues.salaryGrade || undefined,
                  emergencyContact: (editValues.emergencyName || editValues.emergencyPhone || editValues.emergencyRelation)
                    ? { name: editValues.emergencyName || undefined, phone: editValues.emergencyPhone || undefined, relation: editValues.emergencyRelation || undefined }
                    : undefined,
                  bankDetails: (editValues.bankName || editValues.accountNumber || editValues.branchCode)
                    ? { bankName: editValues.bankName || undefined, accountNumber: editValues.accountNumber || undefined, branchCode: editValues.branchCode || undefined }
                    : undefined,
                },
              })}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete dialog ──────────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>This will permanently remove this staff account from your school.</DialogDescription>
          </DialogHeader>
          <div className="text-sm">
            <strong>{deleteTarget?.firstName} {deleteTarget?.lastName}</strong>
            <p className="text-muted-foreground">{deleteTarget?.email}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deletingUser} onClick={() => deleteUser(deleteTarget._id)}>Delete User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pause dialog ───────────────────────────────────────────────────── */}
      <Dialog open={!!pauseTarget} onOpenChange={(v) => { if (!v) { setPauseTarget(null); setPauseReason(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <DialogTitle>Pause Account</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                  {pauseTarget?.firstName} {pauseTarget?.lastName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              This staff member will immediately lose access to the system and will not be able to log in until their account is reactivated.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="pause-reason">Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea id="pause-reason" placeholder="e.g. On leave, disciplinary action…" rows={3} value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} className="resize-none" />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setPauseTarget(null); setPauseReason(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmPause}>
              <PauseCircle className="h-4 w-4 mr-1.5" /> Pause Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Invite dialog ──────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invite Staff Member</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((data) => createUser({ ...data, phone: data.phone || undefined, tscNumber: data.tscNumber || undefined }))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-first">First Name</Label>
                <Input id="invite-first" {...register('firstName')} placeholder="Jane" />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-last">Last Name</Label>
                <Input id="invite-last" {...register('lastName')} placeholder="Wanjiru" />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input id="invite-email" {...register('email')} type="email" placeholder="staff@school.ac.ke" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select onValueChange={(v) => setValue('role', v)}>
                  <SelectTrigger id="invite-role"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-phone">Phone (optional)</Label>
                <Input id="invite-phone" {...register('phone')} placeholder="0712 345 678" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-tsc">TSC Number (optional)</Label>
              <Input id="invite-tsc" {...register('tscNumber')} placeholder="TSC/12345" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>Send Invite</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
