import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO, isValid } from 'date-fns';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(date, fmt = 'dd MMM yyyy') {
  if (!date) return '—';
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return isValid(d) ? format(d, fmt) : '—';
  } catch {
    return '—';
  }
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function getInitials(firstName, lastName) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

export function getRoleBadgeColor(role) {
  const map = {
    superadmin: 'bg-purple-100 text-purple-800',
    school_admin: 'bg-blue-100 text-blue-800',
    director: 'bg-indigo-100 text-indigo-800',
    headteacher: 'bg-cyan-100 text-cyan-800',
    deputy_headteacher: 'bg-teal-100 text-teal-800',
    secretary: 'bg-green-100 text-green-800',
    accountant: 'bg-yellow-100 text-yellow-800',
    teacher: 'bg-orange-100 text-orange-800',
    department_head: 'bg-amber-100 text-amber-800',
    parent: 'bg-pink-100 text-pink-800',
  };
  return map[role] ?? 'bg-gray-100 text-gray-800';
}

export function getStatusColor(status) {
  const map = {
    active: 'bg-green-100 text-green-800',
    trial: 'bg-blue-100 text-blue-800',
    suspended: 'bg-red-100 text-red-800',
    expired: 'bg-gray-100 text-gray-800',
    completed: 'bg-green-100 text-green-800',
    reversed: 'bg-red-100 text-red-800',
    draft: 'bg-yellow-100 text-yellow-800',
    published: 'bg-green-100 text-green-800',
    submitted: 'bg-blue-100 text-blue-800',
    withdrawn: 'bg-red-100 text-red-800',
    transferred: 'bg-orange-100 text-orange-800',
    graduated: 'bg-purple-100 text-purple-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-800';
}

/** Design-token badge classes for student status — use with a bordered Badge variant. */
export const studentStatusStyle = {
  active:      'text-ok border-ok/30 bg-ok/8',
  withdrawn:   'text-muted-foreground border-border bg-muted/40',
  transferred: 'text-warn border-warn/30 bg-warn/8',
  graduated:   'text-primary border-primary/20 bg-primary/8',
};

/** Returns the bar/text color classes for a fee-collection percentage. */
export function feeColor(pct) {
  if (pct >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (pct >= 50) return { bar: 'bg-amber-400',   text: 'text-amber-700'   };
  return             { bar: 'bg-rose-500',    text: 'text-rose-700'    };
}

export function buildQueryString(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') {
      qs.set(k, String(v));
    }
  }
  const str = qs.toString();
  return str ? `?${str}` : '';
}
