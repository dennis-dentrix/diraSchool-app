'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, MoreHorizontal, GraduationCap, Users, ShieldOff, ShieldCheck, AlertTriangle, CheckCircle2, Ban, Plus, ClipboardList, ChevronLeft, ChevronRight } from 'lucide-react';
import { adminApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';

const planColors = {
  trial: 'bg-yellow-100 text-yellow-800',
  basic: 'bg-blue-100 text-blue-800',
  standard: 'bg-purple-100 text-purple-800',
  premium: 'bg-green-100 text-green-800',
};

const statusColors = {
  trial: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-800',
};

const CREATE_FORM_INIT = {
  name: '',
  email: '',
  phone: '',
  county: '',
  constituency: '',
  registrationNumber: '',
  address: '',
  adminFirstName: '',
  adminLastName: '',
  adminEmail: '',
  adminPhone: '',
};

export default function SuperadminSchoolsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [subOpen, setSubOpen] = useState(false);
  const [disableTarget, setDisableTarget] = useState(null);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [subForm, setSubForm] = useState({ planTier: '', subscriptionStatus: '', trialExpiry: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(CREATE_FORM_INIT);
  const [logsSchool, setLogsSchool] = useState(null);
  const [logsPage, setLogsPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['sa-schools-list', page, search, statusFilter, activeFilter],
    queryFn: async () => {
      const res = await adminApi.listSchools({
        page, limit: 20,
        search: search || undefined,
        status: statusFilter || undefined,
        active: activeFilter || undefined,
      });
      return res.data;
    },
  });

  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['sa-school-audit-logs', logsSchool?._id, logsPage],
    queryFn: () => adminApi.auditLogs({ schoolId: logsSchool._id, page: logsPage, limit: 20 }).then((r) => r.data),
    enabled: !!logsSchool,
  });

  const { mutate: updateSub, isPending } = useMutation({
    mutationFn: ({ id, data }) => adminApi.updateSchoolStatus(id, data),
    onSuccess: () => {
      toast.success('Updated');
      queryClient.invalidateQueries({ queryKey: ['sa-schools-list'] });
      setSubOpen(false);
      setDisableTarget(null);
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: createSchool, isPending: isCreating } = useMutation({
    mutationFn: (data) => adminApi.createSchool(data),
    onSuccess: (res) => {
      toast.success(res.data?.message ?? 'School registered successfully');
      queryClient.invalidateQueries({ queryKey: ['sa-schools-list'] });
      setCreateOpen(false);
      setCreateForm(CREATE_FORM_INIT);
    },
    onError: (err) => showApiError(err),
  });

  function openLogs(school) {
    setLogsSchool(school);
    setLogsPage(1);
  }

  function openSubDialog(school) {
    setSelectedSchool(school);
    setSubForm({
      planTier: school.planTier ?? 'standard',
      subscriptionStatus: school.subscriptionStatus ?? 'active',
      trialExpiry: school.trialExpiry ? new Date(school.trialExpiry).toISOString().slice(0, 10) : '',
    });
    setSubOpen(true);
  }

  const columns = [
    {
      id: 'school',
      header: 'School',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.county ?? '—'} · {row.original.email ?? '—'}</p>
        </div>
      ),
    },
    {
      id: 'plan',
      header: 'Plan / Status',
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize w-fit ${planColors[row.original.planTier] ?? 'bg-gray-100 text-gray-800'}`}>
            {row.original.planTier ?? 'standard'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize w-fit ${statusColors[row.original.subscriptionStatus] ?? 'bg-gray-100 text-gray-800'}`}>
            {row.original.subscriptionStatus ?? 'active'}
          </span>
          {row.original.deactivationRequest?.status === 'pending' && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium w-fit bg-orange-100 text-orange-800">
              Deactivation requested
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'account',
      header: 'Account',
      cell: ({ row }) => row.original.isActive !== false
        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Enabled</span>
        : <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium"><Ban className="h-3.5 w-3.5" /> Disabled</span>,
    },
    {
      id: 'counts',
      header: 'Staff / Students',
      cell: ({ row }) => (
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />{row.original.staffCount ?? '—'}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <GraduationCap className="h-3.5 w-3.5" />{row.original.studentCount ?? '—'}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Registered',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const s = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/superadmin/schools/${s._id}`)}>View Details</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openSubDialog(s)}>Manage Subscription</DropdownMenuItem>
              <DropdownMenuItem onClick={() => openLogs(s)}>
                <ClipboardList className="h-4 w-4 mr-2" /> View Logs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {s.isActive !== false ? (
                <DropdownMenuItem className="text-red-600 focus:text-red-600" onClick={() => setDisableTarget(s)}>
                  <ShieldOff className="h-4 w-4 mr-2" /> Disable School
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="text-emerald-700 focus:text-emerald-700"
                  onClick={() => updateSub({ id: s._id, data: { isActive: true } })}>
                  <ShieldCheck className="h-4 w-4 mr-2" /> Re-enable School
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const schools = data?.schools ?? data?.data ?? [];
  const pagination = data?.pagination ?? data?.meta;

  return (
    <div>
      <PageHeader
        title={`Schools ${pagination?.total ? `(${pagination.total})` : ''}`}
        description="All registered schools on the platform"
      >
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Register School
        </Button>
      </PageHeader>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search schools…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v === '__all__' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All statuses</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v === '__all__' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Account" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All accounts</SelectItem>
            <SelectItem value="true">Enabled</SelectItem>
            <SelectItem value="false">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={schools}
        loading={isLoading}
        pageCount={pagination?.totalPages}
        currentPage={page}
        onPageChange={setPage}
      />

      {/* ── Register school dialog ───────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setCreateForm(CREATE_FORM_INIT); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Register New School</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <p className="col-span-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">School account</p>
              <div className="col-span-2 space-y-1.5">
                <Label>School Name *</Label>
                <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Nairobi Academy" />
              </div>
              <div className="space-y-1.5">
                <Label>Email Address *</Label>
                <Input type="email" value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} placeholder="info@school.ac.ke" />
              </div>
              <div className="space-y-1.5">
                <Label>Phone *</Label>
                <Input value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+254 700 000000" />
              </div>
              <div className="space-y-1.5">
                <Label>County</Label>
                <Input value={createForm.county} onChange={(e) => setCreateForm((p) => ({ ...p, county: e.target.value }))} placeholder="e.g. Nairobi" />
              </div>
              <div className="space-y-1.5">
                <Label>Constituency</Label>
                <Input value={createForm.constituency} onChange={(e) => setCreateForm((p) => ({ ...p, constituency: e.target.value }))} placeholder="e.g. Westlands" />
              </div>
              <div className="space-y-1.5">
                <Label>MOE Registration No.</Label>
                <Input value={createForm.registrationNumber} onChange={(e) => setCreateForm((p) => ({ ...p, registrationNumber: e.target.value }))} placeholder="e.g. NRB/001/2024" />
              </div>
              <div className="space-y-1.5">
                <Label>Physical Address</Label>
                <Input value={createForm.address} onChange={(e) => setCreateForm((p) => ({ ...p, address: e.target.value }))} placeholder="P.O Box 123, Nairobi" />
              </div>
              <p className="col-span-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground pt-2">School admin login</p>
              <div className="space-y-1.5">
                <Label>Admin First Name *</Label>
                <Input value={createForm.adminFirstName} onChange={(e) => setCreateForm((p) => ({ ...p, adminFirstName: e.target.value }))} placeholder="Mary" />
              </div>
              <div className="space-y-1.5">
                <Label>Admin Last Name *</Label>
                <Input value={createForm.adminLastName} onChange={(e) => setCreateForm((p) => ({ ...p, adminLastName: e.target.value }))} placeholder="Wanjiku" />
              </div>
              <div className="space-y-1.5">
                <Label>Admin Email *</Label>
                <Input type="email" value={createForm.adminEmail} onChange={(e) => setCreateForm((p) => ({ ...p, adminEmail: e.target.value }))} placeholder="admin@school.ac.ke" />
              </div>
              <div className="space-y-1.5">
                <Label>Admin Phone</Label>
                <Input value={createForm.adminPhone} onChange={(e) => setCreateForm((p) => ({ ...p, adminPhone: e.target.value }))} placeholder="+254 700 000000" />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                The school admin will receive an invitation email and set their own password before logging in.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={
                isCreating ||
                !createForm.name ||
                !createForm.email ||
                !createForm.phone ||
                !createForm.adminFirstName ||
                !createForm.adminLastName ||
                !createForm.adminEmail
              }
              onClick={() => createSchool({
                name: createForm.name,
                email: createForm.email,
                phone: createForm.phone,
                county: createForm.county || undefined,
                constituency: createForm.constituency || undefined,
                registrationNumber: createForm.registrationNumber || undefined,
                address: createForm.address || undefined,
                adminFirstName: createForm.adminFirstName,
                adminLastName: createForm.adminLastName,
                adminEmail: createForm.adminEmail,
                adminPhone: createForm.adminPhone || undefined,
              })}
            >
              {isCreating ? 'Registering…' : 'Register School'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Disable confirmation dialog ───────────────────────────────────── */}
      <Dialog open={!!disableTarget} onOpenChange={() => setDisableTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Disable School Account
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Disabling <span className="font-semibold text-foreground">{disableTarget?.name}</span> will immediately:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
            <li>Block all staff from logging in</li>
            <li>Deactivate all staff user accounts</li>
            <li>Preserve all school data intact</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableTarget(null)}>Cancel</Button>
            <Button variant="destructive" disabled={isPending}
              onClick={() => updateSub({ id: disableTarget._id, data: { isActive: false } })}>
              Disable School
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Audit logs sheet ─────────────────────────────────────────────── */}
      <Sheet open={!!logsSchool} onOpenChange={(v) => { if (!v) setLogsSchool(null); }}>
        <SheetContent side="right" className="w-full max-w-2xl flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Audit Logs — {logsSchool?.name}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {logsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : !logsData?.logs?.length ? (
              <p className="text-sm text-muted-foreground text-center py-12">No audit logs found for this school.</p>
            ) : (
              <div className="space-y-2">
                {logsData.logs.map((log) => (
                  <div key={log._id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="capitalize text-xs">{log.action}</Badge>
                        <span className="font-medium">{log.resource}</span>
                        {log.resourceId && (
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">{String(log.resourceId)}</span>
                        )}
                      </div>
                      {log.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{log.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {log.userId && (
                          <span>{log.userId.firstName} {log.userId.lastName} · <span className="capitalize">{log.userId.role}</span></span>
                        )}
                        <span>·</span>
                        <span>{formatDate(log.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {logsData?.meta?.totalPages > 1 && (
            <div className="border-t px-6 py-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {logsData.meta.page} of {logsData.meta.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={logsPage <= 1} onClick={() => setLogsPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={logsPage >= logsData.meta.totalPages} onClick={() => setLogsPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Subscription quick-edit dialog ────────────────────────────────── */}
      <Dialog open={subOpen} onOpenChange={setSubOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Subscription — {selectedSchool?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Plan Tier</Label>
              <Select value={subForm.planTier} onValueChange={(v) => setSubForm((p) => ({ ...p, planTier: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subscription Status</Label>
              <Select value={subForm.subscriptionStatus} onValueChange={(v) => setSubForm((p) => ({ ...p, subscriptionStatus: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Trial Expiry</Label>
              <input
                type="date"
                value={subForm.trialExpiry}
                onChange={(e) => setSubForm((p) => ({ ...p, trialExpiry: e.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubOpen(false)}>Cancel</Button>
            <Button
              disabled={isPending}
              onClick={() => updateSub({
                id: selectedSchool._id,
                data: { planTier: subForm.planTier, subscriptionStatus: subForm.subscriptionStatus, trialExpiry: subForm.trialExpiry || undefined },
              })}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
