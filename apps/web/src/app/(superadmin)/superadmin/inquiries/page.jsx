'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Phone, Mail, Building2, Clock, MessageSquare,
  CheckCircle2, ChevronDown, ChevronUp, Search,
} from 'lucide-react';
import { adminApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   cls: 'bg-yellow-100 text-yellow-800' },
  contacted: { label: 'Contacted', cls: 'bg-blue-100 text-blue-800' },
  closed:    { label: 'Closed',    cls: 'bg-green-100 text-green-800' },
};

function InquiryRow({ inquiry }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes]       = useState(inquiry.notes ?? '');
  const [status, setStatus]     = useState(inquiry.status);
  const queryClient             = useQueryClient();

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => adminApi.updateInquiry(inquiry._id, { status, notes }),
    onSuccess: () => {
      toast.success('Inquiry updated');
      queryClient.invalidateQueries({ queryKey: ['inquiries'] });
      queryClient.invalidateQueries({ queryKey: ['inquiry-stats'] });
    },
    onError: (err) => showApiError(err),
  });

  const cfg = STATUS_CONFIG[inquiry.status];
  const fmtRelative = (date) => {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const mins  = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days  = Math.floor(diff / 86_400_000);
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7)  return `${days}d ago`;
    return formatDate(date);
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Summary row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-foreground">
              {inquiry.firstName} {inquiry.lastName}
            </span>
            <Badge className={cn('text-[11px] px-2 py-0 rounded-full border-0', cfg.cls)}>
              {cfg.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            {inquiry.schoolName}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
          <span>{fmtRelative(inquiry.createdAt)}</span>
          {expanded
            ? <ChevronUp className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 px-5 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <a href={`mailto:${inquiry.email}`} className="flex items-center gap-2 text-foreground hover:underline">
              <Mail className="h-4 w-4 text-muted-foreground" />
              {inquiry.email}
            </a>
            <a href={`tel:${inquiry.phone}`} className="flex items-center gap-2 text-foreground hover:underline">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {inquiry.phone}
            </a>
            <span className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              Received {formatDate(inquiry.createdAt)}
            </span>
            {inquiry.reviewedBy && (
              <span className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                Last updated by {inquiry.reviewedBy.firstName} {inquiry.reviewedBy.lastName}
              </span>
            )}
          </div>

          {inquiry.message && (
            <div className="rounded-lg bg-background border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Their message
              </p>
              <p className="text-sm text-foreground leading-relaxed">{inquiry.message}</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Internal notes</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this inquiry — call outcomes, follow-up actions, etc."
              className="min-h-[80px] resize-none text-sm"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => save()} disabled={isPending}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InquiriesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]             = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['inquiries', statusFilter],
    queryFn: () => adminApi.listInquiries(statusFilter ? { status: statusFilter } : {}).then((r) => r.data.data),
  });

  const inquiries    = data?.inquiries ?? [];
  const pendingCount = data?.pendingCount ?? 0;

  const filtered = inquiries.filter((i) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      i.schoolName.toLowerCase().includes(q) ||
      `${i.firstName} ${i.lastName}`.toLowerCase().includes(q) ||
      i.email.toLowerCase().includes(q) ||
      i.phone.includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Inquiries"
        description={
          pendingCount > 0
            ? `${pendingCount} pending ${pendingCount === 1 ? 'inquiry' : 'inquiries'} awaiting follow-up`
            : 'All inquiries are up to date'
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9"
            placeholder="Search by school, name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">
            {search || statusFilter ? 'No inquiries match your filters.' : 'No inquiries yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((inquiry) => (
            <InquiryRow key={inquiry._id} inquiry={inquiry} />
          ))}
        </div>
      )}
    </div>
  );
}
