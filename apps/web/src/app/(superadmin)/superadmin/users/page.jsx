'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, UserCheck, UserX, MoreHorizontal } from 'lucide-react';
import { adminApi, getErrorMessage ,  showApiError } from '@/lib/api';
import { formatDate, getRoleBadgeColor } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { DataTable } from '@/components/shared/data-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDebounce } from '@/hooks/use-debounce';

const ROLE_OPTIONS = [
  { value: 'school_admin', label: 'School Admin' },
  { value: 'director', label: 'Director' },
  { value: 'headteacher', label: 'Head Teacher' },
  { value: 'deputy_headteacher', label: 'Deputy Head Teacher' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'department_head', label: 'Department Head' },
  { value: 'parent', label: 'Parent' },
];

export default function SuperadminUsersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['sa-users', page, debouncedSearch, roleFilter, activeFilter],
    queryFn: async () => {
      const res = await adminApi.listUsers({
        page, limit: 25,
        search: debouncedSearch || undefined,
        role: roleFilter || undefined,
        isActive: activeFilter || undefined,
      });
      return res.data;
    },
  });

  const { mutate: toggleUser, isPending: toggling } = useMutation({
    mutationFn: (id) => adminApi.toggleUser(id),
    onSuccess: (res, id) => {
      const isActive = res.data.data?.user?.isActive;
      toast.success(`User ${isActive ? 'activated' : 'deactivated'}`);
      queryClient.invalidateQueries({ queryKey: ['sa-users'] });
    },
    onError: (err) => showApiError(err),
  });

  const hasFilters = debouncedSearch || roleFilter || activeFilter;

  const columns = [
    {
      id: 'user',
      header: 'User',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-sm">{row.original.firstName} {row.original.lastName}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${getRoleBadgeColor(row.original.role)}`}>
          {row.original.role?.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      id: 'school',
      header: 'School',
      cell: ({ row }) => {
        const s = row.original.schoolId;
        if (!s) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div>
            <p className="text-sm font-medium">{typeof s === 'object' ? s.name : s}</p>
            {typeof s === 'object' && s.county && (
              <p className="text-xs text-muted-foreground capitalize">{s.county}</p>
            )}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const active = row.original.isActive !== false;
        const invitePending = row.original.invitePending;
        const label = invitePending ? 'invite pending' : active ? 'active' : 'inactive';
        const color = invitePending
          ? 'bg-yellow-100 text-yellow-800'
          : active
          ? 'bg-green-100 text-green-800'
          : 'bg-red-100 text-red-700';
        return (
          <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${color}`}>
            {label}
          </span>
        );
      },
    },
    {
      id: 'joined',
      header: 'Joined',
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const u = row.original;
        const isActive = u.isActive !== false;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={toggling}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isActive ? (
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={() => toggleUser(u._id)}
                >
                  <UserX className="h-4 w-4 mr-2" /> Deactivate user
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => toggleUser(u._id)}>
                  <UserCheck className="h-4 w-4 mr-2" /> Activate user
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="All Users"
        description={`${data?.meta?.total ?? '…'} users across the platform`}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8 h-9"
          />
        </div>

        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="All roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={(v) => { setActiveFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9"
            onClick={() => { setSearch(''); setRoleFilter(''); setActiveFilter(''); setPage(1); }}>
            Clear
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data?.users}
        loading={isLoading}
        pageCount={data?.meta?.totalPages}
        currentPage={page}
        onPageChange={setPage}
      />
    </div>
  );
}
