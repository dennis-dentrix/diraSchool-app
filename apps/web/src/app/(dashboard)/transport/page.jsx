'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Bus, MoreHorizontal, Pencil, Users, Trash2, UserPlus, X, GripVertical, Search, Printer, Eye } from 'lucide-react';
import { transportApi, studentsApi, schoolsApi, settingsApi, feesApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { buildDocumentHeaderHtml, getDocumentHeaderCss, getDocumentHeaderData, escapeHtml } from '@/lib/document-print';
import { useAuthStore, isAdmin } from '@/store/auth.store';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';

const CONFIRM_INIT     = { open: false, routeId: null, routeName: '' };
const ROUTE_FORM_INIT  = { name: '', description: '', vehicleReg: '', driverName: '', driverPhone: '', capacity: '', morningDeparture: '', afternoonDeparture: '' };

// ── Route / Stops Form helpers (unchanged) ────────────────────────────────────

function RouteForm({ form, onChange }) {
  const set = (k) => (e) => onChange({ ...form, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Route Name <span className="text-destructive">*</span></Label>
        <Input value={form.name} onChange={set('name')} placeholder="Westlands — School" />
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Input value={form.description} onChange={set('description')} placeholder="Morning and evening route" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Vehicle Reg</Label><Input value={form.vehicleReg} onChange={set('vehicleReg')} placeholder="KBZ 123A" /></div>
        <div className="space-y-1.5"><Label>Capacity</Label><Input value={form.capacity} onChange={set('capacity')} type="number" placeholder="40" min="1" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Driver Name</Label><Input value={form.driverName} onChange={set('driverName')} placeholder="John Mwangi" /></div>
        <div className="space-y-1.5"><Label>Driver Phone</Label><Input value={form.driverPhone} onChange={set('driverPhone')} placeholder="0712 345 678" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Morning Departure</Label><Input value={form.morningDeparture} onChange={set('morningDeparture')} type="time" /></div>
        <div className="space-y-1.5"><Label>Afternoon Departure</Label><Input value={form.afternoonDeparture} onChange={set('afternoonDeparture')} type="time" /></div>
      </div>
    </div>
  );
}

function StopsEditor({ stops, onChange }) {
  const [newStop, setNewStop] = useState('');

  const addStop = () => {
    const name = newStop.trim();
    if (!name) return;
    const order = (stops[stops.length - 1]?.order ?? 0) + 1;
    onChange([...stops, { name, order }]);
    setNewStop('');
  };

  const removeStop = (i) => {
    const updated = stops.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx + 1 }));
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {stops.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No stops yet.</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {stops.map((stop, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span className="text-xs text-muted-foreground w-5 text-right">{stop.order}.</span>
                <span className="text-sm flex-1 truncate">{stop.name}</span>
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeStop(i)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Input value={newStop} onChange={(e) => setNewStop(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addStop())}
          placeholder="Stop name (e.g. Westlands Stage)" className="text-sm" />
        <Button type="button" variant="outline" size="sm" onClick={addStop} disabled={!newStop.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

const getParentContact = (student) => {
  const parentUser = Array.isArray(student?.parentIds) && student.parentIds.length > 0 ? student.parentIds[0] : null;
  const guardian   = Array.isArray(student?.guardians)  && student.guardians.length > 0  ? student.guardians[0]  : null;
  const parentName  = parentUser ? `${parentUser.firstName ?? ''} ${parentUser.lastName ?? ''}`.trim() : guardian ? `${guardian.firstName ?? ''} ${guardian.lastName ?? ''}`.trim() : '';
  const parentPhone = parentUser?.phone ?? guardian?.phone ?? '';
  return { parentName: parentName || '—', parentPhone: parentPhone || '—' };
};

// ── Assign Students Dialog (unchanged) ────────────────────────────────────────
function AssignStudentsDialog({ open, onClose, route }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [dropOffByStudent, setDropOffByStudent] = useState({});

  const { data: routeDetail, isLoading: loadingRoute } = useQuery({
    queryKey: ['transport-route-detail', route?._id],
    queryFn: async () => {
      const res = await transportApi.getRoute(route._id);
      const raw = res.data;
      return { route: raw?.route ?? raw?.data, students: raw?.students ?? [] };
    },
    enabled: open && !!route?._id,
  });

  useEffect(() => {
    if (routeDetail?.students?.length) {
      setSelected(new Set(routeDetail.students.map((s) => s._id)));
      const nextDropOff = {};
      for (const s of routeDetail.students) nextDropOff[s._id] = s.transportAssignment?.dropOffPoint ?? '';
      setDropOffByStudent(nextDropOff);
    }
  }, [routeDetail]);

  const { data: allStudents, isLoading: loadingStudents } = useQuery({
    queryKey: ['students-all-for-transport'],
    queryFn: async () => {
      const res = await studentsApi.list({ limit: 500, status: 'active' });
      return res.data?.data ?? res.data?.students ?? [];
    },
    enabled: open,
  });

  const assignedIds = useMemo(() => new Set((routeDetail?.students ?? []).map((s) => s._id)), [routeDetail]);

  const { mutate: assign, isPending: assigning } = useMutation({
    mutationFn: async () => {
      const prev = assignedIds;
      const next = selected;
      const assignments = [...next].map((studentId) => ({ studentId, dropOffPoint: (dropOffByStudent[studentId] ?? '').trim() }));
      const invalid = assignments.filter((a) => !a.dropOffPoint);
      if (invalid.length > 0) throw new Error('Every selected student must have a drop-off point');
      const toUnassign = [...prev].filter((id) => !next.has(id));
      if (assignments.length > 0) await transportApi.assignStudents(route._id, { assignments });
      if (toUnassign.length > 0) await transportApi.unassignStudents(route._id, { studentIds: toUnassign });
    },
    onSuccess: () => {
      toast.success('Student assignments updated');
      queryClient.invalidateQueries({ queryKey: ['transport-routes'] });
      queryClient.invalidateQueries({ queryKey: ['transport-route-detail'] });
      onClose();
    },
    onError: (err) => showApiError(err),
  });

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
      setDropOffByStudent((p) => { const n = { ...p }; delete n[id]; return n; });
    } else {
      next.add(id);
      setDropOffByStudent((p) => ({ ...p, [id]: p[id] ?? '' }));
    }
    return next;
  });

  const students      = allStudents ?? [];
  const filtered      = search.trim() ? students.filter((s) => `${s.firstName} ${s.lastName} ${s.admissionNumber}`.toLowerCase().includes(search.toLowerCase())) : students;
  const assignedCount = [...selected].filter((id) => students.some((s) => s._id === id)).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader><DialogTitle>Assign Students — {route?.name}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col gap-3 py-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{assignedCount} student{assignedCount !== 1 ? 's' : ''} assigned</span>
            {route?.capacity && <span>Capacity: {route.capacity}</span>}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search students…" className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto border rounded-md divide-y min-h-[200px]">
            {(loadingRoute || loadingStudents) ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No students found</p>
            ) : (
              filtered.map((s) => {
                const checked = selected.has(s._id);
                const cls = typeof s.classId === 'object' ? `${s.classId.name}${s.classId.stream ? ` ${s.classId.stream}` : ''}` : '';
                return (
                  <div key={s._id} className="px-3 py-2.5 hover:bg-muted/40 transition-colors">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggle(s._id)} className="h-4 w-4 rounded accent-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.firstName} {s.lastName}</p>
                        <p className="text-xs text-muted-foreground">{s.admissionNumber}{cls ? ` · ${cls}` : ''}</p>
                      </div>
                      {checked && <Badge className="text-[10px] py-0 h-4 bg-ok/10 text-ok border-0">Assigned</Badge>}
                    </label>
                    {checked && (
                      <div className="mt-2 pl-7">
                        <Label className="text-xs text-muted-foreground">Drop-off point</Label>
                        <Input className="h-8 mt-1" placeholder="e.g. Westlands Stage" value={dropOffByStudent[s._id] ?? ''} onChange={(e) => setDropOffByStudent((prev) => ({ ...prev, [s._id]: e.target.value }))} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => assign()} disabled={assigning}>{assigning ? 'Saving…' : 'Save Assignments'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── View Students Dialog (unchanged) ─────────────────────────────────────────
function ViewStudentsDialog({ open, onClose, route }) {
  const { data: schoolData }   = useQuery({ queryKey: ['school-me'], queryFn: async () => { const res = await schoolsApi.me(); return res.data?.school ?? res.data?.data ?? res.data; }, enabled: open });
  const { data: settingsData } = useQuery({ queryKey: ['settings', 'transport-print'], queryFn: async () => { const res = await settingsApi.get(); return res.data?.settings ?? res.data?.data ?? res.data; }, enabled: open });

  const { data: routeDetail, isLoading } = useQuery({
    queryKey: ['transport-route-students', route?._id],
    queryFn: async () => { const res = await transportApi.getRoute(route._id); const raw = res.data; return { route: raw?.route ?? raw?.data, students: raw?.students ?? [] }; },
    enabled: open && !!route?._id,
  });

  const students  = useMemo(() => [...(routeDetail?.students ?? [])].sort((a, b) => `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim().toLowerCase().localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''}`.trim().toLowerCase())), [routeDetail]);
  const routeMeta = routeDetail?.route ?? route ?? {};
  const driverName = routeMeta?.driverName || '—';
  const driverPhone = routeMeta?.driverPhone || '—';
  const documentSerial = `TRL-${String(routeMeta?._id || route?._id || '').slice(-6).toUpperCase()}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;

  const printList = () => {
    if (!route) return;
    const rows = students.map((s, i) => {
      const cls = typeof s.classId === 'object' ? `${s.classId.name ?? ''}${s.classId.stream ? ` ${s.classId.stream}` : ''}` : '—';
      const { parentName, parentPhone } = getParentContact(s);
      const dropOff    = s.transportAssignment?.dropOffPoint ?? '—';
      const assignedAt = s.transportAssignment?.assignedAt ? new Date(s.transportAssignment.assignedAt).toLocaleDateString() : '—';
      return `<tr><td>${i + 1}</td><td>${escapeHtml(`${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || '—')}</td><td>${escapeHtml(cls || '—')}</td><td>${escapeHtml(s.admissionNumber ?? '—')}</td><td>${escapeHtml(parentName)}</td><td>${escapeHtml(parentPhone)}</td><td>${escapeHtml(dropOff)}</td><td>${escapeHtml(assignedAt)}</td></tr>`;
    }).join('');

    const win = window.open('', '', 'width=1100,height=800');
    if (!win) return;
    const header = getDocumentHeaderData({ school: schoolData || {}, settings: settingsData || {}, title: 'Transport', subtitle: `Students List · ${routeMeta?.name ?? route?.name ?? 'Route'}`, serial: documentSerial, generatedAt: new Date().toLocaleString() });
    win.document.write(`<!DOCTYPE html><html><head><title>Transport Students - ${escapeHtml(routeMeta?.name ?? route?.name ?? 'Route')}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}${getDocumentHeaderCss()}.meta{color:#555;font-size:12px;margin:2px 0 10px}.header{border:1px solid #dfe3e8;border-radius:8px;padding:12px 14px;margin:0 0 14px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{background:#f3f4f6;font-weight:700}@media print{body{padding:0}}</style></head><body>${buildDocumentHeaderHtml(header)}<div class="header"><p><strong>Route:</strong> ${escapeHtml(routeMeta?.name ?? '—')}</p><p><strong>Driver:</strong> ${escapeHtml(driverName)} · ${escapeHtml(driverPhone)}</p>${routeMeta?.vehicleReg ? `<p><strong>Vehicle:</strong> ${escapeHtml(routeMeta.vehicleReg)}</p>` : ''}</div><table><thead><tr><th>#</th><th>Student Name</th><th>Class</th><th>Admission No.</th><th>Parent Name</th><th>Parent Phone</th><th>Drop-off Point</th><th>Assigned Date</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No students assigned</td></tr>'}</tbody></table></body></html>`);
    win.document.close();
    win.print();
    win.close();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col">
        <DialogHeader><DialogTitle>Students on Route — {route?.name}</DialogTitle></DialogHeader>
        <div className="rounded-md border bg-muted/20 p-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 font-semibold">School</p>
            <p className="font-semibold">{schoolData?.name || 'School'}</p>
            {schoolData?.phone && <p className="text-muted-foreground">{schoolData.phone}</p>}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 font-semibold">Route & Driver</p>
            <p><span className="text-muted-foreground">Route:</span> <span className="font-medium">{routeMeta?.name ?? '—'}</span></p>
            <p><span className="text-muted-foreground">Driver:</span> <span className="font-medium">{driverName}</span></p>
            {routeMeta?.vehicleReg && <p><span className="text-muted-foreground">Vehicle:</span> <span className="font-mono">{routeMeta.vehicleReg}</span></p>}
          </div>
        </div>
        <div className="flex-1 overflow-auto border rounded-md">
          {isLoading ? (
            <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No students assigned to this route</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[480px]">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  {['#','Student Name','Class','Admission No.','Drop-off Point'].map((h) => (
                    <th key={h} className="text-left px-3 py-2 border-b text-xs font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((s, idx) => {
                  const cls    = typeof s.classId === 'object' ? `${s.classId.name ?? ''}${s.classId.stream ? ` ${s.classId.stream}` : ''}` : '—';
                  const dropOff = s.transportAssignment?.dropOffPoint ?? '—';
                  return (
                    <tr key={s._id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 border-b text-muted-foreground text-xs">{idx + 1}</td>
                      <td className="px-3 py-2 border-b font-medium">{s.firstName} {s.lastName}</td>
                      <td className="px-3 py-2 border-b text-muted-foreground">{cls}</td>
                      <td className="px-3 py-2 border-b font-mono text-xs">{s.admissionNumber ?? '—'}</td>
                      <td className="px-3 py-2 border-b text-muted-foreground">{dropOff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={printList} disabled={students.length === 0}>
            <Printer className="h-4 w-4 mr-1.5" /> Print List
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function TransportPage() {
  const queryClient = useQueryClient();
  const { user }    = useAuthStore();
  const canManage   = isAdmin(user) || ['secretary', 'accountant'].includes(user?.role);

  const [createOpen,    setCreateOpen]    = useState(false);
  const [editTarget,    setEditTarget]    = useState(null);
  const [assignTarget,  setAssignTarget]  = useState(null);
  const [viewTarget,    setViewTarget]    = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(CONFIRM_INIT);
  const [createForm,    setCreateForm]    = useState(ROUTE_FORM_INIT);
  const [createStops,   setCreateStops]   = useState([]);
  const [editForm,      setEditForm]      = useState(ROUTE_FORM_INIT);
  const [editStops,     setEditStops]     = useState([]);
  const [showTransportPayers, setShowTransportPayers] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['transport-routes'],
    queryFn: async () => { const res = await transportApi.listRoutes({ limit: 50 }); return res.data; },
  });

  // Fetch students who paid "Transport" fees
  const { data: transportPayersData, isLoading: loadingPayers } = useQuery({
    queryKey: ['transport-fee-payers'],
    queryFn: async () => {
      const res = await feesApi.listPayments({ limit: 1000, paymentType: 'other', status: 'completed' });
      const payments = res.data?.data ?? res.data?.payments ?? [];

      // Filter for transport payments and get unique students
      const transportPayments = payments.filter((p) => p.feeItemName === 'Transport');
      const studentMap = new Map();

      for (const payment of transportPayments) {
        if (payment.studentId?._id) {
          const sid = payment.studentId._id;
          if (!studentMap.has(sid)) {
            studentMap.set(sid, {
              _id: payment.studentId._id,
              firstName: payment.studentId.firstName,
              lastName: payment.studentId.lastName,
              admissionNumber: payment.studentId.admissionNumber,
              classId: payment.classId,
            });
          }
        }
      }

      return Array.from(studentMap.values());
    },
  });

  const cleanForm = (form, stops) => {
    const payload = { ...form };
    if (!payload.capacity) delete payload.capacity; else payload.capacity = Number(payload.capacity);
    if (!payload.morningDeparture) delete payload.morningDeparture;
    if (!payload.afternoonDeparture) delete payload.afternoonDeparture;
    if (!payload.description) delete payload.description;
    if (stops.length > 0) payload.stops = stops;
    return payload;
  };

  const { mutate: createRoute, isPending: creating } = useMutation({
    mutationFn: () => transportApi.createRoute(cleanForm(createForm, createStops)),
    onSuccess: () => { toast.success('Route created'); queryClient.invalidateQueries({ queryKey: ['transport-routes'] }); setCreateOpen(false); setCreateForm(ROUTE_FORM_INIT); setCreateStops([]); },
    onError: (err) => showApiError(err),
  });

  const { mutate: updateRoute, isPending: updating } = useMutation({
    mutationFn: () => transportApi.updateRoute(editTarget._id, cleanForm(editForm, editStops)),
    onSuccess: () => { toast.success('Route updated'); queryClient.invalidateQueries({ queryKey: ['transport-routes'] }); setEditTarget(null); },
    onError: (err) => showApiError(err),
  });

  const { mutate: deleteRoute } = useMutation({
    mutationFn: (id) => transportApi.deleteRoute(id),
    onSuccess: () => { toast.success('Route deleted'); queryClient.invalidateQueries({ queryKey: ['transport-routes'] }); },
    onError: (err) => showApiError(err),
  });

  const openEdit = (route) => {
    setEditForm({ name: route.name ?? '', description: route.description ?? '', vehicleReg: route.vehicleReg ?? '', driverName: route.driverName ?? '', driverPhone: route.driverPhone ?? '', capacity: route.capacity ? String(route.capacity) : '', morningDeparture: route.morningDeparture ?? '', afternoonDeparture: route.afternoonDeparture ?? '' });
    setEditStops(route.stops ? [...route.stops] : []);
    setEditTarget(route);
  };

  const routes = data?.data ?? data?.routes ?? [];

  // Routes that have at least one departure time (for schedule strip)
  const scheduledRoutes = routes.filter((r) => r.morningDeparture || r.afternoonDeparture);

  return (
    <div className="space-y-6">
      <PageHeader title="Transport" description="Manage school transport routes and student assignments">
        {canManage && (
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add Route</Button>
        )}
      </PageHeader>

      {/* Transport Payers Section */}
      {showTransportPayers && canManage && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <button
            onClick={() => setShowTransportPayers(!showTransportPayers)}
            className="w-full flex items-center justify-between px-4 py-3 border-b hover:bg-muted/30 transition-colors"
          >
            <div className="text-left">
              <p className="text-sm font-semibold">Students Who Paid Transport Fees</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {loadingPayers ? 'Loading...' : `${transportPayersData?.length ?? 0} student(s) ready to assign`}
              </p>
            </div>
            <Badge variant="outline">{transportPayersData?.length ?? 0}</Badge>
          </button>

          {!loadingPayers && (transportPayersData?.length ?? 0) > 0 && (
            <div className="px-4 py-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Select a route below to assign these students with their pickup/dropoff points and vehicle.
              </p>
              {routes.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {routes.filter((r) => r.isActive).map((route) => (
                    <button
                      key={route._id}
                      onClick={() => setAssignTarget(route)}
                      className="text-left px-3 py-2 rounded-md border border-border hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-sm font-medium">{route.name}</p>
                      <p className="text-xs text-muted-foreground">{route.vehicleReg || 'No vehicle assigned'}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Create a route first to assign students.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Schedule strip */}
      {scheduledRoutes.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Today's Schedule</p>
          <div className="rounded-lg border bg-card overflow-hidden">
            {scheduledRoutes.map((route) => (
              <div key={route._id} className="flex items-center gap-4 px-4 py-2.5 border-b last:border-0">
                <Bus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <p className="flex-1 text-sm font-medium truncate">{route.name}</p>
                {route.morningDeparture && (
                  <span className="font-mono text-xs tabular-nums">↑ {route.morningDeparture}</span>
                )}
                {route.afternoonDeparture && (
                  <span className="font-mono text-xs tabular-nums">↓ {route.afternoonDeparture}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Routes list */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Routes {routes.length > 0 && <span className="font-mono ml-1">({routes.length})</span>}
        </p>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : routes.length === 0 ? (
          <EmptyState
            icon={Bus}
            title="No routes configured"
            description="Add transport routes for student pickup and drop-off"
            action={canManage ? { label: 'Add Route', onClick: () => setCreateOpen(true) } : undefined}
          />
        ) : (
          <div className="space-y-2">
            {routes.map((route) => (
              <div key={route._id} className={`rounded-lg border bg-card px-4 py-3 ${!route.isActive ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Bus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="font-semibold text-sm leading-tight truncate">{route.name}</p>
                      {!route.isActive && (
                        <span className="text-[10px] border rounded-full px-1.5 py-0 text-warn border-warn/30 shrink-0">Inactive</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground pl-5">
                      {route.vehicleReg && (
                        <span>Vehicle: <span className="font-mono text-foreground">{route.vehicleReg}</span></span>
                      )}
                      {route.driverName && (
                        <span>Driver: <span className="text-foreground">{route.driverName}</span></span>
                      )}
                      {route.stops?.length > 0 && (
                        <span>{route.stops.length} stops</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setViewTarget(route)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                    >
                      <Users className="h-3.5 w-3.5" />
                    </button>
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(route)}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit route
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setAssignTarget(route)}>
                            <UserPlus className="h-3.5 w-3.5 mr-2" /> Assign students
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setViewTarget(route)}>
                            <Eye className="h-3.5 w-3.5 mr-2" /> View students
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDialog({ open: true, routeId: route._id, routeName: route.name })}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete route
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Dialogs ──────────────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) { setCreateOpen(false); setCreateForm(ROUTE_FORM_INIT); setCreateStops([]); } }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Transport Route</DialogTitle></DialogHeader>
          <RouteForm form={createForm} onChange={setCreateForm} />
          <div className="space-y-2 mt-1">
            <Label className="text-sm font-semibold">Stops</Label>
            <StopsEditor stops={createStops} onChange={setCreateStops} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setCreateForm(ROUTE_FORM_INIT); setCreateStops([]); }}>Cancel</Button>
            <Button onClick={() => createRoute()} disabled={creating || !createForm.name.trim()}>
              {creating ? 'Creating…' : 'Create Route'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Route — {editTarget?.name}</DialogTitle></DialogHeader>
          <RouteForm form={editForm} onChange={setEditForm} />
          <div className="space-y-2 mt-1">
            <Label className="text-sm font-semibold">Stops</Label>
            <StopsEditor stops={editStops} onChange={setEditStops} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={() => updateRoute()} disabled={updating || !editForm.name.trim()}>
              {updating ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assignTarget && <AssignStudentsDialog open={!!assignTarget} onClose={() => setAssignTarget(null)} route={assignTarget} />}
      {viewTarget   && <ViewStudentsDialog   open={!!viewTarget}   onClose={() => setViewTarget(null)}   route={viewTarget}   />}

      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog(CONFIRM_INIT)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete route?</AlertDialogTitle>
            <AlertDialogDescription>&quot;{confirmDialog.routeName}&quot; will be permanently removed. All students will be unlinked from this route.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { deleteRoute(confirmDialog.routeId); setConfirmDialog(CONFIRM_INIT); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
