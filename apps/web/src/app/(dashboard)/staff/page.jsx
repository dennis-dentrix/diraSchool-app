'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Search, MoreHorizontal, Mail, KeyRound, PauseCircle, PlayCircle,
  UserCheck, UserX, AlertTriangle, Pencil, Trash2,
  CheckCircle2, XCircle, Clock, AlertCircle, Umbrella, Loader2,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { usersApi, leaveApi, getErrorMessage } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/constants';
import { getRoleBadgeColor, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader } from '@/components/shared/page-header';
import { RefreshButton } from '@/components/shared/refresh-button';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
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
  pending:   { label: 'Pending',   className: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved:  { label: 'Approved',  className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected:  { label: 'Rejected',  className: 'bg-red-100 text-red-800 border-red-200' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
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
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// ── Staff table columns ───────────────────────────────────────────────────────

const columns = ({ onResendInvite, onResetPassword, onToggleActive, onPauseRequest, onEdit, onDeleteRequest, viewerRole }) => [
  {
    id: 'name',
    header: 'Staff Member',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-blue-700">
            {row.original.firstName?.[0]}{row.original.lastName?.[0]}
          </span>
        </div>
        <div>
          <p className="font-medium text-sm">{row.original.firstName} {row.original.lastName}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'role',
    header: 'Role',
    cell: ({ row }) => (
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getRoleBadgeColor(row.original.role)}`}>
        {ROLE_LABELS[row.original.role] ?? row.original.role}
      </span>
    ),
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => <span className="text-sm">{row.original.phone ?? '—'}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const u = row.original;
      if (!u.isActive)
        return <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">Paused</span>;
      if (u.invitePending)
        return <span className="text-xs px-2 py-1 rounded-full font-medium bg-yellow-100 text-yellow-800">Invite Pending</span>;
      return <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-100 text-green-800">Active</span>;
    },
  },
  {
    accessorKey: 'createdAt',
    header: 'Joined',
    cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const u = row.original;
      const canManageThisUser = u.role !== 'school_admin';
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {u.invitePending && u.isActive && canManageThisUser && (
              <DropdownMenuItem onClick={() => onResendInvite(u._id)}>
                <Mail className="h-4 w-4 mr-2" /> Resend Invite
              </DropdownMenuItem>
            )}
            {canManageThisUser && (
              <DropdownMenuItem onClick={() => onEdit(u)}>
                <Pencil className="h-4 w-4 mr-2" /> Edit Details
              </DropdownMenuItem>
            )}
            {!u.invitePending && canManageThisUser && (
              <DropdownMenuItem onClick={() => onResetPassword(u._id)}>
                <KeyRound className="h-4 w-4 mr-2" /> Send Password Reset
              </DropdownMenuItem>
            )}
            {canManageThisUser && (
              <>
                <DropdownMenuSeparator />
                {u.isActive ? (
                  <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => onPauseRequest(u)}>
                    <PauseCircle className="h-4 w-4 mr-2" /> Pause Account
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="text-green-700 focus:text-green-700" onClick={() => onToggleActive(u._id, true)}>
                    <PlayCircle className="h-4 w-4 mr-2" /> Reactivate Account
                  </DropdownMenuItem>
                )}
                {viewerRole !== 'deputy_headteacher' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => onDeleteRequest(u)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete User
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
            {!canManageThisUser && (
              <DropdownMenuItem disabled>
                <span className="text-muted-foreground">School admin record is protected</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

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
            className={isReject ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}
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
          <Button size="sm" variant="outline" className="h-8 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => onApprove(leave)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200 hover:bg-red-50" onClick={() => onReject(leave)}>
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
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
              <AlertCircle className="h-4 w-4" />
              {onLeaveToday.length} staff member{onLeaveToday.length !== 1 ? 's' : ''} on leave today
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="flex flex-wrap gap-2">
              {onLeaveToday.map((l) => (
                <span key={l._id} className="text-xs bg-white border border-amber-200 rounded-full px-2.5 py-1 text-amber-800">
                  {staffName(l.staffId)} · {LEAVE_TYPE_MAP[l.leaveType]?.label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leave list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Leave Requests</CardTitle>
              <CardDescription>
                {pendingCount > 0
                  ? `${pendingCount} pending approval`
                  : 'No pending applications'}
              </CardDescription>
            </div>
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
          </div>
        </CardHeader>
        <CardContent>
          {(leaveFilter === 'pending' ? loadingPending : loadingAll) ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
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
        </CardContent>
      </Card>

      <LeaveActionDialog leave={actionLeave} action={actionType} onClose={closeAction} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isDeputy      = user?.role === 'deputy_headteacher';
  const canManageLeave = LEAVE_APPROVER_ROLES.includes(user?.role);
  const roleOptions   = isDeputy ? DEPUTY_MANAGEABLE_ROLES : STAFF_ROLES;

  const [search,       setSearch]      = useState('');
  const [page,         setPage]        = useState(1);
  const [open,         setOpen]        = useState(false);
  const [roleFilter,   setRoleFilter]  = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pauseTarget,  setPauseTarget] = useState(null);
  const [pauseReason,  setPauseReason] = useState('');
  const [editTarget,   setEditTarget]  = useState(null);
  const [editValues,   setEditValues]  = useState({ firstName: '', lastName: '', email: '', role: '', phone: '', tscNumber: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const debouncedSearch = useDebounce(search, 400);

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
    onEdit:          (u)    => { setEditTarget(u); setEditValues({ firstName: u.firstName ?? '', lastName: u.lastName ?? '', email: u.email ?? '', role: u.role ?? '', phone: u.phone ?? '', tscNumber: u.tscNumber ?? '' }); },
    onDeleteRequest: (u)    => setDeleteTarget(u),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Staff ${staffRows.length ? `(${pagination?.total ?? staffRows.length})` : ''}`}
        description={isDeputy ? 'Manage teacher records' : 'Manage teaching and non-teaching staff'}
      >
        <RefreshButton queryKeys={[['users']]} />
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Invite Staff
        </Button>
      </PageHeader>

      <Tabs defaultValue="directory">
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
        </TabsList>

        {/* ── Directory tab ────────────────────────────────────────────────── */}
        <TabsContent value="directory" className="space-y-4 mt-4">

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 py-4 px-5">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <UserCheck className="h-4 w-4 text-green-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{active.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Active</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4 px-5">
                <div className="w-9 h-9 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-yellow-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{pending.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Invite Pending</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4 px-5">
                <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <UserX className="h-4 w-4 text-red-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{paused.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Paused</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email…"
                className="pl-9"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v === '__all__' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All roles</SelectItem>
                {roleOptions.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === '__all__' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="invite">Invite Pending</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={columns({ ...actionHandlers, viewerRole: user?.role })}
            data={staffRows}
            loading={isLoading}
            pageCount={pagination?.totalPages}
            currentPage={page}
            onPageChange={setPage}
          />
        </TabsContent>

        {/* ── Leave tab ────────────────────────────────────────────────────── */}
        {canManageLeave && (
          <TabsContent value="leave" className="mt-4">
            <LeaveTab />
          </TabsContent>
        )}
      </Tabs>

      {/* ── Edit dialog ────────────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Staff Details</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              disabled={updatingUser}
              onClick={() => updateUser({ id: editTarget._id, data: { firstName: editValues.firstName, lastName: editValues.lastName, email: editValues.email, role: editValues.role, phone: editValues.phone || undefined, tscNumber: editValues.tscNumber || undefined } })}
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
          <form onSubmit={handleSubmit(createUser)} className="space-y-4">
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
