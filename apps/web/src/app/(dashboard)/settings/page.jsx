'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, Plus, Trash2, Pencil, X, CalendarDays, ImageIcon,
  Upload, MapPin, Building2, CreditCard, BookOpen, AlertTriangle, Info,
} from 'lucide-react';
import { useState } from 'react';
import { settingsApi, schoolsApi, smsApi, mpesaApi, getErrorMessage } from '@/lib/api';
import { GeofenceSettings } from '@/components/settings/GeofenceSettings';
import { useAuthStore } from '@/store/auth.store';
import { ACADEMIC_YEARS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { PrivateImage } from '@/components/shared/private-image';

const CONFIRM_INIT = { open: false, holidayId: null };

const EVENT_TYPE_LABELS = {
  holiday:          'Public Holiday',
  midterm_break:    'Midterm Break',
  sports_day:       'Sports Day',
  academic_clinic:  'Academic Clinic',
  parents_meeting:  'Parents Meeting',
  school_trip:      'School Trip',
  custom:           'Other',
};
const EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS);

function InfoRow({ label, value, action }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b last:border-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0 w-40">{label}</span>
      <span className="text-sm font-medium flex-1 text-right">
        {value ?? <span className="text-muted-foreground/50 italic text-xs">Not set</span>}
      </span>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function SectionHeader({ title, description, editing, canEdit, saving, onEdit, onCancel, onSave }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {canEdit && !editing && (
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onEdit}>
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      )}
      {editing && (
        <div className="flex gap-1.5 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}><X className="h-3 w-3" /></Button>
          <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={saving}><Save className="h-3 w-3" /> Save</Button>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const canEdit = ['school_admin', 'director', 'headteacher'].includes(user?.role);
  const canViewPaymentsSms = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'secretary', 'accountant'].includes(user?.role);
  const canManageDaraja = user?.role === 'school_admin';
  const canRequestDeactivation = user?.role === 'school_admin';
  const schoolId = typeof user?.schoolId === 'object' ? user.schoolId?._id : user?.schoolId;
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState('general');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState(null);
  const [editingTerms, setEditingTerms] = useState(false);
  const [termsForm, setTermsForm] = useState(null);
  const [editingDaraja, setEditingDaraja] = useState(false);
  const [darajaForm, setDarajaForm] = useState(null);
  const [editingMpesa, setEditingMpesa] = useState(false);
  const [mpesaForm, setMpesaForm] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [senderIdForm, setSenderIdForm] = useState('');
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '', description: '' });
  const [newCalEvent, setNewCalEvent] = useState({ name: '', eventType: 'custom', date: '', endDate: '', description: '' });
  const [showAddCalEvent, setShowAddCalEvent] = useState(false);
  const [confirmCalEvent, setConfirmCalEvent] = useState({ open: false, eventId: null });
  const [deactivationForm, setDeactivationForm] = useState({
    reason: '',
    confirmation: '',
    dataRetentionAcknowledged: false,
    billingAcknowledged: false,
  });
  const [confirmDialog, setConfirmDialog] = useState(CONFIRM_INIT);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => { const res = await settingsApi.get(); return res.data?.settings ?? res.data?.data ?? res.data; },
  });

  const { data: schoolData } = useQuery({
    queryKey: ['school-me'],
    queryFn: async () => { const res = await schoolsApi.me(); return res.data?.school ?? res.data; },
  });

  const { data: darajaSettings, isLoading: loadingDaraja } = useQuery({
    queryKey: ['mpesa-settings'],
    enabled: canViewPaymentsSms,
    queryFn: async () => { const res = await mpesaApi.settings(); return res.data?.settings ?? res.data?.data ?? res.data; },
  });

  // ── Mutations (unchanged) ──────────────────────────────────────────────────

  const { mutate: saveProfile, isPending: savingProfile } = useMutation({
    mutationFn: (d) => schoolsApi.updateMe(d),
    onSuccess: () => { toast.success('School profile saved'); queryClient.invalidateQueries({ queryKey: ['school-me'] }); setEditingProfile(false); setProfileForm(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: saveInfo, isPending: savingInfo } = useMutation({
    mutationFn: () => settingsApi.update({ principalName: infoForm.principalName, motto: infoForm.motto, physicalAddress: infoForm.physicalAddress, currentAcademicYear: infoForm.currentAcademicYear }),
    onSuccess: () => { toast.success('School information saved'); queryClient.invalidateQueries({ queryKey: ['settings'] }); setEditingInfo(false); setInfoForm(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: saveTerms, isPending: savingTerms } = useMutation({
    mutationFn: () => settingsApi.update({ terms: termsForm.filter((t) => t.startDate && t.endDate).map((t) => ({ name: t.name, startDate: t.startDate, endDate: t.endDate })) }),
    onSuccess: () => { toast.success('Term dates saved'); queryClient.invalidateQueries({ queryKey: ['settings'] }); setEditingTerms(false); setTermsForm(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: saveMpesa, isPending: savingMpesa } = useMutation({
    mutationFn: () => schoolsApi.updateMe({ mpesaTillNumber: mpesaForm.provider === 'mpesa' ? mpesaForm.phoneNumber : '', paymentSmsSettings: { enabled: !!mpesaForm.enabled, provider: mpesaForm.provider, phoneNumber: mpesaForm.phoneNumber, bankName: mpesaForm.provider === 'bank' ? mpesaForm.bankName : '' } }),
    onSuccess: () => { toast.success('Payment SMS configuration saved'); queryClient.invalidateQueries({ queryKey: ['school-me'] }); setEditingMpesa(false); setMpesaForm(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: saveDaraja, isPending: savingDaraja } = useMutation({
    mutationFn: () => mpesaApi.updateSettings({ paybill: darajaForm.paybill.trim() }),
    onSuccess: () => { toast.success('M-Pesa Paybill saved'); queryClient.invalidateQueries({ queryKey: ['mpesa-settings'] }); setEditingDaraja(false); setDarajaForm(null); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: connectDaraja, isPending: connectingDaraja } = useMutation({
    mutationFn: () => { if (!schoolId) throw new Error('School account is not loaded yet.'); return mpesaApi.registerC2B(schoolId); },
    onSuccess: (res) => { toast.success(res.data?.message ?? 'M-Pesa connected'); queryClient.invalidateQueries({ queryKey: ['mpesa-settings'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: uploadLogo, isPending: uploadingLogo } = useMutation({
    mutationFn: () => { if (!logoFile) throw new Error('Select a logo file first.'); const fd = new FormData(); fd.append('logo', logoFile); return settingsApi.uploadLogo(fd); },
    onSuccess: () => { toast.success('Logo uploaded'); setLogoFile(null); queryClient.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: requestSenderId, isPending: requestingSenderId } = useMutation({
    mutationFn: () => smsApi.requestSenderId(senderIdForm.trim().toUpperCase()),
    onSuccess: () => { toast.success('Sender ID request submitted — awaiting approval'); setSenderIdForm(''); queryClient.invalidateQueries({ queryKey: ['school-me'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: addHoliday, isPending: addingHoliday } = useMutation({
    mutationFn: () => settingsApi.addHoliday(newHoliday),
    onSuccess: () => { toast.success('Event added'); queryClient.invalidateQueries({ queryKey: ['settings'] }); setNewHoliday({ name: '', date: '', description: '' }); setShowAddEvent(false); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: deleteHoliday } = useMutation({
    mutationFn: (id) => settingsApi.deleteHoliday(id),
    onSuccess: () => { toast.success('Event removed'); queryClient.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: addCalendarEvent, isPending: addingCalEvent } = useMutation({
    mutationFn: () => settingsApi.addCalendarEvent(newCalEvent),
    onSuccess: () => {
      toast.success('Event added');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setNewCalEvent({ name: '', eventType: 'custom', date: '', endDate: '', description: '' });
      setShowAddCalEvent(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: deleteCalendarEvent } = useMutation({
    mutationFn: (id) => settingsApi.deleteCalendarEvent(id),
    onSuccess: () => { toast.success('Event removed'); queryClient.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: requestDeactivation, isPending: requestingDeactivation } = useMutation({
    mutationFn: () => schoolsApi.requestDeactivation(deactivationForm),
    onSuccess: (res) => {
      toast.success(res.data?.message ?? 'Deactivation request submitted');
      queryClient.invalidateQueries({ queryKey: ['school-me'] });
      setDeactivationForm({
        reason: '',
        confirmation: '',
        dataRetentionAcknowledged: false,
        billingAcknowledged: false,
      });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentTerm = (data?.terms ?? []).find((t) => { const s = String(t?.startDate ?? '').slice(0, 10); const e = String(t?.endDate ?? '').slice(0, 10); return s && e && todayIso >= s && todayIso <= e; });
  const nextTerm = [...(data?.terms ?? [])].filter((t) => String(t?.startDate ?? '').slice(0, 10) > todayIso).sort((a, b) => String(a?.startDate ?? '').localeCompare(String(b?.startDate ?? '')))[0];
  const todayHoliday = (data?.holidays ?? []).find((h) => String(h?.date ?? '').slice(0, 10) === todayIso);
  const schoolDayStatus = todayHoliday ? (/mid\s*term/i.test(`${todayHoliday?.name ?? ''} ${todayHoliday?.description ?? ''}`) ? `Midterm break – ${todayHoliday.name}` : `Event – ${todayHoliday.name}`) : currentTerm ? 'In session' : 'On break';

  const darajaConnected = !!darajaSettings?.active && !!darajaSettings?.c2bRegistered;
  const paymentSmsSettings = schoolData?.paymentSmsSettings ?? {};
  const paymentSmsProvider = paymentSmsSettings.provider ?? (schoolData?.mpesaTillNumber ? 'mpesa' : 'auto');
  const paymentSmsPhone = paymentSmsSettings.phoneNumber ?? schoolData?.mpesaTillNumber;
  const smsSettings = schoolData?.smsSettings ?? {};
  const currentSenderId = smsSettings.senderIdApproved;
  const senderIdStatus = smsSettings.senderIdStatus;
  const pendingDeactivation = schoolData?.deactivationRequest?.status === 'pending';

  const startEditingInfo = () => { setInfoForm({ principalName: data?.principalName ?? '', motto: data?.motto ?? '', physicalAddress: data?.physicalAddress ?? '', currentAcademicYear: data?.currentAcademicYear ?? String(new Date().getFullYear()) }); setEditingInfo(true); };
  const startEditingTerms = () => {
    const existing = Array.isArray(data?.terms) ? data.terms : [];
    const get = (name) => existing.find((t) => t.name === name);
    setTermsForm(['Term 1', 'Term 2', 'Term 3'].map((name) => ({ name, startDate: get(name)?.startDate ? String(get(name).startDate).slice(0, 10) : '', endDate: get(name)?.endDate ? String(get(name).endDate).slice(0, 10) : '' })));
    setEditingTerms(true);
  };

  // ── Nav sections ───────────────────────────────────────────────────────────

  const navItems = [
    { id: 'general', label: 'General', icon: Building2, visible: true },
    { id: 'academic', label: 'Academic', icon: BookOpen, visible: true },
    { id: 'events', label: 'Events', icon: CalendarDays, visible: true },
    { id: 'payments', label: 'Payments', icon: CreditCard, visible: canViewPaymentsSms },
    { id: 'location', label: 'Location', icon: MapPin, visible: canEdit },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <Skeleton className="h-10 w-48" />
        <div className="flex gap-0 rounded-lg border overflow-hidden h-[500px]">
          <div className="w-56 border-r p-3 space-y-1">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          <div className="flex-1 p-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        </div>
      </div>
    );
  }

  // ── Section content renderer ───────────────────────────────────────────────

  const renderSection = () => {
    // ── General ──────────────────────────────────────────────────────────────
    if (activeSection === 'general') return (
      <div className="space-y-8">

        {/* Branding preview */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Brand Preview</p>
          <div className="inline-flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            {data?.logo ? (
              <PrivateImage src={data.logo} alt="logo" className="h-5 w-5 rounded object-contain" />
            ) : (
              <div className="h-5 w-5 rounded bg-muted-foreground/20 flex items-center justify-center">
                <Building2 className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
            <span className="text-sm font-semibold">{schoolData?.name ?? 'School Name'}</span>
          </div>
        </div>

        {/* School Profile */}
        <div>
          <SectionHeader
            title="School Profile"
            description="Location, contact, and MOE registration."
            editing={editingProfile}
            canEdit={canEdit}
            saving={savingProfile}
            onEdit={() => { setProfileForm({ name: schoolData?.name ?? '', phone: schoolData?.phone ?? '', county: schoolData?.county ?? '', constituency: schoolData?.constituency ?? '', registrationNumber: schoolData?.registrationNumber ?? '', address: schoolData?.address ?? '' }); setEditingProfile(true); }}
            onCancel={() => { setEditingProfile(false); setProfileForm(null); }}
            onSave={() => saveProfile(Object.fromEntries(Object.entries(profileForm).filter(([, v]) => v !== '')))}
          />
          {editingProfile && profileForm ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {[
                { id: 'prof-name', label: 'School Name', key: 'name', placeholder: 'Green Hills Academy' },
                { id: 'prof-phone', label: 'Phone', key: 'phone', placeholder: '+254 700 000000' },
                { id: 'prof-county', label: 'County', key: 'county', placeholder: 'Nairobi' },
                { id: 'prof-const', label: 'Constituency', key: 'constituency', placeholder: 'Westlands' },
                { id: 'prof-regno', label: 'MOE Reg. No.', key: 'registrationNumber', placeholder: 'NRB/001/2024' },
                { id: 'prof-addr', label: 'Physical Address', key: 'address', placeholder: 'P.O Box 123, Nairobi' },
              ].map(({ id, label, key, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={id}>{label}</Label>
                  <Input id={id} value={profileForm[key]} onChange={(e) => setProfileForm((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card px-4">
              <InfoRow label="Name" value={schoolData?.name} />
              <InfoRow label="Phone" value={schoolData?.phone} />
              <InfoRow label="County" value={schoolData?.county} />
              <InfoRow label="Constituency" value={schoolData?.constituency} />
              <InfoRow label="Reg. Number" value={schoolData?.registrationNumber} />
              <InfoRow label="Address" value={schoolData?.address} />
            </div>
          )}
        </div>

        {/* School Information */}
        <div>
          <SectionHeader
            title="School Information"
            description="Appears on invoices, report cards, and the parent portal."
            editing={editingInfo}
            canEdit={canEdit}
            saving={savingInfo}
            onEdit={startEditingInfo}
            onCancel={() => { setEditingInfo(false); setInfoForm(null); }}
            onSave={() => saveInfo()}
          />
          {editingInfo && infoForm ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="info-principal">Principal Name</Label>
                <Input id="info-principal" value={infoForm.principalName} onChange={(e) => setInfoForm((p) => ({ ...p, principalName: e.target.value }))} placeholder="Mr. John Kamau" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="info-motto">School Motto</Label>
                <Input id="info-motto" value={infoForm.motto} onChange={(e) => setInfoForm((p) => ({ ...p, motto: e.target.value }))} placeholder="Faith and Diligence" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="info-address">P.O. Box / Address</Label>
                <Input id="info-address" value={infoForm.physicalAddress} onChange={(e) => setInfoForm((p) => ({ ...p, physicalAddress: e.target.value }))} placeholder="P.O. Box 4413-00100, Westlands, Nairobi" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="info-year">Academic Year</Label>
                <Select value={infoForm.currentAcademicYear} onValueChange={(v) => setInfoForm((p) => ({ ...p, currentAcademicYear: v }))}>
                  <SelectTrigger id="info-year"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACADEMIC_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card px-4">
              <InfoRow label="Principal" value={data?.principalName} />
              <InfoRow label="Motto" value={data?.motto} />
              <InfoRow label="Address" value={data?.physicalAddress} />
              <InfoRow label="Academic Year" value={data?.currentAcademicYear ? <Badge variant="secondary" className="font-mono">{data.currentAcademicYear}</Badge> : null} />
            </div>
          )}
        </div>

        {/* School Logo */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">School Logo</p>
          </div>
          <div className="space-y-3">
            {data?.logo ? (
              <div className="w-20 h-20 border rounded-lg flex items-center justify-center bg-white p-2 shadow-sm">
                <PrivateImage src={data.logo} alt="School logo" className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="w-20 h-20 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30">
                <ImageIcon className="h-7 w-7 text-muted-foreground/30" />
              </div>
            )}
            {canEdit && (
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="logo-upload">{data?.logo ? 'Replace Logo' : 'Upload Logo'}</Label>
                  <Input id="logo-upload" type="file" accept="image/*" className="max-w-xs" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
                </div>
                <Button variant="outline" onClick={() => uploadLogo()} disabled={!logoFile || uploadingLogo}>
                  <Upload className="h-4 w-4" /> {uploadingLogo ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );

    // ── Academic ─────────────────────────────────────────────────────────────
    if (activeSection === 'academic') return (
      <div className="space-y-8">

        {/* Calendar status */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Calendar Status</p>
          <div className="divide-y rounded-lg border bg-card px-4">
            <InfoRow label="Academic Year" value={data?.currentAcademicYear ? <Badge variant="secondary" className="font-mono">{data.currentAcademicYear}</Badge> : null} />
            <InfoRow label="Current Term" value={currentTerm?.name ? <Badge variant="secondary">{currentTerm.name}</Badge> : <span className="text-muted-foreground/50 text-xs">No active term</span>} />
            <InfoRow label="Next Term" value={nextTerm?.startDate ? formatDate(nextTerm.startDate) : <span className="text-muted-foreground/50 text-xs">Not set</span>} />
            <InfoRow label="Today" value={<Badge variant={todayHoliday ? 'destructive' : 'secondary'}>{schoolDayStatus}</Badge>} />
          </div>
        </div>

        {/* Term track */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Term Calendar</p>
          <div className="flex rounded-lg border overflow-hidden divide-x">
            {['Term 1', 'Term 2', 'Term 3'].map((name) => {
              const term = (data?.terms ?? []).find((t) => t.name === name);
              const s = term?.startDate ? String(term.startDate).slice(0, 10) : null;
              const e = term?.endDate ? String(term.endDate).slice(0, 10) : null;
              const active = s && e && todayIso >= s && todayIso <= e;
              return (
                <div key={name} className={cn('flex-1 px-3 py-2.5', active && 'bg-ok/5')}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{name}</p>
                  {s && e ? (
                    <>
                      <p className="font-mono text-xs tabular-nums mt-0.5">{s.slice(5)} → {e.slice(5)}</p>
                      {active && <p className="text-[10px] text-ok mt-0.5">● In session</p>}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 mt-0.5">Not set</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Edit term dates */}
        <div>
          <SectionHeader
            title="Term Dates"
            description="Current term is derived automatically from these date windows."
            editing={editingTerms}
            canEdit={canEdit}
            saving={savingTerms}
            onEdit={startEditingTerms}
            onCancel={() => { setEditingTerms(false); setTermsForm(null); }}
            onSave={() => saveTerms()}
          />
          {!data?.terms?.length && !editingTerms && (
            <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-800 mb-3">
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span>Using platform defaults set by your system administrator. Configure dates below to override.</span>
            </div>
          )}
          {editingTerms && termsForm ? (
            <div className="space-y-3 mt-2">
              {termsForm.map((t, i) => (
                <div key={t.name} className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md border p-3 bg-muted/20">
                  <div className="space-y-1.5">
                    <Label>Term</Label>
                    <Input value={t.name} disabled className="bg-muted/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input type="date" value={t.startDate} onChange={(e) => setTermsForm((p) => { const n = [...p]; n[i] = { ...n[i], startDate: e.target.value }; return n; })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input type="date" value={t.endDate} onChange={(e) => setTermsForm((p) => { const n = [...p]; n[i] = { ...n[i], endDate: e.target.value }; return n; })} />
                  </div>
                </div>
              ))}
            </div>
          ) : data?.terms?.length > 0 ? (
            <div className="divide-y rounded-lg border bg-card px-4">
              {data.terms.map((t, i) => (
                <InfoRow key={i} label={t.name} value={<span className="font-mono text-xs tabular-nums">{formatDate(t.startDate)} → {formatDate(t.endDate)}</span>} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );

    // ── Events ───────────────────────────────────────────────────────────────
    if (activeSection === 'events') return (
      <div className="space-y-8">

        {/* Calendar Events (typed) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Calendar Events</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sports days, midterm breaks, parent meetings, trips and more.</p>
            </div>
            {canEdit && !showAddCalEvent && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddCalEvent(true)}>
                <Plus className="h-3 w-3" /> Add Event
              </Button>
            )}
          </div>

          {showAddCalEvent && canEdit && (
            <div className="rounded-md border p-4 bg-muted/20 space-y-3">
              <p className="text-xs font-semibold">New Calendar Event</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Event Type</Label>
                  <Select value={newCalEvent.eventType} onValueChange={(v) => setNewCalEvent((p) => ({ ...p, eventType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{EVENT_TYPE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={newCalEvent.name} onChange={(e) => setNewCalEvent((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Inter-house Sports" />
                </div>
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" value={newCalEvent.date} onChange={(e) => setNewCalEvent((p) => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input type="date" value={newCalEvent.endDate} onChange={(e) => setNewCalEvent((p) => ({ ...p, endDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={newCalEvent.description} onChange={(e) => setNewCalEvent((p) => ({ ...p, description: e.target.value }))} placeholder="Additional notes" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => { setShowAddCalEvent(false); setNewCalEvent({ name: '', eventType: 'custom', date: '', endDate: '', description: '' }); }}>
                  <X className="h-3 w-3" /> Cancel
                </Button>
                <Button size="sm" onClick={() => addCalendarEvent()} disabled={!newCalEvent.name || !newCalEvent.date || addingCalEvent}>
                  <Plus className="h-3 w-3" /> {addingCalEvent ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </div>
          )}

          {data?.calendarEvents?.length ? (
            <div className="divide-y rounded-lg border bg-card px-4">
              {[...data.calendarEvents].sort((a, b) => a.date > b.date ? 1 : -1).map((ev) => (
                <div key={ev._id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <Badge variant="secondary" className="text-[10px] shrink-0 mt-0.5">{EVENT_TYPE_LABELS[ev.eventType] ?? ev.eventType}</Badge>
                    <div>
                      <p className="text-sm font-medium truncate">{ev.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(ev.date)}{ev.endDate ? ` → ${formatDate(ev.endDate)}` : ''}{ev.description ? ` · ${ev.description}` : ''}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-bad hover:text-bad hover:bg-bad/10 shrink-0" onClick={() => setConfirmCalEvent({ open: true, eventId: ev._id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">No calendar events added yet.</p>
          )}
        </div>

        {/* Public Holidays (legacy) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Public Holidays</p>
            {canEdit && !showAddEvent && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddEvent(true)}>
                <Plus className="h-3 w-3" /> Add Holiday
              </Button>
            )}
          </div>

          {showAddEvent && canEdit && (
            <div className="rounded-md border p-4 bg-muted/20 space-y-3">
              <p className="text-xs font-semibold">New Holiday</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Name</Label><Input value={newHoliday.name} onChange={(e) => setNewHoliday((p) => ({ ...p, name: e.target.value }))} placeholder="Madaraka Day" /></div>
                <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={newHoliday.date} onChange={(e) => setNewHoliday((p) => ({ ...p, date: e.target.value }))} /></div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input value={newHoliday.description} onChange={(e) => setNewHoliday((p) => ({ ...p, description: e.target.value }))} placeholder="Public holiday" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => { setShowAddEvent(false); setNewHoliday({ name: '', date: '', description: '' }); }}>
                  <X className="h-3 w-3" /> Cancel
                </Button>
                <Button size="sm" onClick={() => addHoliday()} disabled={!newHoliday.name || !newHoliday.date || addingHoliday}>
                  <Plus className="h-3 w-3" /> {addingHoliday ? 'Adding…' : 'Add'}
                </Button>
              </div>
            </div>
          )}

          {data?.holidays?.length ? (
            <div className="divide-y rounded-lg border bg-card px-4">
              {data.holidays.map((h) => (
                <div key={h._id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(h.date)}{h.description ? ` · ${h.description}` : ''}</p>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-bad hover:text-bad hover:bg-bad/10 shrink-0" onClick={() => setConfirmDialog({ open: true, holidayId: h._id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">No holidays added yet.</p>
          )}
        </div>

        {/* Confirm delete calendar event */}
        <AlertDialog open={confirmCalEvent.open} onOpenChange={(o) => !o && setConfirmCalEvent({ open: false, eventId: null })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove event?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently delete this calendar event.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => { deleteCalendarEvent(confirmCalEvent.eventId); setConfirmCalEvent({ open: false, eventId: null }); }}>
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );

    // ── Payments ─────────────────────────────────────────────────────────────
    if (activeSection === 'payments' && canViewPaymentsSms) return (
      <div className="space-y-8">

        {/* M-Pesa Daraja */}
        <div>
          <SectionHeader
            title="M-Pesa Daraja C2B"
            description="Automatic Paybill reconciliation using the school's own M-Pesa account."
            editing={editingDaraja}
            canEdit={canManageDaraja}
            saving={savingDaraja}
            onEdit={() => { setDarajaForm({ paybill: darajaSettings?.paybill ?? '' }); setEditingDaraja(true); }}
            onCancel={() => { setEditingDaraja(false); setDarajaForm(null); }}
            onSave={() => saveDaraja()}
          />
          {loadingDaraja ? (
            <div className="space-y-2 mt-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : editingDaraja && darajaForm ? (
            <div className="space-y-1.5 mt-2">
              <Label>School Paybill</Label>
              <Input inputMode="numeric" pattern="[0-9]*" value={darajaForm.paybill} onChange={(e) => setDarajaForm((p) => ({ ...p, paybill: e.target.value.replace(/\D/g, '') }))} placeholder="123456" />
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card px-4">
              <InfoRow label="Paybill" value={darajaSettings?.paybill} />
              <InfoRow label="Connection" value={<Badge variant={darajaConnected ? 'secondary' : 'outline'}>{darajaConnected ? 'Connected' : 'Not connected'}</Badge>} />
              <InfoRow label="Authorization" value={<Badge variant={darajaSettings?.authorized ? 'secondary' : 'outline'}>{darajaSettings?.authorized ? 'Confirmed' : 'Pending'}</Badge>} />
              {darajaSettings?.c2bRegisteredAt && <InfoRow label="Registered" value={formatDate(darajaSettings.c2bRegisteredAt)} />}
            </div>
          )}

          {!editingDaraja && canManageDaraja && (
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between rounded-md border bg-muted/20 p-3 mt-3">
              <p className="text-sm text-muted-foreground">
                {darajaConnected ? `Make a KES 1 test payment to Paybill ${darajaSettings?.paybill}.` : 'Save the school Paybill, then connect M-Pesa to register callback URLs.'}
              </p>
              <Button type="button" onClick={() => connectDaraja()} disabled={!darajaSettings?.paybill || connectingDaraja} className="shrink-0">
                <CreditCard className="h-4 w-4" /> {connectingDaraja ? 'Connecting…' : darajaConnected ? 'Reconnect' : 'Connect M-Pesa'}
              </Button>
            </div>
          )}
        </div>

        {/* Payment SMS Automation */}
        <div>
          <SectionHeader
            title="Payment SMS Automation"
            description="Fallback auto-recording from forwarded M-Pesa or bank SMS notifications."
            editing={editingMpesa}
            canEdit={canEdit}
            saving={savingMpesa}
            onEdit={() => {
              setMpesaForm({ enabled: !!paymentSmsSettings.enabled || !!schoolData?.mpesaTillNumber, provider: paymentSmsProvider, phoneNumber: paymentSmsPhone ?? '', bankName: paymentSmsSettings.bankName ?? '' });
              setEditingMpesa(true);
            }}
            onCancel={() => { setEditingMpesa(false); setMpesaForm(null); }}
            onSave={() => saveMpesa()}
          />
          {editingMpesa && mpesaForm ? (
            <div className="space-y-4 mt-2">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={!!mpesaForm.enabled} onChange={(e) => setMpesaForm((p) => ({ ...p, enabled: e.target.checked }))} className="mt-1" />
                <span>Enable auto-recording from payment SMS<span className="block text-xs text-muted-foreground">Messages are only posted when the system can match exactly one active student.</span></span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Notification Source</Label>
                  <Select value={mpesaForm.provider} onValueChange={(v) => setMpesaForm((p) => ({ ...p, provider: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mpesa">M-Pesa SMS</SelectItem>
                      <SelectItem value="bank">Bank SMS</SelectItem>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Receiving Phone / Till</Label>
                  <Input value={mpesaForm.phoneNumber} onChange={(e) => setMpesaForm((p) => ({ ...p, phoneNumber: e.target.value }))} placeholder="+254700000000 or till/paybill" />
                </div>
                {mpesaForm.provider === 'bank' && (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Bank Name</Label>
                    <Input value={mpesaForm.bankName} onChange={(e) => setMpesaForm((p) => ({ ...p, bankName: e.target.value }))} placeholder="e.g. KCB, Equity, Co-op" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="divide-y rounded-lg border bg-card px-4">
              <InfoRow label="Auto-recording" value={<Badge variant={paymentSmsSettings.enabled || schoolData?.mpesaTillNumber ? 'secondary' : 'outline'}>{paymentSmsSettings.enabled || schoolData?.mpesaTillNumber ? 'Enabled' : 'Disabled'}</Badge>} />
              <InfoRow label="Source" value={paymentSmsProvider === 'auto' ? 'Auto-detect' : paymentSmsProvider === 'bank' ? 'Bank SMS' : 'M-Pesa SMS'} />
              <InfoRow label="Receiving Number" value={paymentSmsPhone} />
              {paymentSmsProvider === 'bank' && <InfoRow label="Bank" value={paymentSmsSettings.bankName} />}
            </div>
          )}
        </div>

        {/* SMS Sender ID */}
        {canEdit && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">SMS Sender ID</p>
            <div className="divide-y rounded-lg border bg-card px-4 mb-3">
              <InfoRow
                label="Current Sender ID"
                value={currentSenderId ?? <span className="text-muted-foreground/50 text-xs">DiraSchool / provider default</span>}
              />
              <InfoRow
                label="Status"
                value={
                  <Badge variant={senderIdStatus === 'approved' ? 'secondary' : 'outline'}>
                    {senderIdStatus ?? 'Optional'}
                  </Badge>
                }
              />
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              SMS can be sent before a custom Sender ID is approved. Until then, messages use the DiraSchool platform sender and automatically include your school name in the message body.
            </p>
            <div className="flex gap-2 items-end">
              <div className="space-y-1.5 flex-1">
                <Label>Request Custom Sender ID</Label>
                <Input value={senderIdForm} onChange={(e) => setSenderIdForm(e.target.value.toUpperCase())} placeholder="SCHOOLNAME" maxLength={11} className="uppercase" />
              </div>
              <Button variant="outline" onClick={() => requestSenderId()} disabled={!senderIdForm.trim() || requestingSenderId}>
                {requestingSenderId ? 'Submitting…' : 'Request'}
              </Button>
            </div>
          </div>
        )}
      </div>
    );

    // ── Location ─────────────────────────────────────────────────────────────
    if (activeSection === 'location' && canEdit) return (
      <div data-tour="geofence-settings">
        <GeofenceSettings settings={data} canEdit={canEdit} />
      </div>
    );

    // ── Danger Zone ───────────────────────────────────────────────────────────
    if (activeSection === 'danger') return (
      <div className="space-y-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-bad">Danger Zone</p>
        <p className="text-sm text-muted-foreground">
          Account deactivation requires a reviewed request. A superadmin must approve it before access is disabled.
        </p>
        <div className="rounded-lg border border-bad/20 bg-card p-4 space-y-4">
          <div>
            <p className="text-sm font-medium">Request school account deactivation</p>
            <p className="text-xs text-muted-foreground mt-1">
              This does not delete school data. If approved, staff login access is disabled and your records remain preserved.
            </p>
          </div>

          {pendingDeactivation ? (
            <div className="rounded-md border border-warn/30 bg-warn/5 px-3 py-2.5">
              <p className="text-sm font-medium text-warn">Request pending review</p>
              <p className="text-xs text-muted-foreground mt-1">
                Submitted {schoolData?.deactivationRequest?.requestedAt ? formatDate(schoolData.deactivationRequest.requestedAt) : 'recently'}.
                A Diraschool superadmin will approve or reject it.
              </p>
            </div>
          ) : canRequestDeactivation ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Reason for deactivation</Label>
                <textarea
                  value={deactivationForm.reason}
                  onChange={(e) => setDeactivationForm((p) => ({ ...p, reason: e.target.value }))}
                  rows={4}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Explain why the school wants to deactivate the account, and whether you need data export or billing follow-up."
                />
              </div>

              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={deactivationForm.dataRetentionAcknowledged}
                    onChange={(e) => setDeactivationForm((p) => ({ ...p, dataRetentionAcknowledged: e.target.checked }))}
                    className="mt-1"
                  />
                  <span>Staff will lose access only after a superadmin approves the request.</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={deactivationForm.billingAcknowledged}
                    onChange={(e) => setDeactivationForm((p) => ({ ...p, billingAcknowledged: e.target.checked }))}
                    className="mt-1"
                  />
                  <span>Any billing, data export, or handover issues have been reviewed before requesting deactivation.</span>
                </label>
              </div>

              <div className="space-y-1.5">
                <Label>Type DEACTIVATE to confirm</Label>
                <Input
                  value={deactivationForm.confirmation}
                  onChange={(e) => setDeactivationForm((p) => ({ ...p, confirmation: e.target.value.toUpperCase() }))}
                  placeholder="DEACTIVATE"
                />
              </div>

              <Button
                variant="destructive"
                disabled={
                  requestingDeactivation ||
                  deactivationForm.reason.trim().length < 30 ||
                  deactivationForm.confirmation !== 'DEACTIVATE' ||
                  !deactivationForm.dataRetentionAcknowledged ||
                  !deactivationForm.billingAcknowledged
                }
                onClick={() => requestDeactivation()}
              >
                {requestingDeactivation ? 'Submitting…' : 'Submit deactivation request'}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Only the school admin can submit this request.</p>
          )}
        </div>
        <div className="flex items-start gap-2 rounded-md border px-3 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 text-warn mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Diraschool does not allow instant self-service deletion from this screen. Diraschool admin review prevents accidental lockouts and gives both sides time to resolve billing or data-export needs.
          </p>
        </div>
      </div>
    );

    return null;
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Settings" description="Manage your school's information, academic calendar, and integrations." />

      <div className="flex gap-0 rounded-lg border overflow-hidden min-h-[520px]">
        {/* Left nav */}
        <nav className="w-56 shrink-0 border-r flex flex-col bg-muted/10">
          {navItems.filter((n) => n.visible).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={cn(
                'flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors',
                activeSection === item.id
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </button>
          ))}
          <div className="mt-auto border-t p-3">
            <button
              onClick={() => setActiveSection('danger')}
              className={cn(
                'flex items-center gap-2 px-1 py-1.5 text-xs w-full transition-colors rounded',
                activeSection === 'danger' ? 'text-bad font-medium' : 'text-muted-foreground hover:text-bad',
              )}
            >
              <Trash2 className="h-3 w-3 shrink-0" /> Danger Zone
            </button>
          </div>
        </nav>

        {/* Right content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {renderSection()}
        </div>
      </div>

      {/* Delete event dialog */}
      <AlertDialog open={confirmDialog.open && canEdit} onOpenChange={(open) => !open && setConfirmDialog(CONFIRM_INIT)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove event?</AlertDialogTitle>
            <AlertDialogDescription>This event will be permanently removed from the school calendar.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDialog.holidayId) deleteHoliday(confirmDialog.holidayId); setConfirmDialog(CONFIRM_INIT); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
