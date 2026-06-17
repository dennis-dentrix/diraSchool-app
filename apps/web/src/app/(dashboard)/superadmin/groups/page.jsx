'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, Pencil, Trash2, School, Users, ChevronRight, X } from 'lucide-react';
import { adminApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status) {
  switch (status) {
    case 'active':  return 'bg-ok/15 text-ok border-ok/20';
    case 'trial':   return 'bg-amber-500/15 text-amber-600 border-amber-500/20';
    case 'suspended': return 'bg-destructive/10 text-destructive border-destructive/20';
    default:        return 'bg-muted text-muted-foreground border-border';
  }
}

const pricingToForm = (pricing = {}) => ({
  enabled: Boolean(pricing.enabled),
  baseFee: pricing.baseFee ?? 12000,
  perStudentRate: pricing.perStudentRate ?? 55,
  agreementReference: pricing.agreementReference ?? '',
  startsAt: pricing.startsAt ? new Date(pricing.startsAt).toISOString().slice(0, 10) : '',
  expiresAt: pricing.expiresAt ? new Date(pricing.expiresAt).toISOString().slice(0, 10) : '',
  notes: pricing.notes ?? '',
});

// ── Group Form Dialog ─────────────────────────────────────────────────────────

function UserSearchPicker({ onSelect }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const { data, isFetching } = useQuery({
    queryKey: ['admin-users-picker', search],
    queryFn: async () => {
      const res = await adminApi.listUsers({ search, limit: 10 });
      return res.data?.users ?? res.data?.data ?? [];
    },
    enabled: search.length >= 2,
    staleTime: 30_000,
  });

  const users = Array.isArray(data) ? data : [];

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (user) => {
    onSelect(user);
    setSearch('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Search registered users…"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => search.length >= 2 && setOpen(true)}
      />
      {open && search.length >= 2 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {isFetching && (
            <p className="text-xs text-muted-foreground px-3 py-2">Searching…</p>
          )}
          {!isFetching && users.length === 0 && (
            <p className="text-xs text-muted-foreground px-3 py-2">No users found.</p>
          )}
          {users.map((u) => (
            <button
              key={u._id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(u); }}
            >
              <span className="font-medium">{u.firstName} {u.lastName}</span>
              <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
              {u.role && <span className="text-[10px] text-muted-foreground ml-1 capitalize">· {u.role.replace(/_/g, ' ')}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupFormDialog({ open, onOpenChange, initial, onSave }) {
  const [form, setForm] = useState(
    initial
      ? { ...initial, pricingAgreement: pricingToForm(initial.pricingAgreement) }
      : { name: '', notes: '', contactPerson: '', contactEmail: '', pricingAgreement: pricingToForm() }
  );
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setPricing = (key) => (e) => {
    const value = key === 'enabled' ? e.target.checked : e.target.value;
    setForm((f) => ({
      ...f,
      pricingAgreement: { ...f.pricingAgreement, [key]: value },
    }));
  };

  const handleUserSelect = (user) => {
    setForm((f) => ({
      ...f,
      contactPerson: `${user.firstName} ${user.lastName}`.trim(),
      contactEmail: user.email ?? f.contactEmail,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Group name is required'); return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        pricingAgreement: {
          ...form.pricingAgreement,
          baseFee: Number(form.pricingAgreement.baseFee),
          perStudentRate: Number(form.pricingAgreement.perStudentRate),
          startsAt: form.pricingAgreement.startsAt || undefined,
          expiresAt: form.pricingAgreement.expiresAt || undefined,
        },
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Group' : 'New Billing Group'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Group name *</Label>
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Greenfield Schools Group" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Contact person</Label>
            <p className="text-[11px] text-muted-foreground -mt-0.5">Search a registered user or type manually below</p>
            <UserSearchPicker onSelect={handleUserSelect} />
            <Input value={form.contactPerson} onChange={set('contactPerson')} placeholder="e.g. John Kamau" />
          </div>
          <div className="space-y-1.5">
            <Label>Contact email</Label>
            <Input type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="billing@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={set('notes')} placeholder="Internal notes about this agreement…" rows={3} />
          </div>
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Custom pricing</p>
                <p className="text-xs text-muted-foreground">Applied to every school in this group unless a school has its own override.</p>
              </div>
              <input
                type="checkbox"
                checked={form.pricingAgreement.enabled}
                onChange={setPricing('enabled')}
                className="h-4 w-4"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Base fee</Label>
                <Input type="number" min="0" value={form.pricingAgreement.baseFee} onChange={setPricing('baseFee')} />
              </div>
              <div className="space-y-1.5">
                <Label>Per student</Label>
                <Input type="number" min="0" value={form.pricingAgreement.perStudentRate} onChange={setPricing('perStudentRate')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Agreement reference</Label>
              <Input value={form.pricingAgreement.agreementReference} onChange={setPricing('agreementReference')} placeholder="e.g. GROUP-MOU-2026" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : (initial ? 'Save changes' : 'Create group')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add School Dialog ─────────────────────────────────────────────────────────

function AddSchoolDialog({ open, onOpenChange, groupId, existingSchoolIds }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-schools-picker', search],
    queryFn: async () => {
      const res = await adminApi.listSchools({ search, limit: 20 });
      return res.data?.schools ?? res.data?.data ?? res.data ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const schools = Array.isArray(data) ? data : [];
  const available = schools.filter((s) => !existingSchoolIds.includes(s._id));

  const add = async (schoolId) => {
    setAdding(schoolId);
    try {
      await adminApi.addSchoolToGroup(groupId, schoolId);
      await qc.invalidateQueries({ queryKey: ['admin-groups'] });
      toast.success('School added to group.');
    } catch (err) {
      showApiError(err);
    } finally {
      setAdding(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add school to group</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <Input
            placeholder="Search schools…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
            {isLoading && (
              <div className="space-y-2 py-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
              </div>
            )}
            {!isLoading && available.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                {search ? 'No matching schools found.' : 'All schools are already in a group.'}
              </p>
            )}
            {available.map((school) => (
              <div key={school._id} className="flex items-center gap-3 px-3 py-2 rounded-md border bg-card hover:bg-muted/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{school.name}</p>
                  <p className="text-xs text-muted-foreground">{school.county} · {school.email}</p>
                </div>
                <Badge variant="outline" className={cn('text-[10px] shrink-0', statusColor(school.subscriptionStatus))}>
                  {school.subscriptionStatus}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 text-xs"
                  disabled={adding === school._id}
                  onClick={() => add(school._id)}
                >
                  {adding === school._id ? 'Adding…' : 'Add'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Group Card ────────────────────────────────────────────────────────────────

function GroupCard({ group, onEdit, onDelete }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const existingIds = group.schools?.map((s) => s._id) ?? [];

  const removeSchool = async (schoolId) => {
    setRemovingId(schoolId);
    try {
      await adminApi.removeSchoolFromGroup(group._id, schoolId);
      await qc.invalidateQueries({ queryKey: ['admin-groups'] });
      toast.success('School removed from group.');
    } catch (err) {
      showApiError(err);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
          <Layers className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold">{group.name}</h3>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md font-mono">
              {group.schools?.length ?? 0} {group.schools?.length === 1 ? 'school' : 'schools'}
            </span>
            {group.pricingAgreement?.enabled && (
              <Badge variant="outline" className="text-[10px] border-ok/30 text-ok bg-ok/5">
                Custom pricing
              </Badge>
            )}
          </div>
          {group.contactPerson && (
            <p className="text-xs text-muted-foreground mt-0.5">{group.contactPerson}{group.contactEmail ? ` · ${group.contactEmail}` : ''}</p>
          )}
          {group.notes && (
            <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{group.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(group)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(group)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Schools section */}
      <div className="border-t px-4 pb-3">
        <button
          type="button"
          className="flex items-center gap-1.5 pt-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
          onClick={() => setExpanded((v) => !v)}
        >
          <School className="h-3.5 w-3.5" />
          Member schools
          <ChevronRight className={cn('h-3.5 w-3.5 ml-auto transition-transform', expanded && 'rotate-90')} />
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5">
            {(group.schools ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground py-1">No schools in this group yet.</p>
            )}
            {(group.schools ?? []).map((school) => (
              <div key={school._id} className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/40">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{school.name}</p>
                  <p className="text-[11px] text-muted-foreground">{school.county}</p>
                </div>
                <Badge variant="outline" className={cn('text-[10px] shrink-0', statusColor(school.subscriptionStatus))}>
                  {school.subscriptionStatus}
                </Badge>
                <button
                  type="button"
                  disabled={removingId === school._id}
                  onClick={() => removeSchool(school._id)}
                  className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove from group"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs mt-1"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add school
            </Button>
          </div>
        )}
      </div>

      <AddSchoolDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        groupId={group._id}
        existingSchoolIds={existingIds}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingGroupsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: async () => {
      const res = await adminApi.listGroups();
      return res.data?.groups ?? res.data?.data ?? res.data ?? [];
    },
    staleTime: 30_000,
  });

  const groups = Array.isArray(data) ? data : [];

  const createMutation = useMutation({
    mutationFn: (form) => adminApi.createGroup(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-groups'] });
      toast.success('Group created.');
    },
    onError: (err) => showApiError(err),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }) => adminApi.updateGroup(id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-groups'] });
      toast.success('Group updated.');
      setEditTarget(null);
    },
    onError: (err) => showApiError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => adminApi.deleteGroup(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-groups'] });
      toast.success('Group deleted.');
      setDeleteTarget(null);
    },
    onError: (err) => showApiError(err),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing Groups"
        description="Group multiple school branches under a single shared subscription."
      >
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New group
        </Button>
      </PageHeader>

      {/* Stats strip */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Layers className="h-4 w-4" />
          <strong className="text-foreground">{groups.length}</strong> group{groups.length !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          <strong className="text-foreground">
            {groups.reduce((sum, g) => sum + (g.schools?.length ?? 0), 0)}
          </strong> schools in groups
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      )}

      {/* Empty */}
      {!isLoading && groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg bg-muted/20">
          <Layers className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">No billing groups yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Create a group to allow multiple school branches to share a single subscription payment.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create first group
          </Button>
        </div>
      )}

      {/* Groups grid */}
      {!isLoading && groups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((group) => (
            <GroupCard
              key={group._id}
              group={group}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <GroupFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(form) => createMutation.mutateAsync(form)}
      />

      {/* Edit dialog */}
      {editTarget && (
        <GroupFormDialog
          open={!!editTarget}
          onOpenChange={(v) => !v && setEditTarget(null)}
          initial={editTarget}
          onSave={(form) => updateMutation.mutateAsync({ id: editTarget._id, form })}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the group. The {deleteTarget?.schools?.length ?? 0} member school(s) will be detached and billed individually. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(deleteTarget._id)}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
