'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, MessageSquare, Send, ShieldOff, XCircle } from 'lucide-react';
import { adminApi, studentsApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

const planColors = {
  trial: 'bg-yellow-100 text-yellow-800',
  basic: 'bg-blue-100 text-blue-800',
  standard: 'bg-purple-100 text-purple-800',
  premium: 'bg-green-100 text-green-800',
};

const statusColors = {
  trial: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-800',
};

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b last:border-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value ?? '—'}</span>
    </div>
  );
}

const pricingToForm = (pricing = {}) => ({
  enabled: Boolean(pricing.enabled),
  baseFee: pricing.baseFee ?? 12000,
  perStudentRate: pricing.perStudentRate ?? 55,
  agreementReference: pricing.agreementReference ?? '',
  startsAt: pricing.startsAt ? new Date(pricing.startsAt).toISOString().slice(0, 10) : '',
  expiresAt: pricing.expiresAt ? new Date(pricing.expiresAt).toISOString().slice(0, 10) : '',
  notes: pricing.notes ?? '',
});

export default function SchoolDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [subForm, setSubForm] = useState(null);
  const [pricingForm, setPricingForm] = useState(pricingToForm());
  const [deactivationReviewNote, setDeactivationReviewNote] = useState('');

  // Use the admin endpoint — returns staff breakdown too
  const { data: school, isLoading } = useQuery({
    queryKey: ['sa-school', id],
    queryFn: async () => {
      const res = await adminApi.getSchool(id);
      const s = res.data?.school ?? res.data?.data ?? res.data;
      setSubForm({
        planTier: s?.planTier ?? 'standard',
        subscriptionStatus: s?.subscriptionStatus ?? 'active',
        trialExpiry: s?.trialExpiry ? new Date(s.trialExpiry).toISOString().slice(0, 10) : '',
      });
      setPricingForm(pricingToForm(s?.pricingAgreement));
      return s;
    },
    enabled: !!id,
  });

  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['sa-school-students', id],
    queryFn: async () => {
      const res = await studentsApi.list({ schoolId: id, limit: 10 });
      return res.data;
    },
    enabled: !!id,
  });

  const { mutate: updateSub, isPending } = useMutation({
    mutationFn: (data) => adminApi.updateSchoolStatus(id, data),
    onSuccess: () => {
      toast.success('Subscription updated');
      queryClient.invalidateQueries({ queryKey: ['sa-school', id] });
      queryClient.invalidateQueries({ queryKey: ['sa-schools-list'] });
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: updatePricing, isPending: pricingPending } = useMutation({
    mutationFn: (data) => adminApi.updateSchoolPricingAgreement(id, data),
    onSuccess: () => {
      toast.success('Pricing agreement updated');
      queryClient.invalidateQueries({ queryKey: ['sa-school', id] });
      queryClient.invalidateQueries({ queryKey: ['sa-schools-list'] });
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: reviewDeactivationRequest, isPending: reviewingDeactivation } = useMutation({
    mutationFn: (data) => adminApi.reviewDeactivationRequest(id, data),
    onSuccess: (res) => {
      toast.success(res.data?.message ?? 'Deactivation request reviewed');
      setDeactivationReviewNote('');
      queryClient.invalidateQueries({ queryKey: ['sa-school', id] });
      queryClient.invalidateQueries({ queryKey: ['sa-schools-list'] });
    },
    onError: (err) => showApiError(err),
  });

  const [summaryRangeMode, setSummaryRangeMode] = useState(false);
  const [summaryDate, setSummaryDate] = useState('');
  const [summaryStartDate, setSummaryStartDate] = useState('');
  const [summaryEndDate, setSummaryEndDate] = useState('');
  const { mutate: resendSummary, isPending: resendingSummary } = useMutation({
    mutationFn: (data) => adminApi.resendSchoolSummary(id, data),
    onSuccess: (res) => toast.success(res.data?.message ?? 'Summary queued for resend'),
    onError: (err) => showApiError(err),
  });

  const [senderIdForm, setSenderIdForm] = useState({ approvedId: '', rejectionReason: '' });
  const { mutate: reviewSenderId, isPending: reviewPending } = useMutation({
    mutationFn: (data) => adminApi.approveSenderId(id, data),
    onSuccess: (_, vars) => {
      toast.success(vars.action === 'approve' ? 'Sender ID approved' : 'Sender ID rejected');
      setSenderIdForm({ approvedId: '', rejectionReason: '' });
      queryClient.invalidateQueries({ queryKey: ['sa-school', id] });
    },
    onError: (err) => showApiError(err),
  });

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  const plan   = school?.planTier ?? 'standard';
  const status = school?.subscriptionStatus ?? 'active';
  const staff  = school?.staff;
  const deactivationRequest = school?.deactivationRequest;
  const deactivationPending = deactivationRequest?.status === 'pending';

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{school?.name}</h1>
          <p className="text-muted-foreground text-sm">{school?.email}</p>
        </div>
        <div className="flex gap-2">
          <Badge className={`capitalize ${planColors[plan]}`}>{plan}</Badge>
          <Badge className={`capitalize ${statusColors[status]}`}>{status}</Badge>
          {deactivationPending && <Badge className="bg-orange-100 text-orange-800">Deactivation requested</Badge>}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="account">
            <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
            Account
            {deactivationPending && (
              <span className="ml-1.5 h-2 w-2 rounded-full bg-orange-500 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="sms">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            SMS
            {school?.smsSettings?.senderIdStatus === 'pending' && (
              <span className="ml-1.5 h-2 w-2 rounded-full bg-amber-500 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">School Information</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <InfoRow label="Name" value={school?.name} />
                <InfoRow label="Email" value={school?.email} />
                <InfoRow label="Phone" value={school?.phone} />
                <InfoRow label="County" value={school?.county} />
                <InfoRow label="Address" value={school?.address} />
                <InfoRow label="Reg. Number" value={school?.registrationNumber} />
                <InfoRow label="Registered" value={formatDate(school?.createdAt)} />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Subscription</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  <InfoRow label="Plan" value={<Badge className={`capitalize ${planColors[plan]}`}>{plan}</Badge>} />
                  <InfoRow label="Status" value={<Badge className={`capitalize ${statusColors[status]}`}>{status}</Badge>} />
                  <InfoRow label="Trial Expiry" value={school?.trialExpiry ? formatDate(school.trialExpiry) : '—'} />
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="py-4 text-center">
                    <p className="text-3xl font-bold">{staff?.total ?? '—'}</p>
                    <p className="text-xs text-muted-foreground mt-1">Staff Members</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4 text-center">
                    <p className="text-3xl font-bold">{studentsData?.pagination?.total ?? '—'}</p>
                    <p className="text-xs text-muted-foreground mt-1">Students</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <Card className="mt-4 max-w-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" />
                Resend Summary
              </CardTitle>
              <CardDescription>
                Resend the attendance, staff check-in, and fees summary email to this school's admin for a past day or week.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex items-center gap-2">
                <Switch checked={summaryRangeMode} onCheckedChange={setSummaryRangeMode} id="summary-range-mode" />
                <Label htmlFor="summary-range-mode" className="cursor-pointer">
                  {summaryRangeMode ? 'Date range' : 'Single day'}
                </Label>
              </div>

              {summaryRangeMode ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start date</Label>
                    <Input type="date" value={summaryStartDate} onChange={(e) => setSummaryStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End date</Label>
                    <Input type="date" value={summaryEndDate} onChange={(e) => setSummaryEndDate(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={summaryDate} onChange={(e) => setSummaryDate(e.target.value)} />
                </div>
              )}

              <Button
                disabled={
                  resendingSummary ||
                  (summaryRangeMode ? !summaryStartDate || !summaryEndDate : !summaryDate)
                }
                onClick={() => resendSummary(
                  summaryRangeMode
                    ? { startDate: summaryStartDate, endDate: summaryEndDate }
                    : { date: summaryDate }
                )}
              >
                {resendingSummary ? 'Sending…' : 'Resend Summary'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Account Review ───────────────────────────────────────────────── */}
        <TabsContent value="account">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldOff className="h-4 w-4 text-destructive" />
                Account Deactivation
              </CardTitle>
              <CardDescription>
                Review requests submitted from the school's Settings danger zone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!deactivationRequest || deactivationRequest.status === 'none' ? (
                <p className="text-sm text-muted-foreground">No deactivation request has been submitted.</p>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className={
                      deactivationRequest.status === 'pending' ? 'bg-orange-100 text-orange-800' :
                      deactivationRequest.status === 'approved' ? 'bg-red-100 text-red-800' :
                      deactivationRequest.status === 'rejected' ? 'bg-slate-100 text-slate-800' :
                      'bg-muted text-muted-foreground'
                    }>
                      {deactivationRequest.status}
                    </Badge>
                  </div>
                  <InfoRow label="Requested" value={deactivationRequest.requestedAt ? formatDate(deactivationRequest.requestedAt) : '—'} />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Reason</p>
                    <p className="text-sm whitespace-pre-line">{deactivationRequest.reason ?? '—'}</p>
                  </div>
                  {deactivationRequest.reviewedAt && (
                    <InfoRow label="Reviewed" value={formatDate(deactivationRequest.reviewedAt)} />
                  )}
                  {deactivationRequest.reviewNote && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Review note</p>
                      <p className="text-sm whitespace-pre-line">{deactivationRequest.reviewNote}</p>
                    </div>
                  )}
                </div>
              )}

              {deactivationPending && (
                <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50/60 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-orange-700 mt-0.5 shrink-0" />
                    <p className="text-sm text-orange-900">
                      Approving disables the school account immediately and deactivates all non-superadmin users in that school.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Review note</Label>
                    <Textarea
                      rows={3}
                      value={deactivationReviewNote}
                      onChange={(e) => setDeactivationReviewNote(e.target.value)}
                      placeholder="Optional note sent to the school."
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="destructive"
                      disabled={reviewingDeactivation}
                      onClick={() => reviewDeactivationRequest({ action: 'approve', reviewNote: deactivationReviewNote || undefined })}
                    >
                      Approve and disable account
                    </Button>
                    <Button
                      variant="outline"
                      disabled={reviewingDeactivation}
                      onClick={() => reviewDeactivationRequest({ action: 'reject', reviewNote: deactivationReviewNote || undefined })}
                    >
                      Reject request
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Subscription ──────────────────────────────────────────────────── */}
        <TabsContent value="subscription">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Update Subscription</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {subForm && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Plan Tier</Label>
                      <Select value={subForm.planTier} onValueChange={(v) => setSubForm((p) => ({ ...p, planTier: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trial">Trial</SelectItem>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Subscription Status</Label>
                      <Select value={subForm.subscriptionStatus} onValueChange={(v) => setSubForm((p) => ({ ...p, subscriptionStatus: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="trial">Trial</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Trial Expiry Date</Label>
                      <input
                        type="date"
                        value={subForm.trialExpiry}
                        onChange={(e) => setSubForm((p) => ({ ...p, trialExpiry: e.target.value }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <Button
                      onClick={() => updateSub({ planTier: subForm.planTier, subscriptionStatus: subForm.subscriptionStatus, trialExpiry: subForm.trialExpiry || undefined })}
                      disabled={isPending}
                    >
                      Save Changes
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Custom Pricing Agreement</CardTitle>
                <CardDescription>School-specific pricing overrides group pricing and public pricing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Agreement active</p>
                    <p className="text-xs text-muted-foreground">Use negotiated terms for future invoices.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={pricingForm.enabled}
                    onChange={(e) => setPricingForm((p) => ({ ...p, enabled: e.target.checked }))}
                    className="h-4 w-4"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Base fee per term</Label>
                    <Input
                      type="number"
                      min="0"
                      value={pricingForm.baseFee}
                      onChange={(e) => setPricingForm((p) => ({ ...p, baseFee: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Per student per term</Label>
                    <Input
                      type="number"
                      min="0"
                      value={pricingForm.perStudentRate}
                      onChange={(e) => setPricingForm((p) => ({ ...p, perStudentRate: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Agreement reference</Label>
                  <Input
                    value={pricingForm.agreementReference}
                    onChange={(e) => setPricingForm((p) => ({ ...p, agreementReference: e.target.value }))}
                    placeholder="e.g. MOU-2026-001"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Starts</Label>
                    <Input
                      type="date"
                      value={pricingForm.startsAt}
                      onChange={(e) => setPricingForm((p) => ({ ...p, startsAt: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expires</Label>
                    <Input
                      type="date"
                      value={pricingForm.expiresAt}
                      onChange={(e) => setPricingForm((p) => ({ ...p, expiresAt: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Internal notes</Label>
                  <Textarea
                    rows={3}
                    value={pricingForm.notes}
                    onChange={(e) => setPricingForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Record the commercial terms or approval context."
                  />
                </div>
                <Button
                  onClick={() => updatePricing({
                    ...pricingForm,
                    baseFee: Number(pricingForm.baseFee),
                    perStudentRate: Number(pricingForm.perStudentRate),
                    startsAt: pricingForm.startsAt || undefined,
                    expiresAt: pricingForm.expiresAt || undefined,
                  })}
                  disabled={pricingPending}
                >
                  {pricingPending ? 'Saving…' : 'Save pricing agreement'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── SMS Sender ID ─────────────────────────────────────────────────── */}
        <TabsContent value="sms">
          <div className="max-w-md space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">SMS Sender ID</CardTitle>
                <CardDescription>
                  Custom sender IDs must be registered with our SMS provider. Review and approve or reject the school's request.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const s = school?.smsSettings ?? {};
                  const statusConfig = {
                    pending:  { label: 'Pending Review', color: 'bg-amber-100 text-amber-800', icon: Clock },
                    approved: { label: 'Approved',       color: 'bg-green-100 text-green-800',  icon: CheckCircle2 },
                    rejected: { label: 'Rejected',       color: 'bg-red-100 text-red-800',      icon: XCircle },
                  };
                  const cfg = statusConfig[s.senderIdStatus];
                  return (
                    <>
                      {/* Current state */}
                      <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status</span>
                          {cfg ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
                              <cfg.icon className="h-3 w-3" /> {cfg.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No request yet</span>
                          )}
                        </div>
                        {s.senderIdRequested && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Requested ID</span>
                            <span className="font-mono font-semibold">{s.senderIdRequested}</span>
                          </div>
                        )}
                        {s.senderIdApproved && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Approved ID</span>
                            <span className="font-mono font-semibold text-green-700">{s.senderIdApproved}</span>
                          </div>
                        )}
                        {s.requestedAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Requested</span>
                            <span>{formatDate(s.requestedAt)}</span>
                          </div>
                        )}
                        {s.approvedAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Approved</span>
                            <span>{formatDate(s.approvedAt)}</span>
                          </div>
                        )}
                        {s.rejectionReason && (
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground shrink-0">Rejection reason</span>
                            <span className="text-right text-red-600">{s.rejectionReason}</span>
                          </div>
                        )}
                      </div>

                      {/* Action form — only show when there's a pending request or to allow manual approval */}
                      <div className="space-y-3 pt-1">
                        <div className="space-y-1.5">
                          <Label>Sender ID to Approve</Label>
                          <Input
                            placeholder={s.senderIdRequested ?? 'e.g. NYERI_GIRLS'}
                            value={senderIdForm.approvedId}
                            onChange={(e) => setSenderIdForm((p) => ({
                              ...p,
                              approvedId: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 11),
                            }))}
                            className="font-mono"
                          />
                          <p className="text-xs text-muted-foreground">Max 11 characters, letters, numbers, underscores only.</p>
                        </div>
                        <Button
                          className="w-full bg-green-600 hover:bg-green-700 text-white"
                          disabled={!senderIdForm.approvedId || reviewPending}
                          onClick={() => reviewSenderId({ action: 'approve', senderIdApproved: senderIdForm.approvedId })}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          Approve Sender ID
                        </Button>

                        <div className="space-y-1.5 pt-1 border-t">
                          <Label>Rejection Reason (optional)</Label>
                          <Textarea
                            placeholder="e.g. Sender ID already taken — please choose another."
                            rows={2}
                            value={senderIdForm.rejectionReason}
                            onChange={(e) => setSenderIdForm((p) => ({ ...p, rejectionReason: e.target.value }))}
                          />
                        </div>
                        <Button
                          variant="destructive"
                          className="w-full"
                          disabled={reviewPending}
                          onClick={() => reviewSenderId({ action: 'reject', rejectionReason: senderIdForm.rejectionReason || undefined })}
                        >
                          <XCircle className="h-4 w-4 mr-1.5" />
                          Reject Request
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Staff ─────────────────────────────────────────────────────────── */}
        <TabsContent value="staff">
          <Card>
            <CardContent className="py-5">
              {staff ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-3 border-b">
                    <span className="text-sm font-semibold">Total Staff</span>
                    <span className="text-2xl font-bold">{staff.total}</span>
                  </div>
                  {Object.entries(staff.byRole ?? {}).map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between py-1">
                      <span className="text-sm capitalize text-muted-foreground">{role.replace(/_/g, ' ')}</span>
                      <span className="text-sm font-semibold tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No staff data available.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Students ──────────────────────────────────────────────────────── */}
        <TabsContent value="students">
          <Card>
            <CardContent className="py-5">
              <p className="text-sm text-muted-foreground mb-3">
                Total enrolled: <span className="font-semibold text-foreground">{studentsData?.pagination?.total ?? '—'}</span>
              </p>
              {studentsLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : (
                <div className="divide-y">
                  {(studentsData?.students ?? studentsData?.data ?? []).map((s) => (
                    <div key={s._id} className="flex justify-between py-2 text-sm">
                      <span className="font-medium">{s.firstName} {s.lastName}</span>
                      <span className="text-muted-foreground font-mono">{s.admissionNumber}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
