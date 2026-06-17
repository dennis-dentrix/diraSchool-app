'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, UserPlus, Trash2, Printer, TrendingUp, MoveRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { studentsApi, feesApi, attendanceApi, classesApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { useAuthStore, isAdmin } from '@/store/auth.store';
import { formatDate, formatCurrency, getStatusColor, capitalize } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PrivateImage } from '@/components/shared/private-image';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const editSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  gender: z.enum(['male', 'female']),
  dateOfBirth: z.string().optional(),
  admissionNumber: z.string().min(1, 'Required'),
  assessmentNumber: z.string().min(1, 'Required'),
  birthCertificateNumber: z.string().optional(),
  enrollmentDate: z.string().optional(),
});

const guardianSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  relationship: z.enum(['mother', 'father', 'guardian', 'other']),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  occupation: z.string().optional(),
});

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'other'];

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="font-medium text-sm text-right max-w-[60%]">{value ?? '—'}</span>
    </div>
  );
}

function StudentFeesTab({ studentId }) {
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['student-payments', studentId],
    queryFn: async () => {
      const res = await feesApi.listPayments({ studentId, limit: 200 });
      return res.data?.payments ?? res.data?.data ?? [];
    },
    enabled: !!studentId,
  });

  const payments = paymentsData ?? [];
  const completed = payments.filter((p) => p.status === 'completed');
  const totalPaid = completed.reduce((s, p) => s + (p.amount ?? 0), 0);
  const paymentCount = completed.length;

  // Group by term+year for the per-term summary
  const byTerm = completed.reduce((acc, p) => {
    const key = `${p.academicYear ?? '—'} ${p.term ?? '—'}`;
    acc[key] = (acc[key] ?? 0) + p.amount;
    return acc;
  }, {});

  if (paymentsLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" />
            Total Paid
          </p>
          <p className="font-mono text-lg sm:text-xl font-semibold tabular-nums text-ok">{formatCurrency(totalPaid)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">across all terms</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Transactions</p>
          <p className="font-mono text-lg sm:text-xl font-semibold tabular-nums text-foreground">{paymentCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">completed receipts</p>
        </div>
        {Object.keys(byTerm).length > 0 && (
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Terms Paid</p>
            <p className="font-mono text-lg sm:text-xl font-semibold tabular-nums text-foreground">{Object.keys(byTerm).length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">active billing periods</p>
          </div>
        )}
      </div>

      {/* Per-term breakdown */}
      {Object.keys(byTerm).length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fee Summary by Term</p>
          </div>
          <div className="divide-y divide-border">
            {Object.entries(byTerm)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([term, amount]) => (
                <div key={term} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-foreground">{term}</span>
                  <span className="font-mono text-sm tabular-nums font-medium text-ok">{formatCurrency(amount)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Full payment history */}
      <div className="rounded-lg border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Payment History</p>
        </div>
        {payments.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No payments recorded for this student.</div>
        ) : (
          <div className="divide-y divide-border">
            {[...payments]
              .sort((a, b) => new Date(b.paymentDate ?? b.createdAt) - new Date(a.paymentDate ?? a.createdAt))
              .map((p) => {
                const isCompleted = p.status === 'completed';
                const isReversed  = p.status === 'reversed';
                return (
                  <div key={p._id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{p.term} {p.academicYear}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {formatDate(p.paymentDate ?? p.createdAt)}
                        {p.method ? ` · ${capitalize(p.method)}` : ''}
                        {p.receiptNumber ? (
                          <span className="ml-1 font-mono text-[11px]">· {p.receiptNumber}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className={cn(
                          'font-mono text-sm tabular-nums font-semibold',
                          isCompleted ? 'text-ok' : isReversed ? 'text-bad line-through' : 'text-muted-foreground',
                        )}>
                          {formatCurrency(p.amount ?? 0)}
                        </p>
                        <p className="text-[10px] text-muted-foreground capitalize">{p.status}</p>
                      </div>
                      {isCompleted && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => window.open(`/fees/payments/${p._id}/print`, '_blank')}
                          title="Print receipt"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentAttendanceTab({ studentId, classId }) {
  const { data: registersData, isLoading } = useQuery({
    queryKey: ['student-attendance', studentId, classId],
    queryFn: async () => {
      const res = await attendanceApi.listRegisters({ classId, limit: 200 });
      return res.data?.data ?? res.data?.registers ?? [];
    },
    enabled: !!classId,
  });

  const registers = registersData ?? [];

  const { present, absent, late, excused, total } = registers.reduce(
    (acc, reg) => {
      const entry = (reg.entries ?? []).find((e) => {
        const sid = typeof e.studentId === 'object' ? e.studentId?._id : e.studentId;
        return String(sid) === String(studentId);
      });
      if (entry) {
        acc[entry.status] = (acc[entry.status] ?? 0) + 1;
        acc.total += 1;
      }
      return acc;
    },
    { present: 0, absent: 0, late: 0, excused: 0, total: 0 }
  );

  const rate = total > 0 ? Math.round((present / total) * 100) : null;

  if (isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;

  if (!classId) return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        <p className="text-sm">Student class information unavailable.</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Attendance Rate', value: rate !== null ? `${rate}%` : '—', color: rate !== null ? (rate >= 80 ? 'text-green-600' : rate >= 60 ? 'text-amber-600' : 'text-destructive') : '' },
          { label: 'Days Present', value: present, color: 'text-green-600' },
          { label: 'Days Absent', value: absent, color: 'text-destructive' },
          { label: 'Days Late', value: late, color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-sm">No attendance records found for this student.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Recent Attendance</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {[...registers]
                .filter((reg) => (reg.entries ?? []).some((e) => {
                  const sid = typeof e.studentId === 'object' ? e.studentId?._id : e.studentId;
                  return String(sid) === String(studentId);
                }))
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 20)
                .map((reg) => {
                  const entry = (reg.entries ?? []).find((e) => {
                    const sid = typeof e.studentId === 'object' ? e.studentId?._id : e.studentId;
                    return String(sid) === String(studentId);
                  });
                  const statusColors = { present: 'bg-green-100 text-green-700', absent: 'bg-red-100 text-red-700', late: 'bg-amber-100 text-amber-700', excused: 'bg-blue-100 text-blue-700' };
                  return (
                    <div key={reg._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5">
                      <p className="text-sm">{formatDate(reg.date)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[entry?.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {capitalize(entry?.status ?? 'unknown')}
                      </span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function StudentDetailPage() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const adminUser = isAdmin(user);
  const isTeacher = ['teacher', 'department_head'].includes(user?.role);

  const [editOpen, setEditOpen] = useState(false);
  const [guardianDialogOpen, setGuardianDialogOpen] = useState(false);
  const [editingGuardianIdx, setEditingGuardianIdx] = useState(null); // null = add new
  const [photoFile, setPhotoFile] = useState(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedNewClassId, setSelectedNewClassId] = useState(null);
  const [transferNote, setTransferNote] = useState('');

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(editSchema),
  });

  const guardianForm = useForm({
    resolver: zodResolver(guardianSchema),
    defaultValues: { relationship: 'guardian' },
  });

  const { data: classesData } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => {
      const res = await classesApi.list({});
      const d = res.data;
      return Array.isArray(d) ? d : (d?.classes ?? d?.data ?? []);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['student', id],
    queryFn: async () => {
      const res = await studentsApi.get(id);
      return res.data?.student ?? res.data?.data ?? res.data;
    },
    enabled: !!id,
  });

  const student = data?.student ?? data;
  const cls = student?.classId;
  const guardians = Array.isArray(student?.guardians) ? student.guardians : [];
  const linkedParents = Array.isArray(student?.parentIds) ? student.parentIds : [];

  const { mutate: updateStudent, isPending: saving } = useMutation({
    mutationFn: (body) => studentsApi.update(id, body),
    onSuccess: () => {
      toast.success('Student details updated');
      queryClient.invalidateQueries({ queryKey: ['student', id] });
      setEditOpen(false);
    },
    onError: (err) => showApiError(err),
  });
  const { mutate: uploadPhoto, isPending: uploadingPhoto } = useMutation({
    mutationFn: async () => {
      if (!photoFile) throw new Error('Select an image first.');
      const fd = new FormData();
      fd.append('photo', photoFile);
      return studentsApi.uploadPhoto(id, fd);
    },
    onSuccess: () => {
      toast.success('Student photo uploaded');
      setPhotoFile(null);
      queryClient.invalidateQueries({ queryKey: ['student', id] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => showApiError(err),
  });

  const { mutate: transferStudentToClass, isPending: transferring } = useMutation({
    mutationFn: (body) => studentsApi.transfer(id, body),
    onSuccess: () => {
      toast.success('Student transferred successfully');
      setTransferDialogOpen(false);
      setSelectedNewClassId(null);
      setTransferNote('');
      queryClient.invalidateQueries({ queryKey: ['student', id] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (err) => showApiError(err),
  });

  const openEdit = () => {
    if (!student) return;
    reset({
      firstName: student.firstName ?? '',
      lastName: student.lastName ?? '',
      gender: student.gender ?? 'male',
      dateOfBirth: student.dateOfBirth ? new Date(student.dateOfBirth).toISOString().slice(0, 10) : '',
      admissionNumber: student.admissionNumber ?? '',
      assessmentNumber: student.assessmentNumber ?? '',
      birthCertificateNumber: student.birthCertificateNumber ?? '',
      enrollmentDate: student.enrollmentDate ? new Date(student.enrollmentDate).toISOString().slice(0, 10) : '',
    });
    setEditOpen(true);
  };

  const openAddGuardian = () => {
    guardianForm.reset({ firstName: '', lastName: '', relationship: 'guardian', phone: '', email: '', occupation: '' });
    setEditingGuardianIdx(null);
    setGuardianDialogOpen(true);
  };

  const openEditGuardian = (idx) => {
    const g = guardians[idx];
    guardianForm.reset({
      firstName: g.firstName ?? '',
      lastName: g.lastName ?? '',
      relationship: g.relationship ?? 'guardian',
      phone: g.phone ?? '',
      email: g.email ?? '',
      occupation: g.occupation ?? '',
    });
    setEditingGuardianIdx(idx);
    setGuardianDialogOpen(true);
  };

  const submitGuardianForm = (formData) => {
    let updatedGuardians;
    if (editingGuardianIdx === null) {
      updatedGuardians = [...guardians, formData];
    } else {
      updatedGuardians = guardians.map((g, i) => (i === editingGuardianIdx ? { ...g, ...formData } : g));
    }
    updateStudent({ guardians: updatedGuardians });
    setGuardianDialogOpen(false);
  };

  const removeGuardian = (idx) => {
    const updatedGuardians = guardians.filter((_, i) => i !== idx);
    updateStudent({ guardians: updatedGuardians });
  };

  const openTransferDialog = () => {
    setSelectedNewClassId(null);
    setTransferNote('');
    setTransferDialogOpen(true);
  };

  const submitTransfer = () => {
    if (!selectedNewClassId) {
      toast.error('Please select a class');
      return;
    }
    transferStudentToClass({
      newClassId: selectedNewClassId,
      ...(transferNote && { note: transferNote }),
    });
  };

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="w-12 h-12 rounded-full overflow-hidden bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center shrink-0">
          {student?.photo ? (
            <PrivateImage src={student.photo} alt="Student" className="w-full h-full object-cover" />
          ) : (
            `${student?.firstName?.[0] ?? ''}${student?.lastName?.[0] ?? ''}`
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold">{student?.firstName} {student?.lastName}</h1>
          <p className="text-muted-foreground text-sm font-mono">{student?.admissionNumber}</p>
        </div>
        <span className={`text-sm px-3 py-1 rounded-full font-medium ${getStatusColor(student?.status)}`}>
          {capitalize(student?.status ?? '')}
        </span>
        {!isTeacher && (
          <div className="flex gap-2 flex-wrap sm:flex-nowrap">
            <Button size="sm" variant="outline" onClick={openEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
            <Button size="sm" variant="outline" onClick={openTransferDialog}>
              <MoveRight className="h-3.5 w-3.5 mr-1.5" /> Transfer to Class
            </Button>
          </div>
        )}
      </div>
      {!isTeacher && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Student Photo</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                type="file"
                accept="image/*"
                className="w-full sm:max-w-sm"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              />
              <Button size="sm" onClick={() => uploadPhoto()} disabled={!photoFile || uploadingPhoto}>
                {uploadingPhoto ? 'Uploading…' : 'Upload Photo'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          {!isTeacher && <TabsTrigger value="fees">Fees</TabsTrigger>}
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <InfoRow label="Full Name" value={`${student?.firstName} ${student?.lastName}`} />
                <InfoRow label="Gender" value={capitalize(student?.gender ?? '')} />
                <InfoRow label="Date of Birth" value={formatDate(student?.dateOfBirth)} />
                <InfoRow label="Birth Certificate" value={student?.birthCertificateNumber} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Academic Information</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <InfoRow label="Admission No." value={student?.admissionNumber} />
                {student?.assessmentNumber && <InfoRow label="Assessment No." value={student.assessmentNumber} />}
                <InfoRow label="Class" value={typeof cls === 'object' ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—'} />
                <InfoRow label="Level" value={typeof cls === 'object' ? cls.levelCategory : '—'} />
                <InfoRow label="Academic Year" value={typeof cls === 'object' ? cls.academicYear : '—'} />
                <InfoRow label="Enrolled" value={formatDate(student?.enrollmentDate ?? student?.createdAt)} />
              </CardContent>
            </Card>

            {/* ── Parent / Guardian ──────────────────────────────────────────── */}
            <Card className="sm:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Parent / Guardian Information</CardTitle>
                  {adminUser && (
                    <Button size="sm" variant="outline" onClick={openAddGuardian}>
                      <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add Guardian
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {guardians.length === 0 && linkedParents.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No parent or guardian information on record.</p>
                )}

                {guardians.length > 0 && (
                  <div className="space-y-2 mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Guardians</p>
                    {guardians.map((g, idx) => (
                      <div key={idx} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{g?.firstName} {g?.lastName}</p>
                            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground text-xs">
                              <span>Relationship: {capitalize(g?.relationship ?? '')}</span>
                              <span>Phone: {g?.phone ?? '—'}</span>
                              {g?.email && <span className="col-span-2">Email: {g.email}</span>}
                              {g?.occupation && <span>Occupation: {g.occupation}</span>}
                            </div>
                          </div>
                          {adminUser && (
                            <div className="flex gap-1 shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => openEditGuardian(idx)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => removeGuardian(idx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {linkedParents.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Linked Parent Accounts</p>
                    {linkedParents.map((p, idx) => (
                      <div key={p?._id ?? idx} className="rounded-lg border p-3 text-sm bg-muted/20">
                        <p className="font-medium">{p?.firstName} {p?.lastName}</p>
                        <div className="mt-1 text-muted-foreground text-xs space-y-0.5">
                          <p>Phone: {p?.phone ?? '—'}</p>
                          <p>Email: {p?.email ?? '—'}</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1.5 italic">Has parent portal access</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fees">
          <StudentFeesTab studentId={id} />
        </TabsContent>

        <TabsContent value="attendance">
          <StudentAttendanceTab studentId={id} classId={typeof cls === 'object' ? cls._id : cls} />
        </TabsContent>
      </Tabs>

      {/* ── Edit student dialog ──────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Student Details</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(updateStudent)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input {...register('firstName')} />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input {...register('lastName')} />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select defaultValue={student?.gender} onValueChange={(v) => setValue('gender', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input type="date" {...register('dateOfBirth')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Admission Number</Label>
                <Input {...register('admissionNumber')} />
                {errors.admissionNumber && <p className="text-xs text-destructive">{errors.admissionNumber.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Enrollment Date</Label>
                <Input type="date" {...register('enrollmentDate')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Assessment No. <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input {...register('assessmentNumber')} placeholder="e.g. 12345678" />
              </div>
              <div className="space-y-1.5">
                <Label>Birth Certificate No. <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input {...register('birthCertificateNumber')} placeholder="e.g. 12345678" />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit guardian dialog ─────────────────────────────────────────── */}
      <Dialog open={guardianDialogOpen} onOpenChange={setGuardianDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGuardianIdx === null ? 'Add Guardian' : 'Edit Guardian'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={guardianForm.handleSubmit(submitGuardianForm)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input {...guardianForm.register('firstName')} />
                {guardianForm.formState.errors.firstName && (
                  <p className="text-xs text-destructive">{guardianForm.formState.errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input {...guardianForm.register('lastName')} />
                {guardianForm.formState.errors.lastName && (
                  <p className="text-xs text-destructive">{guardianForm.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <Select
                  defaultValue={guardians[editingGuardianIdx ?? -1]?.relationship ?? 'guardian'}
                  onValueChange={(v) => guardianForm.setValue('relationship', v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map((r) => (
                      <SelectItem key={r} value={r}>{capitalize(r)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input {...guardianForm.register('phone')} placeholder="+254..." />
                {guardianForm.formState.errors.phone && (
                  <p className="text-xs text-destructive">{guardianForm.formState.errors.phone.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input type="email" {...guardianForm.register('email')} placeholder="guardian@email.com" />
              {guardianForm.formState.errors.email && (
                <p className="text-xs text-destructive">{guardianForm.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Occupation (optional)</Label>
              <Input {...guardianForm.register('occupation')} placeholder="e.g. Teacher" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGuardianDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {editingGuardianIdx === null ? 'Add Guardian' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Transfer to class dialog ────────────────────────────────────────── */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Student to Class</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Current Class</Label>
              <div className="flex items-center px-3 py-2 rounded-md border border-border bg-muted">
                <span className="text-sm text-foreground">
                  {typeof cls === 'object' ? `${cls.name}${cls.stream ? ` ${cls.stream}` : ''}` : '—'}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-class">Move to Class</Label>
              <Select value={selectedNewClassId || ''} onValueChange={setSelectedNewClassId}>
                <SelectTrigger id="new-class">
                  <SelectValue placeholder="Select a class..." />
                </SelectTrigger>
                <SelectContent>
                  {(classesData ?? [])
                    .filter((c) => !cls || c._id !== cls._id)
                    .map((c) => (
                      <SelectItem key={c._id} value={c._id}>
                        {c.name}{c.stream ? ` ${c.stream}` : ''} — {c.levelCategory} ({c.academicYear})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="transfer-note">Note (optional)</Label>
              <Input
                id="transfer-note"
                placeholder="e.g. Due to family relocation..."
                value={transferNote}
                onChange={(e) => setTransferNote(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTransferDialogOpen(false)}>Cancel</Button>
              <Button type="button" onClick={submitTransfer} disabled={transferring || !selectedNewClassId}>
                {transferring ? 'Transferring…' : 'Transfer Student'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
