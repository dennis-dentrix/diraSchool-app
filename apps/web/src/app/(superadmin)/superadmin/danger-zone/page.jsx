'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { adminApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

// ─── Orphan cleanup card ────────────────────────────────────────────────────

function OrphanCard() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: preview, isLoading: previewLoading, refetch } = useQuery({
    queryKey: ['orphans-preview'],
    queryFn: () => adminApi.previewOrphans().then((r) => r.data.data.counts),
  });

  const totalOrphans = preview
    ? Object.values(preview).reduce((a, b) => a + b, 0)
    : 0;

  const { mutate: purge, isPending } = useMutation({
    mutationFn: () => adminApi.purgeOrphans(),
    onSuccess: (res) => {
      toast.success('Orphaned records deleted.');
      setConfirmOpen(false);
      refetch();
    },
    onError: (err) => showApiError(err),
  });

  return (
    <>
      <Card className="border-orange-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-700">
            <AlertTriangle className="h-5 w-5" />
            Orphaned Records
          </CardTitle>
          <CardDescription>
            Documents that reference schools that no longer exist in the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {previewLoading ? (
            <p className="text-sm text-muted-foreground">Counting orphans…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {preview && Object.entries(preview).map(([model, count]) =>
                count > 0 ? (
                  <div key={model} className="flex items-center justify-between rounded-md bg-orange-50 border border-orange-100 px-3 py-2 text-sm">
                    <span className="text-slate-700">{model}</span>
                    <Badge variant="outline" className="text-orange-700 border-orange-300">{count}</Badge>
                  </div>
                ) : null
              )}
              {totalOrphans === 0 && (
                <p className="col-span-full text-sm text-green-700 font-medium">No orphaned records found.</p>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh count
            </Button>
            {totalOrphans > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete {totalOrphans} orphans
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete orphaned records?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This will permanently delete <strong>{totalOrphans}</strong> records that belong to schools
            no longer in the database. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => purge()} disabled={isPending}>
              {isPending ? 'Deleting…' : 'Yes, delete all orphans'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── School purge card ──────────────────────────────────────────────────────

function SchoolPurgeCard() {
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState(null);
  const [confirmText, setConfirmText] = useState('');

  const { data: schools, isLoading } = useQuery({
    queryKey: ['admin-schools-purge'],
    queryFn: () => adminApi.listSchools({ limit: 200 }).then((r) => r.data.data.schools),
  });

  const { mutate: purge, isPending } = useMutation({
    mutationFn: (id) => adminApi.purgeSchool(id),
    onSuccess: (res, id) => {
      toast.success(res.data.data.message);
      setTarget(null);
      setConfirmText('');
    },
    onError: (err) => showApiError(err),
  });

  const filtered = (schools ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = {
    trial: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800',
  };

  return (
    <>
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <Trash2 className="h-5 w-5" />
            Delete School &amp; All Data
          </CardTitle>
          <CardDescription>
            Permanently deletes a school and every record associated with it across all collections.
            Use this only for test schools.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search schools…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading schools…</p>
          ) : (
            <div className="divide-y rounded-md border border-slate-200 max-h-80 overflow-y-auto">
              {filtered.map((school) => (
                <div key={school._id} className="flex items-center justify-between px-3 py-2.5 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{school.name}</p>
                    <p className="text-xs text-muted-foreground">{school.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[school.subscriptionStatus] ?? 'bg-gray-100 text-gray-700'}`}>
                      {school.subscriptionStatus}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400"
                      onClick={() => { setTarget(school); setConfirmText(''); }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-sm text-center text-muted-foreground">No schools match.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(open) => { if (!open) setTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Delete "{target?.name}"?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              This will <strong>permanently delete</strong> this school and all associated data —
              students, classes, fees, attendance, results, report cards, users, SMS logs, and more.
            </p>
            <p>Type <strong>{target?.name}</strong> to confirm:</p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={target?.name}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirmText !== target?.name || isPending}
              onClick={() => purge(target._id)}
            >
              {isPending ? 'Deleting…' : 'Permanently delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function DangerZonePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Danger Zone"
        description="Destructive operations for cleaning up test data. These actions are irreversible."
      />

      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
        <p className="text-sm text-red-700">
          All operations on this page are <strong>permanent and cannot be undone</strong>.
          Only use this page on test data you no longer need.
        </p>
      </div>

      <OrphanCard />
      <SchoolPurgeCard />
    </div>
  );
}
