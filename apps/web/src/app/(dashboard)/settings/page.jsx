'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Save, Plus, Trash2, Pencil, X, CalendarDays, ImageIcon,
  Upload, MessageSquare, MapPin, Building2, CreditCard, BookOpen,
} from 'lucide-react';
import { useState } from 'react';
import { settingsApi, schoolsApi, smsApi, getErrorMessage } from '@/lib/api';
import { GeofenceSettings } from '@/components/settings/GeofenceSettings';
import { useAuthStore } from '@/store/auth.store';
import { ACADEMIC_YEARS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

const CONFIRM_INIT = { open: false, holidayId: null };

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b last:border-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">
        {value ?? <span className="text-muted-foreground/60 italic">Not set</span>}
      </span>
    </div>
  );
}

function CardEditHeader({ title, description, editing, onEdit, onCancel, onSave, saving, canEdit }) {
  return (
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        {canEdit && !editing && (
          <Button size="sm" variant="outline" onClick={onEdit} className="shrink-0">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
        {editing && (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={onCancel}><X className="h-4 w-4" /> Cancel</Button>
            <Button size="sm" onClick={onSave} disabled={saving}><Save className="h-4 w-4" /> Save</Button>
          </div>
        )}
      </div>
    </CardHeader>
  );
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const canEdit = ['school_admin', 'director', 'headteacher'].includes(user?.role);
  const canViewPaymentsSms = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'secretary', 'accountant'].includes(user?.role);
  const queryClient = useQueryClient();

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm]       = useState(null);
  const [editingInfo, setEditingInfo]       = useState(false);
  const [infoForm, setInfoForm]             = useState(null);
  const [editingTerms, setEditingTerms]     = useState(false);
  const [termsForm, setTermsForm]           = useState(null);
  const [editingMpesa, setEditingMpesa]     = useState(false);
  const [mpesaForm, setMpesaForm]           = useState(null);
  const [logoFile, setLogoFile]             = useState(null);
  const [senderIdForm, setSenderIdForm]     = useState('');
  const [showAddEvent, setShowAddEvent]     = useState(false);
  const [newHoliday, setNewHoliday]         = useState({ name: '', date: '', description: '' });
  const [confirmDialog, setConfirmDialog]   = useState(CONFIRM_INIT);

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data?.settings ?? res.data?.data ?? res.data;
    },
  });

  const { data: schoolData } = useQuery({
    queryKey: ['school-me'],
    queryFn: async () => {
      const res = await schoolsApi.me();
      return res.data?.school ?? res.data;
    },
  });

  const { mutate: saveProfile, isPending: savingProfile } = useMutation({
    mutationFn: (d) => schoolsApi.updateMe(d),
    onSuccess: () => {
      toast.success('School profile saved');
      queryClient.invalidateQueries({ queryKey: ['school-me'] });
      setEditingProfile(false); setProfileForm(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: saveInfo, isPending: savingInfo } = useMutation({
    mutationFn: () => settingsApi.update({
      principalName:       infoForm.principalName,
      motto:               infoForm.motto,
      physicalAddress:     infoForm.physicalAddress,
      currentAcademicYear: infoForm.currentAcademicYear,
    }),
    onSuccess: () => {
      toast.success('School information saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setEditingInfo(false); setInfoForm(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: saveTerms, isPending: savingTerms } = useMutation({
    mutationFn: () => settingsApi.update({
      terms: termsForm
        .filter((t) => t.startDate && t.endDate)
        .map((t) => ({ name: t.name, startDate: t.startDate, endDate: t.endDate })),
    }),
    onSuccess: () => {
      toast.success('Term dates saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setEditingTerms(false); setTermsForm(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: saveMpesa, isPending: savingMpesa } = useMutation({
    mutationFn: () => schoolsApi.updateMe({ mpesaTillNumber: mpesaForm.mpesaTillNumber }),
    onSuccess: () => {
      toast.success('M-Pesa configuration saved');
      queryClient.invalidateQueries({ queryKey: ['school-me'] });
      setEditingMpesa(false); setMpesaForm(null);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: uploadLogo, isPending: uploadingLogo } = useMutation({
    mutationFn: () => {
      if (!logoFile) throw new Error('Select a logo file first.');
      const fd = new FormData();
      fd.append('logo', logoFile);
      return settingsApi.uploadLogo(fd);
    },
    onSuccess: () => {
      toast.success('Logo uploaded');
      setLogoFile(null);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: requestSenderId, isPending: requestingSenderId } = useMutation({
    mutationFn: () => smsApi.requestSenderId(senderIdForm.trim().toUpperCase()),
    onSuccess: () => {
      toast.success('Sender ID request submitted — awaiting approval');
      setSenderIdForm('');
      queryClient.invalidateQueries({ queryKey: ['school-me'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: addHoliday, isPending: addingHoliday } = useMutation({
    mutationFn: () => settingsApi.addHoliday(newHoliday),
    onSuccess: () => {
      toast.success('Event added');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setNewHoliday({ name: '', date: '', description: '' });
      setShowAddEvent(false);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const { mutate: deleteHoliday } = useMutation({
    mutationFn: (id) => settingsApi.deleteHoliday(id),
    onSuccess: () => { toast.success('Event removed'); queryClient.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentTerm = (data?.terms ?? []).find((t) => {
    const s = String(t?.startDate ?? '').slice(0, 10);
    const e = String(t?.endDate ?? '').slice(0, 10);
    return s && e && todayIso >= s && todayIso <= e;
  });
  const nextTerm = [...(data?.terms ?? [])]
    .filter((t) => String(t?.startDate ?? '').slice(0, 10) > todayIso)
    .sort((a, b) => String(a?.startDate ?? '').localeCompare(String(b?.startDate ?? '')))[0];
  const todayHoliday = (data?.holidays ?? []).find((h) => String(h?.date ?? '').slice(0, 10) === todayIso);
  const schoolDayStatus = todayHoliday
    ? (/mid\s*term/i.test(`${todayHoliday?.name ?? ''} ${todayHoliday?.description ?? ''}`)
        ? `Midterm break – ${todayHoliday.name}`
        : `Event – ${todayHoliday.name}`)
    : currentTerm ? 'In session' : 'On break';

  const startEditingInfo = () => {
    setInfoForm({
      principalName:       data?.principalName ?? '',
      motto:               data?.motto ?? '',
      physicalAddress:     data?.physicalAddress ?? '',
      currentAcademicYear: data?.currentAcademicYear ?? String(new Date().getFullYear()),
    });
    setEditingInfo(true);
  };

  const startEditingTerms = () => {
    const existing = Array.isArray(data?.terms) ? data.terms : [];
    const get = (name) => existing.find((t) => t.name === name);
    setTermsForm(['Term 1', 'Term 2', 'Term 3'].map((name) => ({
      name,
      startDate: get(name)?.startDate ? String(get(name).startDate).slice(0, 10) : '',
      endDate:   get(name)?.endDate   ? String(get(name).endDate).slice(0, 10) : '',
    })));
    setEditingTerms(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full sm:w-96" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }

  const smsSettings = schoolData?.smsSettings;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title="Settings" description="Manage your school's information, academic calendar, and integrations." />

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="flex w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="general" className="gap-1.5" title="School name, contact, and logo">
            <Building2 className="h-3.5 w-3.5" aria-hidden />General
          </TabsTrigger>
          <TabsTrigger value="academic" className="gap-1.5" title="Term dates and academic year">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />Academic
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5" title="Holidays, closures, and events">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />Events
          </TabsTrigger>
          {canViewPaymentsSms && (
            <TabsTrigger value="payments" className="gap-1.5" title="M-Pesa till or paybill number">
              <CreditCard className="h-3.5 w-3.5" aria-hidden />Payments
            </TabsTrigger>
          )}
          {canViewPaymentsSms && (
            <TabsTrigger value="comms" className="gap-1.5" title="SMS sender ID and messaging settings">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />Communications
            </TabsTrigger>
          )}
          {canEdit && (
            <TabsTrigger value="attendance" className="gap-1.5" title="School location and check-in radius">
              <MapPin className="h-3.5 w-3.5" aria-hidden />Check-in
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── General ─────────────────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-4 mt-4">

          {/* School Profile */}
          <Card>
            <CardEditHeader
              title="School Profile"
              description="Location, contact, and MOE registration details."
              editing={editingProfile}
              canEdit={canEdit}
              saving={savingProfile}
              onEdit={() => {
                setProfileForm({
                  name: schoolData?.name ?? '', phone: schoolData?.phone ?? '',
                  county: schoolData?.county ?? '', constituency: schoolData?.constituency ?? '',
                  registrationNumber: schoolData?.registrationNumber ?? '', address: schoolData?.address ?? '',
                });
                setEditingProfile(true);
              }}
              onCancel={() => { setEditingProfile(false); setProfileForm(null); }}
              onSave={() => saveProfile(Object.fromEntries(Object.entries(profileForm).filter(([, v]) => v !== '')))}
            />
            <CardContent>
              {editingProfile && profileForm ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { id: 'prof-name',  label: 'School Name',      key: 'name',               placeholder: 'Green Hills Academy' },
                    { id: 'prof-phone', label: 'Phone',            key: 'phone',              placeholder: '+254 700 000000' },
                    { id: 'prof-county',label: 'County',           key: 'county',             placeholder: 'Nairobi' },
                    { id: 'prof-const', label: 'Constituency',     key: 'constituency',       placeholder: 'Westlands' },
                    { id: 'prof-regno', label: 'MOE Reg. No.',     key: 'registrationNumber', placeholder: 'NRB/001/2024' },
                    { id: 'prof-addr',  label: 'Physical Address', key: 'address',            placeholder: 'P.O Box 123, Nairobi' },
                  ].map(({ id, label, key, placeholder }) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={id}>{label}</Label>
                      <Input id={id} value={profileForm[key]} onChange={(e) => setProfileForm((p) => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <InfoRow label="Name"         value={schoolData?.name} />
                  <InfoRow label="Phone"        value={schoolData?.phone} />
                  <InfoRow label="County"       value={schoolData?.county} />
                  <InfoRow label="Constituency" value={schoolData?.constituency} />
                  <InfoRow label="Reg. Number"  value={schoolData?.registrationNumber} />
                  <InfoRow label="Address"      value={schoolData?.address} />
                </>
              )}
            </CardContent>
          </Card>

          {/* School Information */}
          <Card>
            <CardEditHeader
              title="School Information"
              description="Appears on invoices, report cards, and the parent portal."
              editing={editingInfo}
              canEdit={canEdit}
              saving={savingInfo}
              onEdit={startEditingInfo}
              onCancel={() => { setEditingInfo(false); setInfoForm(null); }}
              onSave={() => saveInfo()}
            />
            <CardContent>
              {editingInfo && infoForm ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <>
                  <InfoRow label="Principal"    value={data?.principalName} />
                  <InfoRow label="Motto"         value={data?.motto} />
                  <InfoRow label="Address"       value={data?.physicalAddress} />
                  <InfoRow label="Academic Year" value={data?.currentAcademicYear
                    ? <Badge variant="secondary" className="font-mono">{data.currentAcademicYear}</Badge>
                    : null}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* School Logo */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">School Logo</CardTitle>
                  <CardDescription className="mt-0.5">Used on printed documents and generated PDFs.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {data?.logo ? (
                <div className="w-24 h-24 border rounded-lg flex items-center justify-center bg-white p-2 shadow-sm">
                  <img src={data.logo} alt="School logo" className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/30">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/30" aria-hidden />
                </div>
              )}
              {canEdit && (
                <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor="logo-upload">{data?.logo ? 'Replace Logo' : 'Upload Logo'}</Label>
                    <Input id="logo-upload" type="file" accept="image/*" className="max-w-xs" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
                  </div>
                  <Button variant="outline" onClick={() => uploadLogo()} disabled={!logoFile || uploadingLogo}>
                    <Upload className="h-4 w-4" />
                    {uploadingLogo ? 'Uploading…' : 'Upload'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Academic ─────────────────────────────────────────────────────── */}
        <TabsContent value="academic" className="space-y-4 mt-4">

          {/* Calendar Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Calendar Status</CardTitle>
              <CardDescription>Live term and school-day status based on configured term dates.</CardDescription>
            </CardHeader>
            <CardContent>
              <InfoRow label="Academic Year" value={data?.currentAcademicYear
                ? <Badge variant="secondary" className="font-mono">{data.currentAcademicYear}</Badge>
                : null}
              />
              <InfoRow label="Current Term" value={currentTerm?.name
                ? <Badge variant="secondary">{currentTerm.name}</Badge>
                : <span className="text-muted-foreground/70 text-xs">No active term</span>}
              />
              <InfoRow label="Next Term Starts" value={nextTerm?.startDate
                ? formatDate(nextTerm.startDate)
                : <span className="text-muted-foreground/70 text-xs">Not set</span>}
              />
              <InfoRow label="Today" value={
                <Badge variant={todayHoliday ? 'destructive' : 'secondary'}>{schoolDayStatus}</Badge>}
              />
            </CardContent>
          </Card>

          {/* Term Dates */}
          <Card>
            <CardEditHeader
              title="Term Dates"
              description="Current term is derived automatically from these date windows."
              editing={editingTerms}
              canEdit={canEdit}
              saving={savingTerms}
              onEdit={startEditingTerms}
              onCancel={() => { setEditingTerms(false); setTermsForm(null); }}
              onSave={() => saveTerms()}
            />
            <CardContent>
              {editingTerms && termsForm ? (
                <div className="space-y-3">
                  {termsForm.map((t, i) => (
                    <div key={t.name} className="grid grid-cols-1 sm:grid-cols-3 gap-3 border rounded-md p-3 bg-muted/20">
                      <div className="space-y-1.5">
                        <Label>Term</Label>
                        <Input value={t.name} disabled className="bg-muted/50" />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`term-${i}-start`}>Start Date</Label>
                        <Input
                          id={`term-${i}-start`}
                          type="date"
                          value={t.startDate}
                          onChange={(e) => setTermsForm((p) => { const n = [...p]; n[i] = { ...n[i], startDate: e.target.value }; return n; })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`term-${i}-end`}>End Date</Label>
                        <Input
                          id={`term-${i}-end`}
                          type="date"
                          value={t.endDate}
                          onChange={(e) => setTermsForm((p) => { const n = [...p]; n[i] = { ...n[i], endDate: e.target.value }; return n; })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : data?.terms?.length > 0 ? (
                <div>
                  {data.terms.map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5 border-b last:border-0">
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="text-sm text-muted-foreground">{formatDate(t.startDate)} → {formatDate(t.endDate)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No term dates configured yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Events ───────────────────────────────────────────────────────── */}
        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">School Events</CardTitle>
                  <CardDescription className="mt-0.5">Holidays, events, and closures on the school calendar.</CardDescription>
                </div>
                {canEdit && !showAddEvent && (
                  <Button size="sm" variant="outline" onClick={() => setShowAddEvent(true)} className="shrink-0">
                    <Plus className="h-4 w-4" /> Add Event
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showAddEvent && canEdit && (
                <div className="border rounded-md p-4 bg-muted/20 space-y-3">
                  <p className="text-sm font-semibold">New Event</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="event-name">Name</Label>
                      <Input id="event-name" value={newHoliday.name} onChange={(e) => setNewHoliday((p) => ({ ...p, name: e.target.value }))} placeholder="Madaraka Day" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="event-date">Date</Label>
                      <Input id="event-date" type="date" value={newHoliday.date} onChange={(e) => setNewHoliday((p) => ({ ...p, date: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="event-desc">
                        Description <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Input id="event-desc" value={newHoliday.description} onChange={(e) => setNewHoliday((p) => ({ ...p, description: e.target.value }))} placeholder="Public holiday" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end pt-1">
                    <Button size="sm" variant="outline" onClick={() => { setShowAddEvent(false); setNewHoliday({ name: '', date: '', description: '' }); }}>
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                    <Button size="sm" onClick={() => addHoliday()} disabled={!newHoliday.name || !newHoliday.date || addingHoliday}>
                      <Plus className="h-4 w-4" /> {addingHoliday ? 'Adding…' : 'Add'}
                    </Button>
                  </div>
                </div>
              )}

              {data?.holidays?.length ? (
                <div>
                  {data.holidays.map((h) => (
                    <div key={h._id} className="flex items-center justify-between py-2.5 border-b last:border-0 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{h.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(h.date)}{h.description ? ` · ${h.description}` : ''}
                        </p>
                      </div>
                      {canEdit && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                          aria-label={`Remove ${h.name}`}
                          onClick={() => setConfirmDialog({ open: true, holidayId: h._id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No events added yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Payments ─────────────────────────────────────────────────────── */}
        {canViewPaymentsSms && <TabsContent value="payments" className="mt-4">
          <Card>
            <CardEditHeader
              title="M-Pesa Payment Capture"
              description="Register your till or paybill number to receive payment SMS notifications and auto-generate receipts."
              editing={editingMpesa}
              canEdit={canEdit}
              saving={savingMpesa}
              onEdit={() => { setMpesaForm({ mpesaTillNumber: schoolData?.mpesaTillNumber ?? '' }); setEditingMpesa(true); }}
              onCancel={() => { setEditingMpesa(false); setMpesaForm(null); }}
              onSave={() => saveMpesa()}
            />
            <CardContent>
              {editingMpesa && mpesaForm ? (
                <div className="max-w-xs space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="mpesa-number">Till / Paybill Number</Label>
                    <Input
                      id="mpesa-number"
                      value={mpesaForm.mpesaTillNumber}
                      onChange={(e) => setMpesaForm((p) => ({ ...p, mpesaTillNumber: e.target.value }))}
                      placeholder="e.g. 0722123456 or 123456"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Enter the till or paybill number used to collect school fees.</p>
                </div>
              ) : (
                <InfoRow label="Till / Paybill Number" value={schoolData?.mpesaTillNumber} />
              )}
            </CardContent>
          </Card>
        </TabsContent>}

        {/* ── Communications ───────────────────────────────────────────────── */}
        {canViewPaymentsSms && <TabsContent value="comms" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">SMS Sender ID</CardTitle>
              <CardDescription>
                A custom sender ID (e.g. <span className="font-mono">GREENHILL</span>) replaces the generic number shown to
                recipients. Requests are reviewed by DiraSchool within 2–3 business days.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {smsSettings?.senderIdStatus ? (() => {
                const statusMap = {
                  pending:  { label: 'Pending review', variant: 'secondary' },
                  approved: { label: 'Approved',       variant: 'success' },
                  rejected: { label: 'Rejected',       variant: 'destructive' },
                };
                const { label, variant } = statusMap[smsSettings.senderIdStatus] ?? statusMap.pending;
                return (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant={variant}>{label}</Badge>
                      {smsSettings.senderIdApproved && (
                        <span className="text-sm font-mono font-semibold">{smsSettings.senderIdApproved}</span>
                      )}
                      {smsSettings.senderIdRequested && smsSettings.senderIdStatus === 'pending' && (
                        <span className="text-sm text-muted-foreground">
                          Requested: <span className="font-mono">{smsSettings.senderIdRequested}</span>
                        </span>
                      )}
                    </div>
                    {smsSettings.senderIdStatus === 'rejected' && smsSettings.rejectionReason && (
                      <p className="text-sm text-destructive">Reason: {smsSettings.rejectionReason}</p>
                    )}
                  </div>
                );
              })() : (
                <p className="text-sm text-muted-foreground">No sender ID requested yet.</p>
              )}

              {canEdit && smsSettings?.senderIdStatus !== 'pending' && (
                <div className="space-y-2 pt-2 border-t">
                  <Label htmlFor="sender-id-input">
                    {smsSettings?.senderIdStatus === 'approved' ? 'Request a Different Sender ID' : 'Request Sender ID'}
                  </Label>
                  <div className="flex gap-2 max-w-xs">
                    <Input
                      id="sender-id-input"
                      value={senderIdForm}
                      onChange={(e) => setSenderIdForm(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                      placeholder="e.g. GREENHILL"
                      maxLength={11}
                      className="font-mono uppercase"
                    />
                    <Button variant="outline" onClick={() => requestSenderId()} disabled={senderIdForm.trim().length < 1 || requestingSenderId}>
                      {requestingSenderId ? 'Submitting…' : 'Submit'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    1–11 alphanumeric characters. Avoid generic words like SCHOOL or SMS — operators reject these.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>}

        {/* ── Attendance (admin only) ───────────────────────────────────────── */}
        {canEdit && (
          <TabsContent value="attendance" className="mt-4">
            <GeofenceSettings settings={data} canEdit={canEdit} />
          </TabsContent>
        )}
      </Tabs>

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
