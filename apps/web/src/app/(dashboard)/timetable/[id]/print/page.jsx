'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Loader2, Printer, X } from 'lucide-react';
import { timetableApi, schoolsApi, settingsApi } from '@/lib/api';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const BREAK_MARKER = '__BREAK__';

const DAY_PRINT_COLORS = {
  monday:    { header: '#dbeafe', cell: '#eff6ff' },
  tuesday:   { header: '#ede9fe', cell: '#f5f3ff' },
  wednesday: { header: '#dcfce7', cell: '#f0fdf4' },
  thursday:  { header: '#fef9c3', cell: '#fefce8' },
  friday:    { header: '#ffe4e6', cell: '#fff1f2' },
};

const dayLabel = (d) => d[0].toUpperCase() + d.slice(1);

const normalizeDay = (v) => {
  const d = String(v ?? '').toLowerCase();
  return DAYS.includes(d) ? d : DAYS[0];
};

const sortPlan = (plan) => [...plan].sort((a, b) => a.period - b.period);

function derivePeriodPlan(slots = []) {
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
  return sortPlan(Array.from(map.values()));
}

export default function TimetablePrintPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const { data: timetable, isLoading: ttLoading } = useQuery({
    queryKey: ['timetable-print', id],
    queryFn: async () => {
      const res = await timetableApi.get(id);
      return res.data?.timetable ?? res.data?.data ?? res.data;
    },
    enabled: !!id,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings-print-tt'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
  });

  const { data: school } = useQuery({
    queryKey: ['school-print-tt'],
    queryFn: async () => {
      const res = await schoolsApi.me();
      return res.data?.school ?? res.data?.data ?? res.data;
    },
  });

  const ready = !ttLoading && !!timetable;

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [ready]);

  const slots = timetable?.slots ?? [];

  const periods = useMemo(() => derivePeriodPlan(slots), [slots]);

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

  const classId = timetable?.classId;
  const className = classId
    ? `${classId.name ?? ''}${classId.stream ? ` ${classId.stream}` : ''}`
    : '—';

  const schoolName = school?.name ?? settings?.schoolName ?? 'School';
  const logoUrl    = settings?.logo ?? '';
  const motto      = settings?.motto ?? '';
  const contact    = [school?.phone, school?.email].filter(Boolean).join(' · ');
  const address    = settings?.physicalAddress ?? school?.address ?? '';

  const generatedAt = new Date().toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  if (ttLoading || !timetable) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Preparing timetable…</span>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @page {
          size: A4 landscape;
          margin: 10mm 12mm;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-page { padding: 0; }
        }
        .tt-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
        .tt-table th, .tt-table td { border: 1px solid #d1d5db; padding: 4px 5px; vertical-align: top; }
        .tt-period-col { width: 68px; min-width: 68px; }
        .tt-break-row td { background: #fef9c3 !important; text-align: center; color: #92400e; font-weight: 600; }
        .tt-empty { min-height: 38px; display: block; }
        .tt-slot { border-radius: 4px; padding: 3px 4px; min-height: 38px; }
        .tt-subject { font-weight: 700; font-size: 11.5px; line-height: 1.3; }
        .tt-teacher { font-size: 9.5px; color: #374151; margin-top: 2px; }
        .tt-room { font-size: 9px; color: #6b7280; margin-top: 1px; }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print sticky top-0 z-10 border-b bg-muted">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <p className="text-sm font-medium">Timetable Preview — {className}</p>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-foreground text-background text-sm rounded-md hover:bg-foreground/90 transition-colors"
            >
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
            <button
              onClick={() => window.close()}
              className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" /> Close
            </button>
          </div>
        </div>
        {/* Tip: browsers add their own header/footer (URL, date, page number) which can only
            be removed by the user unchecking "Headers and footers" in the print dialog. */}
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-800 text-xs">
          <span className="font-semibold shrink-0">Tip:</span>
          In the print dialog, uncheck <strong className="mx-0.5">Headers and footers</strong> to remove the browser-added URL, date, and page number from the printout.
        </div>
      </div>

      {/* Print content */}
      <div className="print-page max-w-[297mm] mx-auto px-4 py-4 bg-white">

        {/* School header */}
        <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo"
                style={{ height: 52, width: 52, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 6, padding: 3, background: '#fff', flexShrink: 0 }}
              />
            )}
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, fontSize: 16, margin: 0, lineHeight: 1.2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{schoolName}</p>
              {motto && <p style={{ fontSize: 11, fontStyle: 'italic', color: '#4b5563', margin: '2px 0 0' }}>"{motto}"</p>}
              {contact && <p style={{ fontSize: 10, color: '#374151', margin: '3px 0 0' }}>{contact}</p>}
              {address && <p style={{ fontSize: 10, color: '#374151', margin: '2px 0 0' }}>{address}</p>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', margin: 0 }}>Class Timetable</p>
              <p style={{ fontWeight: 700, fontSize: 14, margin: '2px 0 0' }}>{className}</p>
              <p style={{ fontSize: 10, color: '#374151', margin: '3px 0 0' }}>
                {timetable.term} &nbsp;·&nbsp; {timetable.academicYear}
              </p>
              <p style={{ fontSize: 9, color: '#9ca3af', margin: '4px 0 0' }}>Generated: {generatedAt}</p>
            </div>
          </div>
        </div>

        {/* Timetable grid */}
        <table className="tt-table">
          <thead>
            <tr>
              <th
                className="tt-period-col"
                style={{ background: '#f3f4f6', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#6b7280' }}
              >
                Period / Time
              </th>
              {DAYS.map((day) => (
                <th
                  key={day}
                  style={{
                    background: DAY_PRINT_COLORS[day].header,
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  {dayLabel(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map(({ period, startTime, endTime, isBreak }) => {
              if (isBreak) {
                return (
                  <tr key={period} className="tt-break-row">
                    <td style={{ background: '#fef9c3', textAlign: 'left', color: '#92400e' }}>
                      <span style={{ fontWeight: 600 }}>Break</span>
                      <br />
                      <span style={{ fontSize: 9, fontWeight: 400 }}>{startTime} – {endTime}</span>
                    </td>
                    {DAYS.map((day) => (
                      <td key={day} style={{ background: '#fef9c3', textAlign: 'center', color: '#a16207', fontSize: 10 }}>
                        ☕ Break
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <tr key={period}>
                  <td className="tt-period-col" style={{ background: '#f9fafb' }}>
                    <span style={{ fontWeight: 700, fontSize: 11, display: 'block' }}>P{period}</span>
                    <span style={{ fontSize: 9, color: '#6b7280', display: 'block' }}>{startTime}</span>
                    <span style={{ fontSize: 9, color: '#9ca3af', display: 'block' }}>– {endTime}</span>
                  </td>
                  {DAYS.map((day) => {
                    const slot = lookup[day]?.[period];
                    const colors = DAY_PRINT_COLORS[day];

                    if (!slot) {
                      return (
                        <td key={day} style={{ background: '#fafafa' }}>
                          <span className="tt-empty" />
                        </td>
                      );
                    }

                    const subject = typeof slot.subjectId === 'object' ? slot.subjectId : null;
                    const teacher = typeof slot.teacherId === 'object' ? slot.teacherId : null;
                    const room    = slot.room && slot.room !== BREAK_MARKER ? slot.room : null;

                    return (
                      <td key={day} style={{ background: colors.cell }}>
                        <div className="tt-slot" style={{ background: colors.cell }}>
                          <div className="tt-subject">{subject?.name ?? <em style={{ color: '#9ca3af', fontWeight: 400 }}>—</em>}</div>
                          {teacher && (
                            <div className="tt-teacher">
                              {teacher.firstName} {teacher.lastName}
                            </div>
                          )}
                          {room && <div className="tt-room">📍 {room}</div>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Footer */}
        <p style={{ fontSize: 9, color: '#9ca3af', textAlign: 'center', marginTop: 10, borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
          {schoolName} · {timetable.term} {timetable.academicYear} · {className} · Printed {generatedAt}
        </p>
      </div>
    </>
  );
}
