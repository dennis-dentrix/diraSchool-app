'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { reportCardsApi, settingsApi, schoolsApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { SchoolDocumentHeader } from '@/components/shared/school-document-header';
import { PrivateImage } from '@/components/shared/private-image';

const GRADE_LABELS = {
  EE: 'Exceeds Expectation',
  ME: 'Meets Expectation',
  AE: 'Approaches Expectation',
  BE: 'Below Expectation',
  EE1: 'Exceeds Expectation (High)',
  EE2: 'Exceeds Expectation',
  ME1: 'Meets Expectation (High)',
  ME2: 'Meets Expectation',
  AE1: 'Approaches Expectation (High)',
  AE2: 'Approaches Expectation',
  BE1: 'Below Expectation (High)',
  BE2: 'Below Expectation',
};

export default function ReportCardPrintPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const { data: rc, isLoading } = useQuery({
    queryKey: ['report-card-print', id],
    queryFn: async () => {
      const res = await reportCardsApi.get(id);
      return res.data?.reportCard ?? res.data?.data ?? res.data;
    },
    enabled: !!id,
  });

  const { data: school } = useQuery({
    queryKey: ['school-me-print'],
    queryFn: async () => {
      const res = await schoolsApi.me();
      return res.data?.school ?? res.data?.data ?? res.data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ['settings-print'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
  });

  useEffect(() => {
    if (!isLoading && rc) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, rc]);

  if (isLoading || !rc) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Preparing report card…</span>
      </div>
    );
  }

  const student = rc.studentId;
  const cls = rc.classId;
  const att = rc.attendanceSummary ?? {};
  const principalName = settings?.principalName ?? '';
  const documentSerial = rc.documentSerial ?? `RPT-${rc.academicYear}-${String(rc._id).slice(-6).toUpperCase()}`;

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden; }
          #report-print-root, #report-print-root * { visibility: visible; }
          #report-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        #report-print-root { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #111; }
        #report-print-root table { border-collapse: collapse; width: 100%; }
        #report-print-root th, #report-print-root td { border: 1px solid #333; padding: 4px 6px; }
        #report-print-root th { background-color: #e5e7eb; font-weight: 700; }
        .grade-EE, .grade-EE1, .grade-EE2 { background-color: #d1fae5 !important; color: #065f46 !important; font-weight: 700; }
        .grade-ME, .grade-ME1, .grade-ME2 { background-color: #dbeafe !important; color: #1e40af !important; font-weight: 700; }
        .grade-AE, .grade-AE1, .grade-AE2 { background-color: #fef9c3 !important; color: #854d0e !important; font-weight: 700; }
        .grade-BE, .grade-BE1, .grade-BE2 { background-color: #fee2e2 !important; color: #991b1b !important; font-weight: 700; }
      `}</style>

      {/* Print bar — hidden when printing */}
      <div className="no-print flex justify-end p-4 bg-gray-50 border-b print:hidden">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-700"
        >
          Print / Save as PDF
        </button>
        <button
          onClick={() => window.close()}
          className="ml-2 px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
        >
          Close
        </button>
      </div>

      <div className="max-w-[780px] mx-auto p-6 bg-white" id="report-print-root">

        <SchoolDocumentHeader
          school={school}
          settings={settings}
          title="Academics"
          subtitle="Student Progress Report Card"
          serial={documentSerial}
          generatedAt={formatDate(rc.generatedAt ?? rc.createdAt)}
        />

        {/* Student details */}
        <table className="mb-4 text-sm">
          <tbody>
            <tr>
              <td className="font-bold w-36 bg-gray-50">Student Name</td>
              <td className="font-medium" colSpan={3}>
                {typeof student === 'object'
                  ? `${student.firstName} ${student.lastName}`.toUpperCase()
                  : '—'}
              </td>
              <td className="w-24 p-1 align-middle text-center" rowSpan={3}>
                {typeof student === 'object' && student.photo ? (
                  <PrivateImage
                    src={student.photo}
                    alt={`${student.firstName} ${student.lastName}`}
                    style={{ width: '70px', height: '70px', objectFit: 'cover', borderRadius: '6px', margin: '0 auto' }}
                  />
                ) : (
                  <div style={{ width: '70px', height: '70px', border: '1px solid #333', margin: '0 auto' }} />
                )}
              </td>
            </tr>
            <tr>
              <td className="font-bold bg-gray-50">Admission No.</td>
              <td>{typeof student === 'object' ? student.admissionNumber : '—'}</td>
              <td className="font-bold bg-gray-50 w-28">Gender</td>
              <td className="capitalize">{typeof student === 'object' ? student.gender : '—'}</td>
            </tr>
            <tr>
              <td className="font-bold bg-gray-50">Class</td>
              <td>{cls ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—'}</td>
              <td className="font-bold bg-gray-50">Level</td>
              <td className="capitalize">{cls?.levelCategory?.replace(/_/g, ' ') ?? '—'}</td>
            </tr>
            <tr>
              <td className="font-bold bg-gray-50">Academic Year</td>
              <td>{rc.academicYear}</td>
              <td className="font-bold bg-gray-50">Term</td>
              <td>{rc.term}</td>
            </tr>
            <tr>
              <td className="font-bold bg-gray-50">Date Generated</td>
              <td>{formatDate(rc.generatedAt ?? rc.createdAt)}</td>
              <td className="font-bold bg-gray-50">Status</td>
              <td className="capitalize font-semibold">{rc.status}</td>
            </tr>
            <tr>
              <td className="font-bold bg-gray-50">Document Serial</td>
              <td colSpan={3} className="font-mono font-semibold">{documentSerial}</td>
            </tr>
          </tbody>
        </table>

        {/* Attendance */}
        <div className="mb-4">
          <h3 className="font-bold text-sm uppercase tracking-wide mb-1 bg-gray-200 px-2 py-1">
            Attendance Summary
          </h3>
          <table className="text-sm text-center">
            <thead>
              <tr>
                <th>Total School Days</th>
                <th>Days Present</th>
                <th>Days Absent</th>
                <th>Days Late</th>
                <th>Days Excused</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-semibold">{att.totalDays ?? 0}</td>
                <td className="font-semibold">{att.present ?? 0}</td>
                <td className="font-semibold">{att.absent ?? 0}</td>
                <td className="font-semibold">{att.late ?? 0}</td>
                <td className="font-semibold">{att.excused ?? 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Subject performance */}
        <div className="mb-4">
          <h3 className="font-bold text-sm uppercase tracking-wide mb-1 bg-gray-200 px-2 py-1">
            Subject Performance
          </h3>
          <table className="text-sm">
            <thead>
              <tr>
                <th className="text-left w-48">Subject</th>
                <th className="text-center w-16">Avg %</th>
                <th className="text-center w-16">Grade</th>
                <th className="text-center w-12">Pts</th>
                <th className="text-left">Teacher&apos;s Remark</th>
              </tr>
            </thead>
            <tbody>
              {(rc.subjects ?? []).map((subject) => (
                <tr key={subject.subjectId?.toString() ?? subject.subjectName}>
                  <td className="font-medium">{subject.subjectName}</td>
                  <td className="text-center tabular-nums">{subject.averagePercentage?.toFixed(1) ?? '—'}%</td>
                  <td className={`text-center font-bold grade-${subject.grade ?? ''}`}>
                    {subject.grade ?? '—'}
                  </td>
                  <td className="text-center tabular-nums font-semibold">{subject.points ?? '—'}</td>
                  <td className="text-xs">{subject.teacherRemark ?? ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                <td>OVERALL</td>
                <td className="text-center">—</td>
                <td className={`text-center grade-${rc.overallGrade ?? ''}`}>{rc.overallGrade ?? '—'}</td>
                <td className="text-center tabular-nums">{rc.averagePoints?.toFixed(2) ?? '—'}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* CBC Grading key */}
        <div className="mb-4">
          <h3 className="font-bold text-sm uppercase tracking-wide mb-1 bg-gray-200 px-2 py-1">
            CBC Grading Key
          </h3>
          <table className="text-xs">
            <thead>
              <tr>
                <th className="text-center w-16">Grade</th>
                <th className="text-left">Description</th>
                <th className="text-center w-24">Score Range</th>
              </tr>
            </thead>
            <tbody>
              {cls?.levelCategory === 'jss' ? (
                [
                  ['EE1', '75–100%'], ['EE2', '65–74%'],
                  ['ME1', '55–64%'], ['ME2', '45–54%'],
                  ['AE1', '35–44%'], ['AE2', '25–34%'],
                  ['BE1', '15–24%'], ['BE2', '0–14%'],
                ].map(([g, range]) => (
                  <tr key={g}>
                    <td className={`text-center font-bold grade-${g}`}>{g}</td>
                    <td>{GRADE_LABELS[g]}</td>
                    <td className="text-center">{range}</td>
                  </tr>
                ))
              ) : (
                [
                  ['EE', '75–100%'], ['ME', '50–74%'],
                  ['AE', '25–49%'],  ['BE', '0–24%'],
                ].map(([g, range]) => (
                  <tr key={g}>
                    <td className={`text-center font-bold grade-${g}`}>{g}</td>
                    <td>{GRADE_LABELS[g]}</td>
                    <td className="text-center">{range}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Remarks */}
        <div className="mb-6">
          <h3 className="font-bold text-sm uppercase tracking-wide mb-1 bg-gray-200 px-2 py-1">
            Remarks
          </h3>
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="font-bold bg-gray-50 w-44 align-top">Class Teacher&apos;s Remarks</td>
                <td className="min-h-[48px]">{rc.teacherRemarks || ''}</td>
              </tr>
              <tr>
                <td className="font-bold bg-gray-50 align-top">Principal&apos;s Remarks</td>
                <td className="min-h-[48px]">{rc.principalRemarks || ''}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Signatures — dashed lines */}
        <div className="mt-8 grid grid-cols-3 gap-8 text-sm text-center">
          <div>
            <div className="border-b border-dashed border-black mb-1 h-10" />
            <p className="font-semibold">Class Teacher</p>
            <p className="text-xs text-gray-500">Signature &amp; Date</p>
          </div>
          <div>
            <div className="border-b border-dashed border-black mb-1 h-10 flex items-end justify-center pb-1">
              {principalName && <span className="text-xs font-medium text-gray-600">{principalName}</span>}
            </div>
            <p className="font-semibold">Principal / Head Teacher</p>
            <p className="text-xs text-gray-500">Signature &amp; Date</p>
          </div>
          <div>
            <div className="border-b border-dashed border-black mb-1 h-10" />
            <p className="font-semibold">Parent / Guardian</p>
            <p className="text-xs text-gray-500">Signature &amp; Date</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-3 border-t border-gray-300 text-center text-xs text-gray-400">
          Serial: {documentSerial} · Generated by DiraSchool · {school?.name ?? ''} · {rc.academicYear} {rc.term}
        </div>
      </div>
    </>
  );
}
