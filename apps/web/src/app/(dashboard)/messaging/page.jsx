'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  MessageSquare, Send, Users, User, Clock,
  CheckCircle2, AlertCircle, Loader2, School, Search, X, FlaskConical,
  Sparkles, Wallet,
} from 'lucide-react';
import { smsApi, classesApi, studentsApi, usersApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const MAX_CHARS = 480;
const SMS_SEGMENT = 160;

function CharCounter({ text }) {
  const len = text?.length ?? 0;
  const segments = Math.max(1, Math.ceil(len / SMS_SEGMENT));
  const color = len > MAX_CHARS ? 'text-destructive' : len > 300 ? 'text-warn' : 'text-muted-foreground';
  return (
    <p className={`text-xs ${color} text-right`}>
      {len}/{MAX_CHARS} · {segments} SMS segment{segments !== 1 ? 's' : ''}
    </p>
  );
}

function StatusBadge({ status }) {
  const map = {
    queued: { label: 'Queued', className: 'bg-muted text-muted-foreground border-border', icon: Clock },
    sent: { label: 'Sent', className: 'bg-ok/8 text-ok border-ok/30', icon: CheckCircle2 },
    partial: { label: 'Partial', className: 'bg-warn/8 text-warn border-warn/30', icon: AlertCircle },
    failed: { label: 'Failed', className: 'bg-bad/8 text-bad border-bad/30', icon: AlertCircle },
  };
  const { label, className, icon: Icon } = map[status] ?? map.queued;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      <Icon className="h-3 w-3" aria-hidden /> {label}
    </span>
  );
}

// ── Contact search — searches students (guardian phones) + staff ──────────────
function ContactSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const trimmed = query.trim();

  const { data: studentResults = [], isFetching: fetchingStudents } = useQuery({
    queryKey: ['contact-search-students', trimmed],
    queryFn: async () => {
      const res = await studentsApi.list({ search: trimmed, limit: 8, status: 'active' });
      return res.data?.students ?? res.data?.data ?? [];
    },
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
  });

  const { data: staffResults = [], isFetching: fetchingStaff } = useQuery({
    queryKey: ['contact-search-staff', trimmed],
    queryFn: async () => {
      const res = await usersApi.list({ search: trimmed, limit: 6 });
      return res.data?.users ?? res.data?.data ?? [];
    },
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
  });

  const isFetching = fetchingStudents || fetchingStaff;

  // Build flat contact list: guardians from students + staff
  const contacts = [];
  for (const s of studentResults) {
    for (const g of (s.guardians ?? [])) {
      if (g.phone) {
        contacts.push({
          id: `${s._id}-${g.phone}`,
          name: g.name ?? `${s.firstName} ${s.lastName}'s guardian`,
          sub: `Parent/Guardian · ${s.firstName} ${s.lastName}`,
          phone: g.phone,
        });
      }
    }
  }
  for (const u of staffResults) {
    if (u.phone) {
      contacts.push({
        id: u._id,
        name: `${u.firstName} ${u.lastName}`,
        sub: `Staff · ${u.role?.replace(/_/g, ' ')}`,
        phone: u.phone,
      });
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (contact) => {
    onSelect(contact.phone);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name to find a contact…"
          value={query}
          className="pl-8 pr-8"
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => trimmed.length >= 2 && setOpen(true)}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setOpen(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && trimmed.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
          {isFetching && contacts.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : contacts.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">No contacts found.</p>
          ) : (
            <ul className="max-h-56 overflow-y-auto divide-y">
              {contacts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelect(c); }}
                    className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
                  >
                    <p className="text-sm font-medium leading-tight">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.sub} · {c.phone}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Single message tab ────────────────────────────────────────────────────────
function SingleMessageTab() {
  const [form, setForm] = useState({ to: '', message: '' });

  const { mutate: send, isPending } = useMutation({
    mutationFn: () => smsApi.send(form),
    onSuccess: () => {
      toast.success('Message queued — will be delivered shortly');
      setForm({ to: '', message: '' });
    },
    onError: (err) => showApiError(err),
  });

  const valid = form.to.trim().length >= 7 && form.message.trim().length > 0 && form.message.length <= MAX_CHARS;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Send to Individual</CardTitle>
        </div>
        <CardDescription>
          Send a direct SMS to a parent, guardian, or staff member by phone number.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contact search */}
        <div className="space-y-1.5">
          <Label>Search Contact</Label>
          <ContactSearch onSelect={(phone) => setForm((p) => ({ ...p, to: phone }))} />
          <p className="text-xs text-muted-foreground">Type a name to find a guardian or staff member and auto-fill their number.</p>
        </div>

        {/* Phone input */}
        <div className="space-y-1.5">
          <Label>Recipient Phone Number</Label>
          <Input
            placeholder="0722 123 456 or +254722123456"
            value={form.to}
            onChange={(e) => setForm((p) => ({ ...p, to: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">Kenyan mobile number (Safaricom, Airtel, Telkom)</p>
        </div>

        {/* Message */}
        <div className="space-y-1.5">
          <Label>Message</Label>
          <Textarea
            placeholder="Type your message here…"
            rows={4}
            value={form.message}
            onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
          />
          <CharCounter text={form.message} />
        </div>

        <Button onClick={() => send()} disabled={!valid || isPending} className="w-full sm:w-auto">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isPending ? 'Sending…' : 'Send Message'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Broadcast tab ─────────────────────────────────────────────────────────────
function BroadcastTab() {
  const [form, setForm] = useState({ target: '', classId: '', message: '' });
  const queryClient = useQueryClient();

  const { data: classes = [] } = useQuery({
    queryKey: ['classes-list'],
    queryFn: async () => {
      const res = await classesApi.list();
      return res.data?.classes ?? [];
    },
  });

  const { mutate: send, isPending } = useMutation({
    mutationFn: () => smsApi.broadcast({
      target: form.target,
      ...(form.target === 'class_parents' && form.classId ? { classId: form.classId } : {}),
      message: form.message,
    }),
    onSuccess: (res) => {
      const count = res.data?.recipientCount ?? res.recipientCount;
      toast.success(`Broadcast queued for ${count} recipient${count !== 1 ? 's' : ''}`);
      setForm({ target: '', classId: '', message: '' });
      queryClient.invalidateQueries({ queryKey: ['sms-history'] });
    },
    onError: (err) => showApiError(err),
  });

  const targets = [
    { value: 'class_parents', label: 'Class Parents', icon: School, desc: 'All parents/guardians of students in a specific class' },
    { value: 'all_parents', label: 'All Parents', icon: Users, desc: 'All parents and guardians school-wide' },
    { value: 'all_staff', label: 'All Staff', icon: Users, desc: 'All active staff members with a registered phone' },
  ];

  const needsClass = form.target === 'class_parents';
  const valid =
    form.target &&
    (!needsClass || form.classId) &&
    form.message.trim().length > 0 &&
    form.message.length <= MAX_CHARS;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Bulk Broadcast</CardTitle>
        </div>
        <CardDescription>
          Send the same message to a group. Duplicate numbers are removed automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Target selector */}
        <div className="space-y-1.5">
          <Label>Recipient Group</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {targets.map(({ value, label, icon: Icon, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((p) => ({ ...p, target: value, classId: '' }))}
                className={`text-left rounded-lg border p-3 transition-all ${form.target === value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-primary/40 hover:bg-muted/50'
                  }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Class picker */}
        {needsClass && (
          <div className="space-y-1.5">
            <Label>Select Class</Label>
            <Select value={form.classId} onValueChange={(v) => setForm((p) => ({ ...p, classId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a class…" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Message */}
        <div className="space-y-1.5">
          <Label>Message</Label>
          <Textarea
            placeholder="Type your broadcast message here…"
            rows={4}
            value={form.message}
            onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
          />
          <CharCounter text={form.message} />
        </div>

        <Button onClick={() => send()} disabled={!valid || isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isPending ? 'Queuing…' : 'Send Broadcast'}
        </Button>

        {/* Quick templates */}
        <div className="pt-2 border-t">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Quick Templates</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              {
                label: 'Fee Reminder',
                target: 'all_parents',
                text: 'Dear Parent, this is a reminder that school fees for this term are due. Kindly clear any outstanding balance at your earliest convenience. Thank you.',
              },
              {
                label: 'Event Announcement',
                target: 'all_parents',
                text: 'Dear Parent, we would like to inform you of an upcoming school event. Please check the school notice board for details. Thank you.',
              },
              {
                label: 'Class Reminder',
                target: 'class_parents',
                text: 'Dear Parent, kindly ensure your child brings the following items to school tomorrow: ',
              },
              {
                label: 'Staff Notice',
                target: 'all_staff',
                text: 'Dear Staff, there will be a mandatory staff meeting today at 4:00 PM in the staffroom. Kindly attend.',
              },
            ].map(({ label, target, text }) => (
              <button
                key={label}
                type="button"
                onClick={() => setForm((p) => ({ ...p, target, message: text }))}
                className="text-left rounded-md border border-dashed p-2.5 hover:border-primary/50 hover:bg-muted/40 transition-colors"
              >
                <p className="text-xs font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{text}</p>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Fee reminders tab ────────────────────────────────────────────────────────
function FeeReminderTab() {
  const [form, setForm] = useState({
    target: 'all_students',
    classId: '',
    includeParentName: true,
    includeStudentName: true,
    includeAdmissionNumber: true,
    note: 'Kindly clear the balance as soon as possible. Thank you.',
  });
  const queryClient = useQueryClient();

  const { data: classes = [] } = useQuery({
    queryKey: ['classes-list'],
    queryFn: async () => {
      const res = await classesApi.list();
      return res.data?.classes ?? [];
    },
  });

  const { mutate: send, isPending } = useMutation({
    mutationFn: () => smsApi.feeReminders({
      target: form.target,
      ...(form.target === 'class_students' && form.classId ? { classId: form.classId } : {}),
      includeParentName: form.includeParentName,
      includeStudentName: form.includeStudentName,
      includeAdmissionNumber: form.includeAdmissionNumber,
      note: form.note.trim() || undefined,
    }),
    onSuccess: (res) => {
      const recipientCount = res.data?.recipientCount ?? 0;
      const studentsWithBalance = res.data?.studentsWithBalance ?? 0;
      toast.success(`Fee reminders queued for ${recipientCount} SMS covering ${studentsWithBalance} student${studentsWithBalance !== 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['sms-history'] });
    },
    onError: (err) => showApiError(err),
  });

  const needsClass = form.target === 'class_students';
  const valid = !needsClass || form.classId;
  const sampleParent = form.includeParentName ? 'Dear Mary,' : 'Dear Parent,';
  const sampleStudent = [
    form.includeStudentName ? 'Brian Otieno' : null,
    form.includeAdmissionNumber ? 'Adm 1024' : null,
  ].filter(Boolean).join(' ') || 'Fee balance';
  const preview = `${sampleParent} Green View Academy: Fee balance reminder. ${sampleStudent}: KES 8,500.${form.note ? ` ${form.note}` : ''}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Fee Balance Reminders</CardTitle>
        </div>
        <CardDescription>
          The system calculates each active student's current term balance and creates a simple personalized SMS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Students to Remind</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { value: 'all_students', label: 'All Students', desc: 'Every active student with an outstanding balance' },
              { value: 'class_students', label: 'One Class', desc: 'Only active students in the selected class' },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setForm((p) => ({ ...p, target: item.value, classId: '' }))}
                className={`text-left rounded-lg border p-3 transition-all ${form.target === item.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'border-border hover:border-primary/40 hover:bg-muted/50'
                }`}
              >
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {needsClass && (
          <div className="space-y-1.5">
            <Label>Select Class</Label>
            <Select value={form.classId} onValueChange={(value) => setForm((p) => ({ ...p, classId: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a class..." />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c) => (
                  <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Include in Message</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.includeParentName}
              onChange={(event) => setForm((p) => ({ ...p, includeParentName: event.target.checked }))}
            />
            Parent or guardian name
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.includeStudentName}
              onChange={(event) => setForm((p) => ({ ...p, includeStudentName: event.target.checked }))}
            />
            Student name
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.includeAdmissionNumber}
              onChange={(event) => setForm((p) => ({ ...p, includeAdmissionNumber: event.target.checked }))}
            />
            Admission number
          </label>
          <p className="text-xs text-muted-foreground">The fee balance is always included.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Optional Note</Label>
          <Textarea
            rows={2}
            maxLength={160}
            value={form.note}
            onChange={(event) => setForm((p) => ({ ...p, note: event.target.value }))}
            placeholder="Kindly clear the balance as soon as possible."
          />
          <p className="text-xs text-muted-foreground text-right">{form.note.length}/160</p>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Preview</p>
          <p className="text-sm text-foreground">{preview}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            If one parent has several students with balances, their balances are grouped into fewer SMS messages where possible.
          </p>
        </div>

        <Button onClick={() => send()} disabled={!valid || isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {isPending ? 'Queuing...' : 'Send Fee Reminders'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── History tab ───────────────────────────────────────────────────────────────
function HistoryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['sms-history'],
    queryFn: async () => {
      const res = await smsApi.history({ limit: 50 });
      return res.data ?? res;
    },
  });

  const logs = data?.logs ?? [];

  const targetLabel = {
    single: 'Single',
    class_parents: 'Class Parents',
    all_parents: 'All Parents',
    all_staff: 'All Staff',
    fee_balances: 'Fee Balances',
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Message History</CardTitle>
        </div>
        <CardDescription>Recent SMS broadcasts sent from this school (last 50).</CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No messages sent yet.</p>
        ) : (
          <div className="space-y-0">
            {logs.map((log) => (
              <div key={log._id} className="py-3 border-b last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {targetLabel[log.target] ?? log.target}
                        {log.classId?.name ? ` · ${log.classId.name}` : ''}
                      </Badge>
                      <StatusBadge status={log.status} />
                      <span className="text-xs text-muted-foreground">
                        {log.recipientCount} recipient{log.recipientCount !== 1 ? 's' : ''}
                        {log.sentCount > 0 && log.status !== 'sent' && ` · ${log.sentCount} delivered`}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2">{log.message}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString('en-KE', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                      {log.sentByUserId && (
                        <p className="text-xs text-muted-foreground">
                          by {log.sentByUserId.firstName} {log.sentByUserId.lastName}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MESSAGING_ENABLED = process.env.NEXT_PUBLIC_MESSAGING_ENABLED !== 'false';
const SHOW_TEST_MODE_BANNER = process.env.NODE_ENV !== 'production';
const TEST_NUMBERS = SHOW_TEST_MODE_BANNER ? process.env.NEXT_PUBLIC_SMS_TEST_NUMBERS : null;

// ── Coming Soon ───────────────────────────────────────────────────────────────
function ComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <MessageSquare className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warn/10 text-warn border border-warn/20 text-xs font-semibold mb-2">
          <Sparkles className="h-3 w-3" /> Coming Soon
        </div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">SMS Messaging</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Send individual and bulk SMS messages to parents and staff directly from DiraSchool.
          Fee reminders, announcements, and event notices — all in one place.
        </p>
      </div>
      <ul className="text-sm text-muted-foreground space-y-1.5 text-left w-full max-w-xs">
        {[
          'Broadcast to all parents or a specific class',
          'Direct messages to individual guardians or staff',
          'Message history and delivery tracking',
          'Quick templates for common notices',
        ].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        This feature is currently being rolled out. Contact{' '}
        <a href="mailto:contact@diraschool.com" className="underline hover:text-foreground">
          contact@diraschool.com
        </a>{' '}
        to join the early access list.
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MessagingPage() {
  if (!MESSAGING_ENABLED) return <ComingSoon />;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Messaging"
        description="Send SMS messages to parents and staff. A custom Sender ID is optional."
        overline="SMS"
      />

      <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
        <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" aria-hidden />
        <div>
          <p className="text-sm font-semibold">Sender ID is not required to send SMS</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Messages use the DiraSchool platform Sender ID when available. If your school has not purchased its own Sender ID, the school name is automatically added inside the message.
          </p>
        </div>
      </div>

      {TEST_NUMBERS && (
        <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/5 p-4">
          <FlaskConical className="h-4 w-4 text-warn mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Test mode active</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              All SMS (including broadcasts) are redirected to: <strong>{TEST_NUMBERS}</strong>. Remove <code>SMS_TEST_NUMBERS</code> from the server env to send to real recipients.
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="single">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="single">
            <User className="h-3.5 w-3.5 mr-1.5" /> Single
          </TabsTrigger>
          <TabsTrigger value="broadcast">
            <Users className="h-3.5 w-3.5 mr-1.5" /> Broadcast
          </TabsTrigger>
          <TabsTrigger value="fees">
            <Wallet className="h-3.5 w-3.5 mr-1.5" /> Fees
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="h-3.5 w-3.5 mr-1.5" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-4">
          <SingleMessageTab />
        </TabsContent>
        <TabsContent value="broadcast" className="mt-4">
          <BroadcastTab />
        </TabsContent>
        <TabsContent value="fees" className="mt-4">
          <FeeReminderTab />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
