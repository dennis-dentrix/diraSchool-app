'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone, Plus, Pencil, Trash2, Send, Calendar, CheckCircle2,
  AlertTriangle, Wrench, Zap, Info, Clock,
} from 'lucide-react';
import { adminApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const EVENT_TYPES = [
  { value: 'announcement', label: 'Announcement', icon: Megaphone, color: 'text-ok border-ok/30 bg-ok/5' },
  { value: 'update',       label: 'System Update', icon: Zap,       color: 'text-blue-600 border-blue-300 bg-blue-50' },
  { value: 'maintenance',  label: 'Maintenance',   icon: Wrench,    color: 'text-amber-600 border-amber-300 bg-amber-50' },
  { value: 'outage',       label: 'Service Outage', icon: AlertTriangle, color: 'text-destructive border-destructive/30 bg-destructive/5' },
  { value: 'other',        label: 'Other',          icon: Info,     color: 'text-muted-foreground border-border bg-muted/30' },
];

function typeConfig(type) {
  return EVENT_TYPES.find((t) => t.value === type) ?? EVENT_TYPES[4];
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Event Form Dialog ─────────────────────────────────────────────────────────

const EMPTY_FORM = { title: '', body: '', type: 'announcement', scheduledAt: '', status: 'draft' };

function EventFormDialog({ open, onOpenChange, initial, onSave }) {
  const [form, setForm] = useState(
    initial
      ? {
          title: initial.title,
          body: initial.body,
          type: initial.type,
          scheduledAt: initial.scheduledAt ? new Date(initial.scheduledAt).toISOString().slice(0, 16) : '',
          status: initial.status,
        }
      : { ...EMPTY_FORM },
  );
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setVal = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (!form.body.trim()) { toast.error('Body / message is required'); return; }
    setSaving(true);
    try {
      await onSave({
        ...form,
        scheduledAt: form.scheduledAt || undefined,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Event' : 'New System Event'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. Scheduled maintenance on 25 May 2026"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={setVal('type')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={setVal('status')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Scheduled date / time (optional)</Label>
            <Input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} />
            <p className="text-[11px] text-muted-foreground">When is the event expected to happen? Shown in the email.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Message *</Label>
            <Textarea
              rows={5}
              value={form.body}
              onChange={set('body')}
              placeholder="Describe the event, what users should expect, and any actions they need to take…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : (initial ? 'Save changes' : 'Create event')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Broadcast Dialog ──────────────────────────────────────────────────────────

function BroadcastDialog({ event, open, onOpenChange, onBroadcast }) {
  const [sendEmail, setSendEmail] = useState(true);
  const [sendNotif, setSendNotif] = useState(true);
  const [sending, setSending] = useState(false);

  const handle = async () => {
    if (!sendEmail && !sendNotif) { toast.error('Select at least one channel'); return; }
    setSending(true);
    try {
      await onBroadcast({ sendEmail, sendNotification: sendNotif });
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  if (!event) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Broadcast Event</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Send <strong>"{event.title}"</strong> to all school admins across the platform.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="h-4 w-4" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground">Send to every school admin's registered email</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={sendNotif} onChange={(e) => setSendNotif(e.target.checked)} className="h-4 w-4" />
              <div>
                <p className="text-sm font-medium">In-app notification</p>
                <p className="text-xs text-muted-foreground">Push a notification bell alert to all school admins</p>
              </div>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handle} disabled={sending} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            {sending ? 'Sending…' : 'Send broadcast'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Event Card ────────────────────────────────────────────────────────────────

function EventCard({ event, onEdit, onDelete, onBroadcast }) {
  const cfg = typeConfig(event.type);
  const Icon = cfg.icon;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg border shrink-0 mt-0.5', cfg.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="text-sm font-semibold leading-snug">{event.title}</h3>
            <Badge variant="outline" className={cn('text-[10px] shrink-0', cfg.color)}>{cfg.label}</Badge>
            {event.status === 'published' ? (
              <Badge variant="outline" className="text-[10px] shrink-0 text-ok border-ok/30 bg-ok/5">
                <CheckCircle2 className="h-2.5 w-2.5 mr-1" />Published
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground">Draft</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{event.body}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onBroadcast(event)} title="Broadcast">
            <Send className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(event)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(event)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground border-t pt-2.5">
        {event.scheduledAt && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {fmtDate(event.scheduledAt)}
          </span>
        )}
        {event.broadcastAt && (
          <span className="flex items-center gap-1">
            <Send className="h-3 w-3" />
            Sent to {event.recipientCount} admin{event.recipientCount !== 1 ? 's' : ''} · {fmtDate(event.broadcastAt)}
          </span>
        )}
        {!event.broadcastAt && (
          <span className="flex items-center gap-1 text-amber-500">
            <Clock className="h-3 w-3" />
            Not yet broadcast
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SystemEventsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [broadcastTarget, setBroadcastTarget] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-system-events'],
    queryFn: async () => {
      const res = await adminApi.listSystemEvents({ limit: 50 });
      return res.data?.events ?? [];
    },
    staleTime: 30_000,
  });

  const events = Array.isArray(data) ? data : [];

  const createMutation = useMutation({
    mutationFn: (form) => adminApi.createSystemEvent(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-system-events'] }); toast.success('Event created.'); },
    onError: (err) => showApiError(err),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }) => adminApi.updateSystemEvent(id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-system-events'] }); toast.success('Event updated.'); setEditTarget(null); },
    onError: (err) => showApiError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => adminApi.deleteSystemEvent(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-system-events'] }); toast.success('Event deleted.'); setDeleteTarget(null); },
    onError: (err) => showApiError(err),
  });

  const broadcastMutation = useMutation({
    mutationFn: ({ id, data }) => adminApi.broadcastSystemEvent(id, data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-system-events'] });
      toast.success(res.data?.message ?? 'Broadcast sent.');
      setBroadcastTarget(null);
    },
    onError: (err) => showApiError(err),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Events"
        description="Communicate platform updates, maintenance windows, and announcements to all school admins."
      >
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New event
        </Button>
      </PageHeader>

      {/* Type legend */}
      <div className="flex flex-wrap gap-2">
        {EVENT_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <span key={t.value} className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border', t.color)}>
              <Icon className="h-3 w-3" />{t.label}
            </span>
          );
        })}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      )}

      {!isLoading && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-lg bg-muted/20">
          <Megaphone className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">No system events yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Create an event to communicate updates, maintenance windows, or announcements to school admins.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Create first event
          </Button>
        </div>
      )}

      {!isLoading && events.length > 0 && (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard
              key={event._id}
              event={event}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onBroadcast={setBroadcastTarget}
            />
          ))}
        </div>
      )}

      <EventFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(form) => createMutation.mutateAsync(form)}
      />

      {editTarget && (
        <EventFormDialog
          open={!!editTarget}
          onOpenChange={(v) => !v && setEditTarget(null)}
          initial={editTarget}
          onSave={(form) => updateMutation.mutateAsync({ id: editTarget._id, form })}
        />
      )}

      <BroadcastDialog
        event={broadcastTarget}
        open={!!broadcastTarget}
        onOpenChange={(v) => !v && setBroadcastTarget(null)}
        onBroadcast={(opts) => broadcastMutation.mutateAsync({ id: broadcastTarget._id, data: opts })}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the event. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate(deleteTarget._id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
