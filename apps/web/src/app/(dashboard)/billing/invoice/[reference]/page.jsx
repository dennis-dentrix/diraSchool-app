'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { subscriptionsApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

const fmt = (n) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtCycle = (c) => ({ 'per-term': 'Per Term', annual: 'Annual (3 terms)', 'multi-year': '3-Year Annual' }[c] ?? c);

export default function InvoicePage() {
  const { reference } = useParams();
  const { user } = useAuthStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing', 'paystack-status', reference],
    queryFn: async () => {
      const res = await subscriptionsApi.getStatus(reference);
      return res.data?.payment
        ? { payment: res.data.payment, school: res.data.school }
        : { payment: res.data?.data?.payment, school: res.data?.data?.school };
    },
    enabled: Boolean(reference),
  });

  if (isLoading) return (
    <div className="max-w-2xl mx-auto p-8 space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );

  if (error || !data?.payment) return (
    <div className="max-w-2xl mx-auto p-8 text-center text-muted-foreground">
      Invoice not found or you don't have permission to view it.
    </div>
  );

  const { payment, school } = data;
  const schoolName = school?.name ?? user?.school?.name ?? 'School';
  const invoiceNumber = `INV-${String(payment._id ?? reference).slice(-8).toUpperCase()}`;
  const exVat = payment.subtotalExVat ?? Math.round(payment.amount / 1.16);
  const vat = payment.vatAmount ?? (payment.amount - exVat);
  const addOnsEnabled = Object.entries(payment.addOns ?? {}).filter(([, v]) => v).map(([k]) =>
    ({ transport: 'Transport Module', sms: 'Bulk SMS Module' }[k] ?? k)
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Print button — hidden in print */}
      <div className="flex justify-end gap-2 mb-4 print:hidden">
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      {/* Invoice document */}
      <div className="bg-white border rounded-xl p-8 shadow-sm print:shadow-none print:border-0 print:rounded-none print:p-0">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">DiraSchool</h1>
            <p className="text-sm text-slate-500 mt-1">School Management System</p>
            <p className="text-xs text-slate-400 mt-0.5">contact@diraschool.com</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">Invoice</p>
            <p className="text-xl font-bold text-slate-900">{invoiceNumber}</p>
            {payment.paidAt && (
              <p className="text-xs text-slate-500 mt-1">{fmtDate(payment.paidAt)}</p>
            )}
          </div>
        </div>

        {/* Bill to */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Bill to</p>
          <p className="font-semibold text-slate-900">{schoolName}</p>
          {school?.email && <p className="text-sm text-slate-500">{school.email}</p>}
          {school?.phone && <p className="text-sm text-slate-500">{school.phone}</p>}
        </div>

        {/* Line items */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="text-left py-2 pr-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">Description</th>
              <th className="text-right py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-3 pr-4">
                <p className="font-medium text-slate-900">DiraSchool Platform Subscription</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {fmtCycle(payment.billingCycle)} · {payment.studentCount ?? '—'} enrolled students
                </p>
              </td>
              <td className="py-3 text-right font-mono text-slate-900">{fmt(exVat)}</td>
            </tr>
            {addOnsEnabled.map((addon) => (
              <tr key={addon}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{addon}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Add-on module</p>
                </td>
                <td className="py-3 text-right font-mono text-slate-500">Included</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td className="pt-3 pr-4 text-slate-500 text-sm">Subtotal (ex-VAT)</td>
              <td className="pt-3 text-right font-mono text-slate-600">{fmt(exVat)}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-slate-500 text-sm">VAT (16%)</td>
              <td className="py-1 text-right font-mono text-slate-600">{fmt(vat)}</td>
            </tr>
            <tr className="border-t-2 border-slate-900">
              <td className="pt-3 pr-4 font-bold text-slate-900">Total paid</td>
              <td className="pt-3 text-right font-bold font-mono text-slate-900 text-base">{fmt(payment.amount)} {payment.currency ?? 'KES'}</td>
            </tr>
          </tfoot>
        </table>

        {/* Payment details */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm">
          <p className="font-semibold text-slate-700 mb-2">Payment details</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
            <span className="text-slate-400">Status</span>
            <span className="font-medium capitalize text-emerald-600">{payment.status}</span>
            <span className="text-slate-400">Provider</span>
            <span className="font-medium">Card / Mobile Money</span>
            <span className="text-slate-400">Reference</span>
            <span className="font-mono break-all">{payment.merchantReference}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">
            Thank you for using DiraSchool. This invoice is your official payment confirmation.
            If you are VAT-registered with KRA, you may reclaim the 16% VAT shown above.
          </p>
        </div>
      </div>
    </div>
  );
}
