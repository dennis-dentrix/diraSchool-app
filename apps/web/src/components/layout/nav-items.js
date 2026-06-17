import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardList,
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
  Landmark,
  Image,
  MessageSquare,
  UserCheck,
  Umbrella,
  Layers,
  Clock,
  Trash2,
  Megaphone,
  SlidersHorizontal,
  ClipboardCheck,
  TableProperties,
  Inbox,
} from 'lucide-react';

// Role groups
const ADMIN     = ['school_admin', 'director', 'headteacher', 'deputy_headteacher'];
const FINANCE   = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'accountant', 'secretary'];
const ACADEMIC  = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'teacher', 'department_head', 'secretary'];
const ALL_STAFF = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'teacher', 'department_head', 'secretary', 'accountant'];
const TRANSPORT_ACCESS = ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'secretary', 'accountant'];
const AUDIT_ACCESS = ['school_admin', 'director', 'headteacher'];

export const schoolNavGroups = [
  {
    group: 'Today',
    items: [
      { label: 'Dashboard',  href: '/dashboard', icon: LayoutDashboard, roles: ALL_STAFF },
      { label: 'Students',   href: '/students',  icon: GraduationCap,   roles: ALL_STAFF },
      { label: 'Attendance', href: '/attendance',icon: ClipboardList,   roles: ACADEMIC },
      {
        label: 'Fees',
        href: '/fees',
        icon: CreditCard,
        roles: FINANCE,
        children: [
          { label: 'Payments',       href: '/fees/payments'   },
          { label: 'Overview',       href: '/fees'            },
          { label: 'Fee Structures', href: '/fees/structures' },
        ],
      },
      {
        label: 'Staff',
        href: '/staff',
        icon: Users,
        roles: ADMIN,
        children: [
          { label: 'Directory',  href: '/staff'            },
          { label: 'Check-ins',  href: '/staff?tab=checkins' },
        ],
      },
      {
        label: 'Messaging',
        href: '/messaging',
        icon: MessageSquare,
        roles: ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'secretary', 'accountant'],
      },
    ],
  },
  {
    group: 'Academic',
    items: [
      { label: 'Timetable',    href: '/timetable',    icon: Calendar,  roles: ALL_STAFF },
      { label: 'Leave',        href: '/leave',        icon: Umbrella,  roles: FINANCE },
      { label: 'Classes',      href: '/classes',      icon: BookOpen,  roles: ADMIN },
      { label: 'Subjects',     href: '/subjects',     icon: BookOpen,  roles: ACADEMIC },
      { label: 'Results',       href: '/results',      icon: TableProperties, roles: ACADEMIC },
      { label: 'Lesson Plans', href: '/lesson-plans', icon: Image,     roles: ACADEMIC },
    ],
  },
  {
    group: 'Operations',
    items: [
      { label: 'Transport',   href: '/transport',   icon: Bus,       roles: TRANSPORT_ACCESS },
      { label: 'Visitors',    href: '/visitors',    icon: UserCheck, roles: ['school_admin', 'director', 'headteacher', 'deputy_headteacher', 'secretary'] },
      { label: 'Audit Logs',  href: '/audit-logs',  icon: ShieldAlert, roles: AUDIT_ACCESS },
      { label: 'Billing',     href: '/billing',     icon: Receipt,   roles: ['school_admin', 'director', 'headteacher'] },
      { label: 'Settings',    href: '/settings',    icon: Settings,  roles: ALL_STAFF },
    ],
  },
];

// Flat list — used by layout getPageTitle and any flat consumers
export const schoolNavItems = schoolNavGroups.flatMap((g) => g.items);

export const superadminNavItems = [
  { label: 'Overview',       href: '/superadmin',              icon: LayoutDashboard },
  { label: 'Inquiries',      href: '/superadmin/inquiries',     icon: Inbox },
  { label: 'Schools',        href: '/superadmin/schools',       icon: Building2 },
  { label: 'Trials',         href: '/superadmin/trials',        icon: Clock },
  { label: 'Billing Groups', href: '/superadmin/groups',        icon: Layers },
  { label: 'Finance',        href: '/superadmin/finance',       icon: Landmark },
  { label: 'Users',          href: '/superadmin/users',         icon: UserCog },
  { label: 'Platform Settings', href: '/superadmin/platform',    icon: SlidersHorizontal },
  { label: 'System Events',  href: '/superadmin/events',        icon: Megaphone },
  { label: 'Audit Logs',     href: '/superadmin/audit-logs',    icon: ShieldAlert },
  { label: 'Danger Zone',    href: '/superadmin/danger-zone',   icon: Trash2 },
];

export const parentNavItems = [
  { label: 'Home', href: '/portal', icon: Home },
];
