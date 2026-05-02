'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar, Plus, Pencil, Trash2, Save, X,
  CalendarDays, Users, BookOpen, Clock, AlertTriangle,
} from 'lucide-react';
import { timetableApi, classesApi, subjectsApi, usersApi, settingsApi, getErrorMessage } from '@/lib/api';
import { useAuthStore, isAdmin } from '@/store/auth.store';
import { ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

const DAY_COLORS = {
  monday: 'bg-blue-50 border-blue-200',
  tuesday: 'bg-purple-50 border-purple-200',
  wednesday: 'bg-green-50 border-green-200',
  thursday: 'bg-amber-50 border-amber-200',
  friday: 'bg-rose-50 border-rose-200',
};
const DAY_HEADER = {
  monday: 'bg-blue-100',
  tuesday: 'bg-purple-100',
  wednesday: 'bg-green-100',
  thursday: 'bg-amber-100',
  friday: 'bg-rose-100',
};

const BREAK_MARKER = '__BREAK__';
const SLOT_INIT = { day: 'monday', period: 1, startTime: '08:00', endTime: '08:40', subjectId: '', teacherId: '', room: '', isBreak: false };
const firstArray = (...candidates) => {
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }
  return [];
};
const normalizeDay = (value) => {
  const day = String(value ?? '').toLowerCase();
  return DAYS.includes(day) ? day : DAYS[0];
};
const toIdString = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id ?? value.id ?? '');
  return String(value);
};
const dayLabel = (value) => {
  const day = normalizeDay(value);
  return `${day[0].toUpperCase()}${day.slice(1)}`;
};

// ── Slot card ──────────────────────────────────────────────────────────────────
function SlotCard({ slot, onEdit, onDelete, canEdit, showTeacher = true, showClass = false }) {
  const subject = typeof slot.subjectId === 'object' ? slot.subjectId : null;
  const teacher = typeof slot.teacherId === 'object' ? slot.teacherId : null;
  const isBreak = slot.room === BREAK_MARKER;
  const day = normalizeDay(slot.day);

  if (isBreak) {
    return (
      <div className="rounded border bg-amber-50 border-amber-200 px-2 py-1.5 text-xs text-center text-amber-700 font-medium relative group">
        ☕ Break
        {canEdit && (
          <div className="absolute top-0.5 right-0.5 hidden group-hover:flex">
            <button className="p-0.5 rounded hover:bg-white/60 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(slot); }}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded border p-2 text-xs space-y-0.5 relative group ${DAY_COLORS[day] ?? 'bg-muted/30'}`}>
      <p className="font-semibold text-sm leading-tight">
        {subject?.name ?? <span className="text-muted-foreground italic text-xs">No subject</span>}
      </p>
      {showClass && slot.className && <p className="text-muted-foreground font-medium">{slot.className}</p>}
      {showTeacher && teacher && <p className="text-muted-foreground">{teacher.firstName} {teacher.lastName}</p>}
      {slot.room && slot.room !== BREAK_MARKER && <p className="text-muted-foreground text-[10px]">📍 {slot.room}</p>}
      {canEdit && (
        <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
          <button className="p-0.5 rounded hover:bg-white/60" onClick={(e) => { e.stopPropagation(); onEdit(slot); }}>
            <Pencil className="h-3 w-3" />
          </button>
          <button className="p-0.5 rounded hover:bg-white/60 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(slot); }}>
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Timetable grid (period-row × day-column) ───────────────────────────────────
function TimetableGrid({ slots, canEdit, onEdit, onDelete, showTeacher = true, showClass = false, canCreateTimetable = false }) {
  const periods = useMemo(() => {
    const map = new Map();
    for (const s of slots) {
      if (!map.has(s.period)) map.set(s.period, { period: s.period, startTime: s.startTime, endTime: s.endTime });
    }
    return Array.from(map.values()).sort((a, b) => a.period - b.period);
  }, [slots]);

  const lookup = useMemo(() => {
    const m = {};
    for (const s of slots) {
      const day = normalizeDay(s.day);
      if (!m[day]) m[day] = {};
      m[day][s.period] = s;
    }
    return m;
  }, [slots]);

  if (periods.length === 0) {
    return (
      <div className="space-y-3">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="border-r border-b px-3 py-2 text-left text-[11px] font-medium text-muted-foreground w-28 whitespace-nowrap">
                  Period / Time
                </th>
                {DAYS.map((day) => (
                  <th key={day} className={`border-r border-b px-3 py-2 text-center text-xs font-semibold ${DAY_HEADER[day]} min-w-[140px]`}>
                    {dayLabel(day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-r border-b px-3 py-3 text-[11px] text-muted-foreground">—</td>
                {DAYS.map((day) => (
                  <td key={day} className="border-r border-b px-1.5 py-1.5">
                    <div className="min-h-[36px]" />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-center text-muted-foreground gap-2">
          <Calendar className="h-4 w-4 opacity-50" />
          <p className="text-sm">
            {canCreateTimetable
              ? 'No slots yet. Click "Add Slot" to start building the timetable.'
              : 'No timetable created yet, kindly check back later'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/40">
            <th className="border-r border-b px-3 py-2 text-left text-[11px] font-medium text-muted-foreground w-28 whitespace-nowrap">
              Period / Time
            </th>
            {DAYS.map((day) => (
              <th key={day} className={`border-r border-b px-3 py-2 text-center text-xs font-semibold ${DAY_HEADER[day]} min-w-[140px]`}>
                {dayLabel(day)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map(({ period, startTime, endTime }) => {
            const isBreakRow = DAYS.some((d) => lookup[d]?.[period]?.room === BREAK_MARKER);
            return (
              <tr key={period} className={isBreakRow ? 'bg-amber-50/40' : 'hover:bg-muted/10'}>
                <td className="border-r border-b px-3 py-2 align-top text-[11px] text-muted-foreground whitespace-nowrap">
                  {isBreakRow ? (
                    <span className="text-amber-700 font-semibold">Break</span>
                  ) : (
                    <>
                      <span className="font-semibold text-foreground block">P{period}</span>
                      <span className="tabular-nums">{startTime}</span>
                      <span className="text-[10px] block">→ {endTime}</span>
                    </>
                  )}
                </td>
                {DAYS.map((day) => {
                  const slot = lookup[day]?.[period];
                  return (
                    <td key={day} className="border-r border-b px-1.5 py-1.5 align-top">
                      {slot ? (
                        <SlotCard
                          slot={slot}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          canEdit={canEdit}
                          showTeacher={showTeacher}
                          showClass={showClass}
                        />
                      ) : (
                        <div className="min-h-[36px]" />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Slot editor dialog ─────────────────────────────────────────────────────────
function SlotDialog({ open, onClose, initial, subjects, teachers, onSave, teacherBusy = {} }) {
  const [form, setForm] = useState(SLOT_INIT);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({ ...SLOT_INIT, ...initial, isBreak: initial.room === BREAK_MARKER });
      } else {
        setForm(SLOT_INIT);
      }
    }
  }, [open, initial]);

  const handleSave = () => {
    if (!form.startTime || !form.endTime) { toast.error('Start and end time are required'); return; }
    const slot = { day: normalizeDay(form.day), period: form.period, startTime: form.startTime, endTime: form.endTime };
    if (form.isBreak) {
      slot.room = BREAK_MARKER;
    } else {
      if (form.subjectId) slot.subjectId = form.subjectId;
      if (form.teacherId) slot.teacherId = form.teacherId;
      if (form.room) slot.room = form.room;
    }
    if (initial?._isEdit) slot._editIdx = initial._editIdx;
    onSave(slot);
    onClose();
  };

  const teacherConflict = useMemo(() => {
    if (!form.teacherId || !form.day || !form.period) return null;
    if (teacherBusy[form.teacherId]?.[form.day]?.has(form.period)) {
      const t = teachers.find((x) => x._id === form.teacherId);
      return t ? `${t.firstName} ${t.lastName}` : 'This teacher';
    }
    return null;
  }, [form.teacherId, form.day, form.period, teacherBusy, teachers]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial?._isEdit ? 'Edit Slot' : 'Add Slot'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Break toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={form.isBreak}
              onChange={(e) => set('isBreak', e.target.checked)}
            />
            <span className="text-sm font-medium">Mark as break period (e.g. lunch, recess)</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Day</Label>
              <Select value={form.day} onValueChange={(v) => set('day', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d}>{dayLabel(d)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period #</Label>
              <Input type="number" min="1" max="12" value={form.period}
                onChange={(e) => set('period', Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
              <Input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
            </div>
          </div>

          {!form.isBreak && (
            <>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Select
                  value={form.subjectId || '__none__'}
                  onValueChange={(v) => set('subjectId', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {subjects.map((s) => <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Teacher</Label>
                <Select
                  value={form.teacherId || '__none__'}
                  onValueChange={(v) => set('teacherId', v === '__none__' ? '' : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {teachers.map((t) => {
                      const busy = teacherBusy[t._id]?.[form.day]?.has(form.period);
                      return (
                        <SelectItem key={t._id} value={t._id}>
                          {t.firstName} {t.lastName}{busy ? ' ⚠️' : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {teacherConflict && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded px-2 py-1.5 border border-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span><strong>{teacherConflict}</strong> is already teaching another class at this time.</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Room <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input value={form.room} onChange={(e) => set('room', e.target.value)} placeholder="e.g. Lab 2" />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Slot</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Class timetable tab ────────────────────────────────────────────────────────
function ClassTimetableTab({ canWrite }) {
  const queryClient = useQueryClient();
  const { academicYear: defaultAcademicYear, term: defaultTerm } = useSchoolTermDefaults(['timetable', 'term-defaults']);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState(defaultTerm);
  const [selectedYear, setSelectedYear] = useState(defaultAcademicYear);
  const [editMode, setEditMode] = useState(false);
  const [localSlots, setLocalSlots] = useState([]);
  const [slotDialog, setSlotDialog] = useState({ open: false, initial: null });

  useEffect(() => {
    setSelectedTerm(defaultTerm);
    setSelectedYear(defaultAcademicYear);
    setEditMode(false);
  }, [defaultTerm, defaultAcademicYear]);

  const { data: classesData, isError: classesError } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const res = await classesApi.list({ limit: 100 });
      return firstArray(
        res.data?.data,
        res.data?.classes,
        res.data?.data?.classes,
      );
    },
  });

  const { data: timetable, isLoading, isError: timetableError, error: timetableErr } = useQuery({
    queryKey: ['timetable', selectedClass, selectedTerm, selectedYear],
    queryFn: async () => {
      const res = await timetableApi.list({ classId: selectedClass, term: selectedTerm, academicYear: selectedYear, limit: 1 });
      const list = firstArray(
        res.data?.data,
        res.data?.timetables,
        res.data?.data?.timetables,
      );
      return list[0] ?? null;
    },
    enabled: !!selectedClass,
  });

  const { data: subjects } = useQuery({
    queryKey: ['subjects-all'],
    queryFn: async () => {
      const res = await subjectsApi.list({ limit: 200 });
      return firstArray(
        res.data?.data,
        res.data?.subjects,
        res.data?.data?.subjects,
      );
    },
    enabled: canWrite,
  });

  const { data: teachers } = useQuery({
    queryKey: ['users', 'teachers-list'],
    queryFn: async () => {
      const res = await usersApi.list({ role: 'teacher,department_head', limit: 200 });
      return firstArray(
        res.data?.data,
        res.data?.users,
        res.data?.data?.users,
      );
    },
    enabled: canWrite,
  });

  // Fetch all timetables for this term/year to detect teacher conflicts
  const { data: allTimetables } = useQuery({
    queryKey: ['timetables-all', selectedTerm, selectedYear],
    queryFn: async () => {
      const res = await timetableApi.list({ term: selectedTerm, academicYear: selectedYear, limit: 200 });
      return firstArray(
        res.data?.data,
        res.data?.timetables,
        res.data?.data?.timetables,
      );
    },
    enabled: canWrite && editMode,
  });

  // Build teacher busy map: teacherId → day → Set<period>  (excluding current timetable)
  const teacherBusy = useMemo(() => {
    if (!allTimetables) return {};
    const busy = {};
    for (const tt of allTimetables) {
      if (tt._id === timetable?._id) continue; // skip current
      for (const slot of tt.slots ?? []) {
        const tid = typeof slot.teacherId === 'object' ? slot.teacherId?._id : slot.teacherId;
        if (!tid) continue;
        const day = normalizeDay(slot.day);
        if (!busy[tid]) busy[tid] = {};
        if (!busy[tid][day]) busy[tid][day] = new Set();
        busy[tid][day].add(slot.period);
      }
    }
    return busy;
  }, [allTimetables, timetable?._id]);

  const { mutate: createTimetable, isPending: creating } = useMutation({
    mutationFn: () => timetableApi.create({ classId: selectedClass, term: selectedTerm, academicYear: selectedYear, slots: [] }),
    onSuccess: () => {
      toast.success('Timetable created');
      queryClient.invalidateQueries({ queryKey: ['timetable'] });
      setEditMode(true);
      setLocalSlots([]);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: saveSlots, isPending: saving } = useMutation({
    mutationFn: () =>
      timetableApi.updateSlots(timetable._id, {
        slots: localSlots.map((slot) => ({ ...slot, day: normalizeDay(slot.day) })),
      }),
    onSuccess: () => {
      toast.success('Timetable saved');
      queryClient.invalidateQueries({ queryKey: ['timetable'] });
      queryClient.invalidateQueries({ queryKey: ['timetables-all'] });
      setEditMode(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const startEdit = () => {
    setLocalSlots(
      timetable?.slots?.map((s) => ({
        ...s,
        day: normalizeDay(s.day),
        subjectId: toIdString(s.subjectId),
        teacherId: toIdString(s.teacherId),
      })) ?? []
    );
    setEditMode(true);
  };

  const cancelEdit = () => { setEditMode(false); setLocalSlots([]); };

  const addSlot = (slot) => setLocalSlots((prev) => [...prev, slot]);

  const editSlot = (slot) => {
    const idx = slot._editIdx;
    setLocalSlots((prev) => prev.map((s, i) => {
      if (i !== idx) return s;
      const { _editIdx, ...rest } = slot;
      return rest;
    }));
  };

  const deleteSlot = (slot) => {
    const idx = slot._editIdx ?? localSlots.findIndex(
      (s) => s.day === slot.day && s.period === slot.period
    );
    setLocalSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const displaySlots = editMode
    ? localSlots.map((s, i) => ({
      ...s,
      _editIdx: i,
      subjectId: subjects?.find((sub) => toIdString(sub._id) === toIdString(s.subjectId)) ?? s.subjectId,
      teacherId: teachers?.find((t) => toIdString(t._id) === toIdString(s.teacherId)) ?? s.teacherId,
    }))
    : (timetable?.slots ?? []);

  const classes = classesData ?? [];

  const openAddSlot = () => setSlotDialog({ open: true, initial: null });
  const openEditSlot = (slot) => setSlotDialog({
    open: true,
    initial: {
      ...slot,
      day: normalizeDay(slot.day),
      subjectId: toIdString(slot.subjectId),
      teacherId: toIdString(slot.teacherId),
      room: slot.room === BREAK_MARKER ? '' : (slot.room ?? ''),
      isBreak: slot.room === BREAK_MARKER,
      _isEdit: true,
    },
  });

  return (
    <div className="space-y-4 pt-4">
      {/* Selectors + toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={selectedClass} onValueChange={(v) => { setSelectedClass(v); setEditMode(false); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Select class" /></SelectTrigger>
          <SelectContent>
            {classes.map((c) => (
              <SelectItem key={c._id} value={c._id}>{c.name}{c.stream ? ` ${c.stream}` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedTerm} onValueChange={(v) => { setSelectedTerm(v); setEditMode(false); }}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); setEditMode(false); }}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>

        {canWrite && timetable && !editMode && (
          <Button size="sm" variant="outline" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit Timetable
          </Button>
        )}
        {editMode && (
          <>
            <Button size="sm" variant="outline" onClick={openAddSlot}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add Slot
            </Button>
            <Button size="sm" onClick={() => saveSlots()} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>
              <X className="h-3.5 w-3.5 mr-1" />Cancel
            </Button>
          </>
        )}
      </div>

      {editMode && (
        <p className="text-xs text-muted-foreground">
          Hover over a slot to edit or delete it. ⚠️ marks indicate teacher schedule conflicts.
        </p>
      )}

      {classesError ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <AlertTriangle className="h-8 w-8 text-destructive opacity-60" />
          <p className="text-sm text-destructive">Failed to load classes. Please refresh the page.</p>
        </div>
      ) : !selectedClass ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Calendar className="h-8 w-8 opacity-40" />
          <p className="text-sm">Select a class to view its timetable</p>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : timetableError ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive opacity-60" />
          <p className="text-sm text-destructive">
            {timetableErr?.response?.data?.upgradeRequired
              ? 'Timetable is not available on your current plan. Please upgrade to access it.'
              : 'Failed to load timetable. Please try again.'}
          </p>
        </div>
      ) : !timetable ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Calendar className="h-8 w-8 opacity-40" />
          <p className="text-sm">No timetable found for this class / term / year</p>
          {canWrite && (
            <Button size="sm" onClick={() => createTimetable()} disabled={creating}>
              <Plus className="h-4 w-4 mr-1" />{creating ? 'Creating…' : 'Create Timetable'}
            </Button>
          )}
        </div>
      ) : (
        <TimetableGrid
          slots={displaySlots}
          canEdit={editMode}
          canCreateTimetable={canWrite}
          onEdit={openEditSlot}
          onDelete={deleteSlot}
        />
      )}

      <SlotDialog
        open={slotDialog.open}
        onClose={() => setSlotDialog({ open: false, initial: null })}
        initial={slotDialog.initial}
        subjects={subjects ?? []}
        teachers={teachers ?? []}
        teacherBusy={teacherBusy}
        onSave={slotDialog.initial?._isEdit ? editSlot : addSlot}
      />
    </div>
  );
}

// ── My Schedule tab (teacher) ──────────────────────────────────────────────────
function MyScheduleTab({ userId }) {
  const { academicYear: defaultAcademicYear, term: defaultTerm } = useSchoolTermDefaults(['timetable', 'term-defaults']);
  const [selectedTerm, setSelectedTerm] = useState(defaultTerm);
  const [selectedYear, setSelectedYear] = useState(defaultAcademicYear);

  useEffect(() => {
    setSelectedTerm(defaultTerm);
    setSelectedYear(defaultAcademicYear);
  }, [defaultTerm, defaultAcademicYear]);

  const { data, isLoading } = useQuery({
    queryKey: ['my-timetable', userId, selectedTerm, selectedYear],
    queryFn: async () => {
      const res = await timetableApi.list({ teacherId: userId, term: selectedTerm, academicYear: selectedYear, limit: 50 });
      return firstArray(
        res.data?.data,
        res.data?.timetables,
        res.data?.data?.timetables,
      );
    },
    enabled: !!userId,
  });

  const mySlots = useMemo(() => {
    if (!data) return [];
    const slots = [];
    for (const tt of data) {
      const className = typeof tt.classId === 'object'
        ? `${tt.classId.name}${tt.classId.stream ? ` ${tt.classId.stream}` : ''}`
        : '—';
      for (const slot of tt.slots ?? []) {
        const tid = typeof slot.teacherId === 'object' ? slot.teacherId?._id : slot.teacherId;
        if (String(tid) === String(userId)) slots.push({ ...slot, className });
      }
    }
    return slots;
  }, [data, userId]);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap gap-2">
        <Select value={selectedTerm} onValueChange={setSelectedTerm}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : mySlots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <CalendarDays className="h-8 w-8 opacity-40" />
          <p className="text-sm">No lessons assigned for {selectedTerm} {selectedYear}</p>
        </div>
      ) : (
        <>
          <TimetableGrid slots={mySlots} canEdit={false} showTeacher={false} showClass={true} />
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5" /> Weekly Summary — {mySlots.length} lesson{mySlots.length !== 1 ? 's' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {[...mySlots]
                  .sort((a, b) => DAYS.indexOf(normalizeDay(a.day)) - DAYS.indexOf(normalizeDay(b.day)) || a.period - b.period)
                  .map((slot, i) => {
                    const subject = typeof slot.subjectId === 'object' ? slot.subjectId : null;
                    return (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs w-24 justify-center shrink-0">
                            {dayLabel(slot.day).slice(0, 3)} P{slot.period}
                          </Badge>
                          <div>
                            <p className="text-sm font-medium">{subject?.name ?? '—'}</p>
                            <p className="text-xs text-muted-foreground">{slot.className}</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {slot.startTime} – {slot.endTime}
                          {slot.room && slot.room !== BREAK_MARKER ? ` · ${slot.room}` : ''}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── School calendar tab ────────────────────────────────────────────────────────
function SchoolCalendarTab() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
  });

  if (isLoading) return <div className="space-y-3 pt-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;

  const terms = settings?.terms ?? [];
  const holidays = settings?.holidays ?? [];

  return (
    <div className="space-y-5 pt-4 max-w-2xl">
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" /> Term Dates
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {terms.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-4">No term dates configured. Go to Settings to add term dates.</p>
          ) : (
            <div className="divide-y">
              {terms.map((t, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <Badge variant="secondary" className="text-xs">{t.name}</Badge>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {t.startDate ? formatDate(t.startDate) : '—'} → {t.endDate ? formatDate(t.endDate) : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {settings?.currentAcademicYear && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
          <span>Current Academic Year:</span>
          <Badge variant="secondary" className="font-mono">{settings.currentAcademicYear}</Badge>
        </div>
      )}

      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" /> School Holidays
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-4">No holidays configured. Go to Settings to add holidays.</p>
          ) : (
            <div className="divide-y">
              {[...holidays]
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map((h) => (
                  <div key={h._id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{h.name}</p>
                      {h.description && <p className="text-xs text-muted-foreground">{h.description}</p>}
                    </div>
                    <span className="text-sm text-muted-foreground tabular-nums">{formatDate(h.date)}</span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function TimetablePage() {
  const { user } = useAuthStore();
  const adminView = isAdmin(user);
  const isTeacher = ['teacher', 'department_head'].includes(user?.role);
  const canWrite = adminView || user?.role === 'deputy_headteacher';

  const defaultTab = isTeacher ? 'my-schedule' : 'class';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Timetable"
        description={isTeacher ? 'Your teaching schedule and school calendar' : 'Class schedules and school calendar'}
      />

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className={`grid w-full max-w-sm ${isTeacher ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {isTeacher && (
            <TabsTrigger value="my-schedule">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5" />My Schedule
            </TabsTrigger>
          )}
          <TabsTrigger value="class">
            <Users className="h-3.5 w-3.5 mr-1.5" />Class
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <Calendar className="h-3.5 w-3.5 mr-1.5" />Calendar
          </TabsTrigger>
        </TabsList>

        {isTeacher && (
          <TabsContent value="my-schedule">
            <MyScheduleTab userId={user?._id} />
          </TabsContent>
        )}
        <TabsContent value="class">
          <ClassTimetableTab canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="calendar">
          <SchoolCalendarTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
