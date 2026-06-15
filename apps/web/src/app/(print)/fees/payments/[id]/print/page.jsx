'use client';

import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Printer, X } from 'lucide-react';
import { feesApi, schoolsApi, settingsApi } from '@/lib/api';
import { formatDate, formatCurrency, capitalize } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/use-signed-url';

// Shared style for any element that has a background colour that must survive print.
const printBg = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

export default function PaymentReceiptPrintPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const { data: payment, isLoading } = useQuery({
    queryKey: ['payment-print', id],
    queryFn: async () => {
      const res = await feesApi.getPayment(id);
      return res.data?.payment ?? res.data?.data ?? res.data;
    },
    enabled: !!id,
  });

  const {
    mutate: issueReceipt,
    data: issuedPayment,
    isPending: issuingReceipt,
    isError: issueFailed,
  } = useMutation({
    mutationFn: async () => {
      const res = await feesApi.issueReceipt(id);
      return res.data?.payment ?? res.data?.data ?? res.data;
    },
    onError: () => toast.error('You do not have permission to issue this receipt'),
  });

  const { data: school } = useQuery({
    queryKey: ['school-me-receipt'],
    queryFn: async () => {
      const res = await schoolsApi.me();
      return res.data?.school ?? res.data?.data ?? res.data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ['settings-receipt'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
  });

  const receipt = issuedPayment ?? payment;

  const { data: balanceData } = useQuery({
    queryKey: ['fee-balance-receipt', receipt?.studentId?._id ?? receipt?.studentId, receipt?.academicYear, receipt?.term],
    queryFn: async () => {
      const studentId = typeof receipt.studentId === 'object' ? receipt.studentId._id : receipt.studentId;
      const res = await feesApi.getBalance({ studentId, academicYear: receipt.academicYear, term: receipt.term });
      return res.data;
    },
    enabled: !!(receipt?.studentId && receipt?.academicYear && receipt?.term),
  });

  useEffect(() => {
    if (!id || isLoading || !payment || issuingReceipt || issuedPayment || issueFailed) return;
    issueReceipt();
  }, [id, isLoading, payment, issuingReceipt, issuedPayment, issueFailed, issueReceipt]);

  // Set PDF filename: "Victor Njoroge - HA035-2025 - Receipt"
  useEffect(() => {
    if (!receipt) return;
    const s = receipt.studentId;
    if (s?.firstName) {
      const adm = s.admissionNumber ? ` - ${s.admissionNumber}` : '';
      document.title = `${s.firstName} ${s.lastName}${adm} - Receipt`;
    }
    return () => { document.title = 'Diraschool'; };
  }, [receipt]);

  useEffect(() => {
    if (issuedPayment) {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [issuedPayment]);

  const schoolLogo  = useSignedUrl(settings?.logo ?? null);

  if (isLoading || !payment || issuingReceipt) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Preparing receipt…</span>
      </div>
    );
  }

  if (issueFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-destructive">You do not have permission to issue this receipt.</p>
      </div>
    );
  }

  const student     = receipt?.studentId;
  const receiptDate = receipt.receiptIssuedAt ?? receipt.paymentDate ?? receipt.createdAt;
  const recorder    = receipt.receiptIssuedByUserId
    ? `${receipt.receiptIssuedByUserId.firstName} ${receipt.receiptIssuedByUserId.lastName}`
    : receipt.recordedByUserId
      ? `${receipt.recordedByUserId.firstName} ${receipt.recordedByUserId.lastName}`
      : '—';
  const className   = receipt.classId
    ? `${receipt.classId.name}${receipt.classId.stream ? ` ${receipt.classId.stream}` : ''}`
    : '—';
  const schoolName  = school?.name ?? settings?.schoolName ?? 'School';
  const schoolAddr  = [school?.address, school?.county].filter(Boolean).join(', ');
  const schoolPhone = school?.phone ?? '';

  const leftRows = [
    ['Student Name', student ? `${student.firstName} ${student.lastName}` : '—'],
    ['Admission No.', student?.admissionNumber ?? '—'],
    ['Class', className],
  ];

  const rightRows = [
    ['Date', receiptDate ? formatDate(receiptDate) : '—'],
    ['Academic Year', receipt.academicYear ?? '—'],
    ['Term', receipt.term ?? '—'],
  ];

  const detailRows = [
    ['Payment Method', capitalize(receipt.method ?? '')],
    receipt.reference ? ['Ref / Transaction Code', receipt.reference] : null,
    ['Issued By', recorder],
    receipt.notes ? ['Notes', receipt.notes] : null,
  ].filter(Boolean);

  const outstanding = balanceData?.outstanding ?? 0;
  const overpaid    = balanceData?.overpaid ?? 0;

  const balanceBg    = outstanding > 0 ? '#fff5f5' : '#f0fdf4';
  const balanceColor = outstanding > 0 ? '#dc2626' : '#16a34a';
  const balanceLabel = outstanding > 0 ? 'Balance Due' : overpaid > 0 ? 'Overpaid (Credit)' : 'Balance Due';
  const balanceValue = outstanding > 0 ? formatCurrency(outstanding) : overpaid > 0 ? formatCurrency(overpaid) : 'Nil — Fully Paid';

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        @page { size: A5; margin: 10mm 12mm; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; }
          .no-print { display: none !important; }
          .screen-wrap { padding: 0 !important; background: white !important; min-height: unset !important; }
          #receipt-root {
            box-shadow: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
        @media screen {
          body { background: #e5e7eb; }
        }
      `}</style>

      {/* Screen toolbar */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 px-5 py-3 bg-white border-b shadow-sm">
        <p className="text-sm font-semibold text-gray-700">Receipt Preview</p>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
          >
            <Printer className="h-4 w-4" /> Print / Save PDF
          </button>
          <button
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>

      {/* Screen preview wrapper */}
      <div className="screen-wrap" style={{ padding: '32px 16px 48px', minHeight: '100vh' }}>
        <div
          id="receipt-root"
          style={{
            fontFamily: "'Segoe UI', Arial, sans-serif",
            color: '#111',
            background: '#fff',
            width: '480px',
            margin: '0 auto',
            padding: '24px 28px',
            boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
            position: 'relative',
          }}
        >
          {/* Watermark — absolutely positioned, no overflow:hidden needed */}
          <div aria-hidden style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%) rotate(-35deg)',
            fontSize: '26px', fontWeight: 800,
            color: 'rgba(0,0,0,0.04)',
            whiteSpace: 'nowrap', pointerEvents: 'none',
            letterSpacing: '3px', textTransform: 'uppercase',
            fontFamily: 'Arial, sans-serif',
            userSelect: 'none',
            zIndex: 0,
            ...printBg,
          }}>
            Property of {schoolName}
          </div>

          {/* All content sits above watermark */}
          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {schoolLogo && (
                  <img src={schoolLogo} alt="logo" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                )}
                <div>
                  <p style={{ fontWeight: 700, fontSize: '14px', lineHeight: '1.2', margin: 0 }}>{schoolName}</p>
                  {schoolAddr  && <p style={{ fontSize: '10px', color: '#555', margin: '2px 0 0' }}>{schoolAddr}</p>}
                  {schoolPhone && <p style={{ fontSize: '10px', color: '#555', margin: '1px 0 0' }}>{schoolPhone}</p>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#888', margin: '0 0 2px' }}>Receipt No.</p>
                <p style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, margin: 0 }}>{receipt.receiptNumber ?? '—'}</p>
              </div>
            </div>

            {/* ── Title bar ── */}
            <div style={{
              background: '#111', color: '#fff', textAlign: 'center',
              padding: '7px 0', letterSpacing: '2.5px', fontSize: '9px',
              fontWeight: 700, textTransform: 'uppercase', marginBottom: '16px',
              ...printBg,
            }}>
              Fee Payment Receipt
            </div>

            {/* ── Two-column student / date info ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px', marginBottom: '4px' }}>
              <div>
                {leftRows.map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', padding: '5px 0', fontSize: '11px' }}>
                    <span style={{ color: '#555' }}>{label}</span>
                    <span style={{ fontWeight: 600, textAlign: 'right', maxWidth: '55%' }}>{value}</span>
                  </div>
                ))}
              </div>
              <div>
                {rightRows.map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', padding: '5px 0', fontSize: '11px' }}>
                    <span style={{ color: '#555' }}>{label}</span>
                    <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Additional detail rows ── */}
            {detailRows.map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', padding: '5px 0', fontSize: '11px' }}>
                <span style={{ color: '#555' }}>{label}</span>
                <span style={{ fontWeight: 600 }}>{value}</span>
              </div>
            ))}

            {/* ── Amount paid ── */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#111', color: '#fff', padding: '10px 14px', marginTop: '14px',
              ...printBg,
            }}>
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>Amount Paid</span>
              <span style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700 }}>
                {formatCurrency(receipt.amount)}
              </span>
            </div>

            {/* ── Balance summary ── */}
            {balanceData && (
              <div style={{ marginTop: '10px', border: '1px solid #e5e7eb' }}>
                {balanceData.feeStructure && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 12px', fontSize: '10.5px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', ...printBg }}>
                    <span style={{ color: '#555' }}>Term fees ({receipt.academicYear} — {receipt.term})</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatCurrency(balanceData.feeStructure.totalAmount)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 12px', fontSize: '10.5px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', ...printBg }}>
                  <span style={{ color: '#555' }}>Total paid (all payments this term)</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatCurrency(balanceData.totalPaid ?? 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', fontSize: '11px', fontWeight: 700, background: balanceBg, ...printBg }}>
                  <span style={{ color: balanceColor }}>{balanceLabel}</span>
                  <span style={{ fontFamily: 'monospace', color: balanceColor }}>{balanceValue}</span>
                </div>
              </div>
            )}

            {/* ── Signature row ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '28px', gap: '24px' }}>
              <div style={{ flex: 1, borderTop: '1px solid #111', paddingTop: '5px', textAlign: 'center', fontSize: '9px', color: '#555' }}>
                Authorised Signature
              </div>
              <div style={{ flex: 1, borderTop: '1px solid #111', paddingTop: '5px', textAlign: 'center', fontSize: '9px', color: '#555' }}>
                School Stamp
              </div>
            </div>

            {/* ── Footer ── */}
            <p style={{ marginTop: '18px', textAlign: 'center', fontSize: '9px', color: '#888', borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
              This is an official receipt. Please retain for your records.
            </p>

          </div>{/* /z-index wrapper */}
        </div>
      </div>
    </>
  );
}
