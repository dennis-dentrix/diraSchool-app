import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
  BarChart2,
  FileText,
  CreditCard,
  Calendar,
  Bus,
  Settings,
  ShieldAlert,
  Building2,
  UserCog,
  Home,
  Receipt,
  Image,
  MessageSquare,
  UserCheck,
  Umbrella,
} from 'lucide-react';

// Role groups
const ADMIN     = ['school_admin', 'director', 'headteacher', 'deputy_headteacher'];
const FINANCE   = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'accountant', 'secretary'];
const ACADEMIC  = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'teacher', 'department_head', 'secretary'];
const ALL_STAFF = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'teacher', 'department_head', 'secretary', 'accountant'];
// Transport: operational staff who manage student pickups
const TRANSPORT_ACCESS = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'secretary', 'accountant'];
// Audit logs: senior leadership only (no deputy)
const AUDIT_ACCESS = ['school_admin', 'director', 'headteacher'];

export const schoolNavItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ALL_STAFF,
  },
  {
    label: 'Students',
    href: '/students',
    icon: GraduationCap,
    roles: ALL_STAFF,
  },
  {
    label: 'Classes',
    href: '/classes',
    icon: BookOpen,
    roles: ALL_STAFF,
  },
  {
    label: 'Attendance',
    href: '/attendance',
    icon: ClipboardList,
    roles: ACADEMIC,
  },
  {
    label: 'Subjects',
    href: '/subjects',
    icon: BookOpen,
    roles: ACADEMIC,
  },
  {
    label: 'Exams',
    href: '/exams',
    icon: FileText,
    roles: ACADEMIC,
  },
  {
    label: 'Results',
    href: '/results',
    icon: BarChart2,
    roles: ACADEMIC,
  },
  {
    label: 'Lesson Plans',
    href: '/lesson-plans',
    icon: Image,
    roles: ACADEMIC,
  },
  {
    label: 'Fees',
    href: '/fees',
    icon: CreditCard,
    roles: FINANCE,
    children: [
      { label: 'Overview', href: '/fees' },
      { label: 'Fee Structures', href: '/fees/structures' },
      { label: 'Payments', href: '/fees/payments' },
    ],
  },
  {
    label: 'Staff',
    href: '/staff',
    icon: Users,
    roles: ADMIN,
  },
  {
    label: 'Leave',
    href: '/leave',
    icon: Umbrella,
    roles: ALL_STAFF,
  },
  {
    label: 'Timetable',
    href: '/timetable',
    icon: Calendar,
    roles: ALL_STAFF,
  },
  {
    label: 'Transport',
    href: '/transport',
    icon: Bus,
    roles: TRANSPORT_ACCESS,
  },
  {
    label: 'Messaging',
    href: '/messaging',
    icon: MessageSquare,
    roles: ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'secretary', 'accountant'],
  },
  {
    label: 'Visitors',
    href: '/visitors',
    icon: UserCheck,
    roles: ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'secretary'],
  },
  {
    label: 'Audit Logs',
    href: '/audit-logs',
    icon: ShieldAlert,
    roles: AUDIT_ACCESS,
  },
  {
    label: 'Billing',
    href: '/billing',
    icon: Receipt,
    roles: ['school_admin', 'director', 'headteacher'],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: ALL_STAFF,
  },
];

export const superadminNavItems = [
  { label: 'Overview',   href: '/superadmin',            icon: LayoutDashboard },
  { label: 'Schools',    href: '/superadmin/schools',     icon: Building2 },
  { label: 'Users',      href: '/superadmin/users',       icon: UserCog },
  { label: 'Audit Logs', href: '/superadmin/audit-logs',  icon: ShieldAlert },
];

export const parentNavItems = [
  { label: 'Home', href: '/portal', icon: Home },
];
