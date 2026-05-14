'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Calendar, Plus, Pencil, Trash2, Save, X,
  CalendarDays, Users, BookOpen, Clock, AlertTriangle, Printer,
} from 'lucide-react';
import { timetableApi, classesApi, subjectsApi, usersApi, settingsApi, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { ACADEMIC_YEARS, TERMS } from '@/lib/constants';
import { useSchoolTermDefaults } from '@/hooks/use-school-term-defaults';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SkeletonList } from '@/components/shared/skeleton-list';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

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
const initials = (t) => t ? `${t.firstName?.[0] ?? ''}${t.lastName?.[0] ?? ''}`.toUpperCase() : '';
const SLOT_INIT = { day: 'monday', period: 1, startTime: '08:00', endTime: '08:40', subjectId: '', teacherId: '', room: '', isBreak: false };
const TIMETABLE_WRITE_ROLES = ['school_admin', 'headteacher', 'deputy_headteacher'];
const DEFAULT_PERIOD_PLAN = [
  { period: 1, startTime: '08:00', endTime: '08:40', isBreak: false },
  { period: 2, startTime: '08:40', endTime: '09:20', isBreak: false },
  { period: 3, startTime: '09:20', endTime: '09:40', isBreak: true },
  { period: 4, startTime: '09:40', endTime: '10:20', isBreak: false },
  { period: 5, startTime: '10:20', endTime: '11:00', isBreak: false },
  { period: 6, startTime: '11:00', endTime: '11:40', isBreak: false },
  { period: 7, startTime: '11:40', endTime: '12:20', isBreak: false },
  { period: 8, startTime: '12:20', endTime: '13:20', isBreak: true },
  { period: 9, startTime: '13:20', endTime: '14:00', isBreak: false },
  { period: 10, startTime: '14:00', endTime: '14:40', isBreak: false },
];
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
const sortPlan = (plan) => [...plan].sort((a, b) => a.period - b.period);
const renumberPlan = (plan) =>
  plan.map((row, index) => ({
    period: index + 1,
    startTime: row.startTime || '08:00',
    endTime: row.endTime || row.startTime || '08:40',
    isBreak: !!row.isBreak,
  }));
const addMinutes = (time, minutes) => {
  const [hours = 0, mins = 0] = String(time || '08:00').split(':').map(Number);
  const total = Math.max(0, hours * 60 + mins + minutes);
  const nextHours = Math.floor(total / 60) % 24;
  const nextMinutes = total % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
};
const derivePeriodPlan = (slots = []) => {
  const map = new Map();
  for (const slot of slots) {
    if (!slot?.period) continue;
    const existing = map.get(slot.period) ?? {
      period: slot.period,
      startTime: slot.startTime,
      endTime: slot.endTime,
      isBreak: false,
    };
    map.set(slot.period, {
      ...existing,
      startTime: existing.startTime || slot.startTime,
      endTime: existing.endTime || slot.endTime,
      isBreak: existing.isBreak || slot.room === BREAK_MARKER,
    });
  }
  const plan = sortPlan(Array.from(map.values()));
  return plan.length ? plan : DEFAULT_PERIOD_PLAN;
};
const serializeSlots = (lessonSlots, periodPlan) => {
  const rows = sortPlan(periodPlan);
  const slots = [];

  for (const row of rows) {
    if (row.isBreak) {
      for (const day of DAYS) {
        slots.push({
          day,
          period: row.period,
          startTime: row.startTime,
          endTime: row.endTime,
          room: BREAK_MARKER,
        });
      }
      continue;
    }

    for (const slot of lessonSlots.filter((s) => Number(s.period) === Number(row.period))) {
      const next = {
        day: normalizeDay(slot.day),
        period: row.period,
        startTime: row.startTime,
        endTime: row.endTime,
      };
      const subjectId = toIdString(slot.subjectId);
      const teacherId = toIdString(slot.teacherId);
      if (subjectId) next.subjectId = subjectId;
      if (teacherId) next.teacherId = teacherId;
      if (slot.room) next.room = slot.room;
      slots.push(next);
    }
  }

  return slots;
};

// ── Slot card ──────────────────────────────────────────────────────────────────
function SlotCard({ slot, onEdit, onDelete, canEdit, showTeacher = true, showClass = false }) {
  const subject = typeof slot.subjectId === 'object' ? slot.subjectId : null;
  const teacher = typeof slot.teacherId === 'object' ? slot.teacherId : null;
  const isBreak = slot.room === BREAK_MARKER;
  const day = normalizeDay(slot.day);

  if (isBreak) {
    return (
      <div className="rounded border bg-warn/8 border-warn/30 px-2 py-1.5 text-xs text-center text-warn font-medium relative group">
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
      {showTeacher && teacher && (
        <p className="font-mono text-[10px] text-muted-foreground tracking-widest">{initials(teacher)}</p>
      )}
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

// ── Day structure editor ──────────────────────────────────────────────────────
function PeriodPlanEditor({ periodPlan, onChange }) {
  const rows = sortPlan(periodPlan);

  const updateRow = (period, patch) => {
    onChange(rows.map((row) => (row.period === period ? { ...row, ...patch } : row)));
  };

  const deleteRow = (period) => {
    onChange(rows.filter((row) => row.period !== period));
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    const startTime = last?.endTime ?? '08:00';
    onChange([
      ...rows,
      {
        period: rows.length + 1,
        startTime,
        endTime: addMinutes(startTime, 40),
        isBreak: false,
      },
    ]);
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="py-3 px-4 border-b border-primary/10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> School Day Pattern
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Set lesson and break times once, then fill subjects directly in the grid below.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={addRow} disabled={rows.length >= 12}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Add Period
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.period} className="grid grid-cols-1 sm:grid-cols-[92px_1fr_1fr_112px_34px] gap-2 items-center rounded-md border bg-white/80 p-2">
              <Badge variant={row.isBreak ? 'secondary' : 'outline'} className="h-9 justify-center">
                {row.isBreak ? 'Break' : `Period ${row.period}`}
              </Badge>
              <Input
                type="time"
                value={row.startTime}
                onChange={(event) => updateRow(row.period, { startTime: event.target.value })}
                className="h-9"
                aria-label={`Start time for period ${row.period}`}
              />
              <Input
                type="time"
                value={row.endTime}
                onChange={(event) => updateRow(row.period, { endTime: event.target.value })}
                className="h-9"
                aria-label={`End time for period ${row.period}`}
              />
              <Select
                value={row.isBreak ? 'break' : 'lesson'}
                onValueChange={(value) => updateRow(row.period, { isBreak: value === 'break' })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lesson">Lesson</SelectItem>
                  <SelectItem value="break">Break</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-9 w-9 text-destructive"
                onClick={() => deleteRow(row.period)}
                disabled={rows.length <= 1}
                title="Remove period"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Timetable grid (period-row × day-column) ───────────────────────────────────
function TimetableGrid({
  slots,
  canEdit,
  onEdit,
  onDelete,
  onAddCell,
  showTeacher = true,
  showClass = false,
  canCreateTimetable = false,
  periodPlan,
}) {
  const periods = useMemo(() => {
    if (periodPlan?.length) return sortPlan(periodPlan);
    const map = new Map();
    for (const s of slots) {
      const existing = map.get(s.period) ?? {
        period: s.period,
        startTime: s.startTime,
        endTime: s.endTime,
        isBreak: false,
      };
      map.set(s.period, {
        ...existing,
        startTime: existing.startTime || s.startTime,
        endTime: existing.endTime || s.endTime,
        isBreak: existing.isBreak || s.room === BREAK_MARKER,
      });
    }
    return sortPlan(Array.from(map.values()));
  }, [slots, periodPlan]);

  const lookup = useMemo(() => {
    const m = {};
    for (const s of slots) {
      if (s.room === BREAK_MARKER) continue;
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
    <div className="space-y-3">
      <div className="md:hidden space-y-3">
        {DAYS.map((day) => (
          <div key={day} className="overflow-hidden rounded-lg border bg-background">
            <div className={`px-3 py-2 text-sm font-semibold ${DAY_HEADER[day]}`}>
              {dayLabel(day)}
            </div>
            <div className="divide-y">
              {periods.map(({ period, startTime, endTime, isBreak }) => {
                const slot = lookup[day]?.[period];
                return (
                  <div key={`${day}-${period}`} className="flex gap-3 p-3">
                    <div className="w-16 shrink-0 text-xs text-muted-foreground">
                      {isBreak ? (
                        <span className="font-semibold text-warn">Break</span>
                      ) : (
                        <>
                          <span className="block font-semibold text-foreground">P{period}</span>
                          <span className="block tabular-nums">{startTime}</span>
                          <span className="block tabular-nums">{endTime}</span>
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isBreak ? (
                        <div className="rounded border bg-warn/8 border-warn/30 px-2 py-2 text-xs text-center text-warn font-medium">
                          Break
                        </div>
                      ) : slot ? (
                        <div className="space-y-2">
                          <SlotCard
                            slot={slot}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            canEdit={false}
                            showTeacher={showTeacher}
                            showClass={showClass}
                          />
                          {canEdit && (
                            <div className="grid grid-cols-2 gap-2">
                              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => onEdit(slot)}>
                                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => onDelete(slot)}>
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : canEdit ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onAddCell?.({ day, period, startTime, endTime })}
                          className="h-9 w-full justify-center border-dashed text-xs"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" /> Add lesson
                        </Button>
                      ) : (
                        <p className="rounded border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          No lesson
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border md:block">
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
            {periods.map(({ period, startTime, endTime, isBreak }) => {
              const isBreakRow = !!isBreak;
              return (
                <tr key={period} className={isBreakRow ? 'bg-warn/5' : 'hover:bg-muted/10'}>
                  <td className="border-r border-b px-3 py-2 align-top text-[11px] text-muted-foreground whitespace-nowrap">
                    {isBreakRow ? (
                      <span className="text-warn font-semibold">Break</span>
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
                        {isBreakRow ? (
                          <div className="min-h-[36px] rounded border bg-warn/8 border-warn/30 px-2 py-2 text-xs text-center text-warn font-medium">
                            Break
                          </div>
                        ) : slot ? (
                          <SlotCard
                            slot={slot}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            canEdit={canEdit}
                            showTeacher={showTeacher}
                            showClass={showClass}
                          />
                        ) : canEdit ? (
                          <button
                            type="button"
                            onClick={() => onAddCell?.({ day, period, startTime, endTime })}
                            className="min-h-[36px] w-full rounded border border-dashed border-border text-xs text-muted-foreground transition hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                          >
                            + Add
                          </button>
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
    if (!form.isBreak && !form.subjectId) { toast.error('Select a subject for this slot'); return; }
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
          {initial?._fixedCell ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{dayLabel(form.day)}</span>
              <span className="text-muted-foreground"> · Period {form.period} · {form.startTime} - {form.endTime}</span>
            </div>
          ) : (
            <>
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
            </>
          )}

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
                  <div className="flex items-center gap-1.5 text-xs text-warn bg-warn/8 rounded px-2 py-1.5 border border-warn/30">
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
  const [periodPlan, setPeriodPlan] = useState(DEFAULT_PERIOD_PLAN);
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

  // Count teacher conflicts in the current timetable's slots
  const conflictsCount = useMemo(() => {
    if (!timetable?.slots || !Object.keys(teacherBusy).length) return 0;
    let count = 0;
    for (const slot of timetable.slots) {
      if (slot.room === BREAK_MARKER) continue;
      const tid = typeof slot.teacherId === 'object' ? slot.teacherId?._id : slot.teacherId;
      if (!tid) continue;
      const day = normalizeDay(slot.day);
      if (teacherBusy[tid]?.[day]?.has(slot.period)) count++;
    }
    return count;
  }, [timetable, teacherBusy]);

  const { mutate: createTimetable, isPending: creating } = useMutation({
    mutationFn: () => timetableApi.create({ classId: selectedClass, term: selectedTerm, academicYear: selectedYear, slots: [] }),
    onSuccess: (res) => {
      const created = res.data?.timetable ?? res.data?.data?.timetable ?? res.data?.data ?? res.data;
      toast.success('Timetable created');
      queryClient.setQueryData(['timetable', selectedClass, selectedTerm, selectedYear], created);
      queryClient.invalidateQueries({ queryKey: ['timetable'] });
      setEditMode(true);
      setPeriodPlan(DEFAULT_PERIOD_PLAN);
      setLocalSlots([]);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: saveSlots, isPending: saving } = useMutation({
    mutationFn: () =>
      timetableApi.updateSlots(timetable._id, {
        slots: serializeSlots(localSlots, periodPlan),
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
    const plan = derivePeriodPlan(timetable?.slots ?? []);
    const breakPeriods = new Set(plan.filter((row) => row.isBreak).map((row) => row.period));
    setLocalSlots(
      timetable?.slots
        ?.filter((s) => s.room !== BREAK_MARKER && !breakPeriods.has(s.period))
        .map((s) => ({
          ...s,
          day: normalizeDay(s.day),
          subjectId: toIdString(s.subjectId),
          teacherId: toIdString(s.teacherId),
        })) ?? []
    );
    setPeriodPlan(plan);
    setEditMode(true);
  };

  const cancelEdit = () => { setEditMode(false); setLocalSlots([]); };

  const addSlot = (slot) => setLocalSlots((prev) => [
    ...prev.filter((s) => !(normalizeDay(s.day) === normalizeDay(slot.day) && Number(s.period) === Number(slot.period))),
    slot,
  ]);

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
      startTime: periodPlan.find((row) => row.period === s.period)?.startTime ?? s.startTime,
      endTime: periodPlan.find((row) => row.period === s.period)?.endTime ?? s.endTime,
      subjectId: subjects?.find((sub) => toIdString(sub._id) === toIdString(s.subjectId)) ?? s.subjectId,
      teacherId: teachers?.find((t) => toIdString(t._id) === toIdString(s.teacherId)) ?? s.teacherId,
    }))
    : (timetable?.slots ?? []);

  const classes = classesData ?? [];

  const handlePeriodPlanChange = (draftPlan) => {
    const sortedDraft = sortPlan(draftPlan);
    const periodMap = new Map(sortedDraft.map((row, index) => [row.period, index + 1]));
    const nextPlan = renumberPlan(sortedDraft);
    const breakPeriods = new Set(nextPlan.filter((row) => row.isBreak).map((row) => row.period));
    setPeriodPlan(nextPlan);
    setLocalSlots((prev) => prev
      .map((slot) => ({ ...slot, period: periodMap.get(slot.period) }))
      .filter((slot) => slot.period && !breakPeriods.has(slot.period)));
  };

  const openAddCell = ({ day, period, startTime, endTime }) => setSlotDialog({
    open: true,
    initial: {
      ...SLOT_INIT,
      day,
      period,
      startTime,
      endTime,
      _fixedCell: true,
    },
  });
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
      _fixedCell: true,
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

        {timetable && !editMode && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/timetable/${timetable._id}/print`, '_blank')}
          >
            <Printer className="h-3.5 w-3.5 mr-1.5" />Print
          </Button>
        )}
        {canWrite && timetable && !editMode && (
          <Button size="sm" variant="outline" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit Timetable
          </Button>
        )}
        {editMode && (
          <>
            <Button size="sm" onClick={() => saveSlots()} disabled={saving || !timetable}>
              <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>
              <X className="h-3.5 w-3.5 mr-1" />Cancel
            </Button>
          </>
        )}
      </div>

      {editMode && (
        <>
          <PeriodPlanEditor periodPlan={periodPlan} onChange={handlePeriodPlanChange} />
          <p className="text-xs text-muted-foreground">
            Tap an empty cell to add a lesson. On desktop, hover over a filled cell to edit or delete it. Warning marks indicate teacher schedule conflicts.
          </p>
        </>
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
        <div className="space-y-3">
          {conflictsCount > 0 && (
            <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warn" />
              <span>
                <strong>{conflictsCount} scheduling conflict{conflictsCount !== 1 ? 's' : ''}</strong>
                {' '}— one or more teachers are assigned to multiple classes at the same period.
              </span>
            </div>
          )}
          <TimetableGrid
            slots={displaySlots}
            canEdit={editMode}
            canCreateTimetable={canWrite}
            periodPlan={editMode ? periodPlan : undefined}
            onAddCell={openAddCell}
            onEdit={openEditSlot}
            onDelete={deleteSlot}
          />
        </div>
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

  if (isLoading) return <SkeletonList count={3} className="h-24" spacing="space-y-3 pt-4" />;

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
  const isTeacher = ['teacher', 'department_head'].includes(user?.role);
  const canWrite = TIMETABLE_WRITE_ROLES.includes(user?.role);

  const defaultTab = isTeacher ? 'my-schedule' : 'class';

  return (
    <div className="space-y-5">
      <PageHeader
        overline="Timetable"
        title="Timetable"
        description={isTeacher ? 'Your teaching schedule and school calendar' : 'Class schedules and school calendar'}
      />

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className={`grid w-full max-w-md ${isTeacher ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {isTeacher && (
            <TabsTrigger value="my-schedule" className="gap-1 px-2 text-xs sm:text-sm">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />My Schedule
            </TabsTrigger>
          )}
          <TabsTrigger value="class" className="gap-1 px-2 text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5 shrink-0" />Class
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1 px-2 text-xs sm:text-sm">
            <Calendar className="h-3.5 w-3.5 shrink-0" />Calendar
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
