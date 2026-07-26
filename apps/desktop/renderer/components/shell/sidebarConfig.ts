import {
  LayoutDashboard, Map, School, CheckCircle, BookOpen, CalendarCheck, Users, CalendarRange,
  CalendarClock, Layers3, Building2, FileText, UserPlus, CreditCard, Bell, MessageCircle,
  Settings2Icon, MessageSquare, DollarSign, ClipboardCheck, ShieldCheck, Settings, UserCog,
  GraduationCap, ArrowRightLeft, UserCircle2, AlertTriangle, FileBarChart,
  type LucideIcon,
} from 'lucide-react';
import { DESKTOP_PORTALS, SystemRole, type DesktopPortalRole } from '@nemis-desktop/types';
import type { AvatarRole } from '@nemis-desktop/ui';

export type SidebarBadge = 'notifications';

export interface SidebarNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: SidebarBadge;
}

export interface SidebarNavGroup {
  label: string;
  items: readonly SidebarNavItem[];
}

export interface SidebarConfig {
  /** Static header title. When omitted, the caller-supplied institutionName is shown. */
  headerTitle?: string;
  headerSubtitle?: string;
  /** Optional ungrouped item rendered above the groups. */
  dashboardItem?: SidebarNavItem;
  navGroups: readonly SidebarNavGroup[];
}

export interface HeaderConfig {
  /** Base route for the role; breadcrumb segments are computed relative to it. */
  basePath: string;
  avatarRole: AvatarRole;
  /** Label used as the first breadcrumb segment (after "Home /"). */
  breadcrumbRoot: string;
  /** Explicit title overrides for nested pages that are not themselves sidebar items. */
  pageTitles?: Record<string, string>;
}

export const sidebarConfigs: Record<DesktopPortalRole, SidebarConfig> = {
  [SystemRole.INSTITUTION_ADMIN]: {
    dashboardItem: {
      name: 'Overview',
      href: '/government/school-admin',
      icon: LayoutDashboard,
    },
    navGroups: [
      {
        label: 'User Management',
        items: [
          { name: 'Students', href: '/government/school-admin/students', icon: Map },
          { name: 'Student Transfers', href: '/government/school-admin/students/inter-school-transfer', icon: Map },
          { name: 'Teachers & Staff', href: '/government/school-admin/teachers-staff', icon: School },
          { name: 'Parents & Guardians', href: '/government/school-admin/parents-guardians', icon: CheckCircle },
        ],
      },
      {
        label: 'ACADEMIC',
        items: [
          { name: 'Academic Years', href: '/government/school-admin/academic-years', icon: CalendarRange },
          { name: 'Terms', href: '/government/school-admin/terms', icon: CalendarClock },
          { name: 'Grade Levels', href: '/government/school-admin/grade-levels', icon: Layers3 },
          { name: 'Classes Management', href: '/government/school-admin/classes', icon: BookOpen },
          { name: 'Subjects Management', href: '/government/school-admin/subjects', icon: BookOpen },
          { name: 'Attendence Management', href: '/government/school-admin/attendance', icon: CalendarCheck },
          { name: 'Academic & Grading', href: '/government/school-admin/academic-grading', icon: Users },
          { name: 'General Schedule Management', href: '/government/school-admin/timetable', icon: BookOpen },
          { name: 'Grade Windows', href: '/government/school-admin/academic-grading/windows', icon: FileText },
          { name: 'Grading Periods', href: '/government/school-admin/academic-grading/periods', icon: CalendarRange },
          { name: 'Infrastructure', href: '/government/school-admin/infrastructure', icon: Building2 },
        ],
      },
      {
        label: 'FINANCIAL',
        items: [
          { name: 'Financial / Fees', href: '/government/school-admin/financial', icon: UserPlus },
          { name: 'Record Payment', href: '/government/school-admin/financial/record-payment', icon: CreditCard },
          { name: 'Fee Rules', href: '/government/school-admin/financial/fee-rules', icon: FileText },
        ],
      },
      {
        label: 'REPORTS',
        items: [{ name: 'Reports', href: '/government/school-admin/reports', icon: FileText }],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Notifications', href: '/government/school-admin/notifications', icon: Bell },
          { name: 'Messages', href: '/government/school-admin/messages', icon: MessageCircle },
        ],
      },
      {
        label: 'SYSTEM',
        items: [
          { name: 'School Profile', href: '/government/school-admin/school-profile', icon: Building2 },
          { name: 'School Settings', href: '/government/school-admin/settings', icon: Settings2Icon },
        ],
      },
    ],
  },

  [SystemRole.COUNTY_ADMIN]: {
    headerTitle: 'NEMIS',
    headerSubtitle: 'CEO PANEL',
    dashboardItem: {
      name: 'Dashboard',
      href: '/government/county',
      icon: LayoutDashboard,
    },
    navGroups: [
      {
        label: 'MAIN',
        items: [
          { name: 'Districts', href: '/government/county/districts', icon: Map },
          { name: 'Schools', href: '/government/county/schools', icon: School },
        ],
      },
      {
        label: 'PEOPLE',
        items: [
          { name: 'Students', href: '/government/county/students', icon: Users },
          { name: 'Teachers', href: '/government/county/teachers', icon: BookOpen },
          { name: 'Parent/Guardians', href: '/government/county/parents', icon: UserCircle2 },
          { name: 'Administrative Users', href: '/government/county/users', icon: Users },
        ],
      },
      {
        label: 'FINANCE',
        items: [
          { name: 'Overview', href: '/government/county/finance', icon: DollarSign },
          { name: 'Fee Rules', href: '/government/county/finance/fee-rules', icon: ClipboardCheck },
        ],
      },
      {
        label: 'REPORTS',
        items: [{ name: 'Reports', href: '/government/county/reports', icon: ClipboardCheck }],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Messages', href: '/government/county/messages', icon: MessageSquare },
          { name: 'Notifications', href: '/government/county/notifications', icon: Bell },
          { name: 'Alerts', href: '/government/county/alerts', icon: AlertTriangle },
        ],
      },
      {
        label: 'SYSTEM',
        items: [
          { name: 'Audit Trail', href: '/government/county/audit', icon: ShieldCheck },
          { name: 'Settings', href: '/government/county/settings', icon: Settings },
        ],
      },
    ],
  },

  [SystemRole.DEO]: {
    headerTitle: 'Nemis',
    headerSubtitle: 'DEO Portal',
    navGroups: [
      {
        label: 'OVERVIEW',
        items: [{ name: 'Dashboard', href: '/government/deo', icon: LayoutDashboard }],
      },
      {
        label: 'MAIN',
        items: [
          { name: 'Schools', href: '/government/deo/schools', icon: Building2 },
          { name: 'School Admins', href: '/government/deo/school-admins', icon: UserCog },
          { name: 'Teachers', href: '/government/deo/teachers', icon: GraduationCap },
          { name: 'Students', href: '/government/deo/students', icon: Users },
          { name: 'Transfers', href: '/government/deo/transfers', icon: ArrowRightLeft },
        ],
      },
      {
        label: 'REPORTS',
        items: [
          { name: 'Reports', href: '/government/deo/reports', icon: FileBarChart },
          { name: 'Finance', href: '/government/deo/finance', icon: DollarSign },
        ],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Messaging', href: '/government/deo/messages', icon: MessageSquare },
          { name: 'Notifications', href: '/government/deo/notifications', icon: Bell },
          { name: 'Alerts', href: '/government/deo/alerts', icon: AlertTriangle },
        ],
      },
      {
        label: 'SYSTEM',
        items: [{ name: 'Settings', href: '/government/deo/settings', icon: Settings }],
      },
    ],
  },

  [SystemRole.MINISTRY_ADMIN]: {
    headerTitle: 'NEMIS',
    headerSubtitle: 'Ministry of Education',
    dashboardItem: {
      name: 'Dashboard',
      href: '/government/ministry-portal',
      icon: LayoutDashboard,
    },
    navGroups: [
      {
        label: 'MAIN',
        items: [{ name: 'Schools', href: '/government/ministry-portal/schools', icon: School }],
      },
      {
        label: 'PEOPLE',
        items: [
          { name: 'Students', href: '/government/ministry-portal/students', icon: Users },
          { name: 'Teachers', href: '/government/ministry-portal/teachers', icon: BookOpen },
          { name: 'Parent/Guardians', href: '/government/ministry-portal/parents', icon: UserCircle2 },
          { name: 'Administrative Users', href: '/government/ministry-portal/users', icon: Users },
        ],
      },
      {
        label: 'FINANCE',
        items: [
          { name: 'Overview', href: '/government/ministry-portal/finance', icon: DollarSign },
          { name: 'Fee Rules', href: '/government/ministry-portal/finance/fee-rules', icon: ClipboardCheck },
        ],
      },
      {
        label: 'REPORTS',
        items: [{ name: 'Reports', href: '/government/ministry-portal/reports', icon: ClipboardCheck }],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Messages', href: '/government/ministry-portal/messages', icon: MessageSquare },
          { name: 'Notifications', href: '/government/ministry-portal/notifications', icon: Bell },
          { name: 'Alerts', href: '/government/ministry-portal/alerts', icon: AlertTriangle },
        ],
      },
      {
        label: 'SYSTEM',
        items: [
          { name: 'Audit Trail', href: '/government/ministry-portal/audit', icon: ShieldCheck },
          { name: 'Settings', href: '/government/ministry-portal/settings', icon: Settings },
        ],
      },
    ],
  },

  [SystemRole.TEACHER]: {
    headerTitle: 'NEMIS',
    headerSubtitle: 'Teacher Portal',
    navGroups: [
      {
        label: 'OVERVIEW',
        items: [{ name: 'Dashboard', href: '/government/teacher', icon: LayoutDashboard }],
      },
      {
        label: 'TEACHING',
        items: [
          { name: 'My School', href: '/government/teacher/my-school', icon: Map },
          { name: 'My Classes', href: '/government/teacher/my-classes', icon: School },
          { name: 'Class Schedule', href: '/government/teacher/timetable', icon: CheckCircle },
          { name: 'Gradebook', href: '/government/teacher/grades', icon: CalendarCheck },
          { name: 'Attendence', href: '/government/teacher/attendance', icon: CalendarCheck },
        ],
      },
      {
        label: 'Exercises & Resources',
        items: [
          { name: 'Assignment', href: '/government/teacher/assignment', icon: BookOpen },
          { name: 'Resources', href: '/government/teacher/resources', icon: Users },
        ],
      },
      {
        label: 'COMMUNICATION',
        items: [
          { name: 'Messaging', href: '/government/teacher/messages', icon: MessageCircle },
          { name: 'Notifications', href: '/government/teacher/notifications', icon: Bell },
        ],
      },
    ],
  },
};

/** Explicit overrides for the two school-admin routes whose header title genuinely differs
 * from the corresponding sidebar item's `name` (dashboard root, and the sidebar's
 * "Attendence" typo on the attendance route). All other routes resolve their title from the
 * sidebar config directly via `sidebarItemName` in `page-titles.ts`, so this map is
 * intentionally NOT a full mirror of `sidebarConfigs` — adding a redundant entry here would
 * just be duplicate, drift-prone state. */
const SCHOOL_ADMIN_PAGE_TITLES: Record<string, string> = {
  '/government/school-admin': 'Dashboard Overview',
  '/government/school-admin/attendance': 'Attendance Management',
};

export const headerConfigs: Record<DesktopPortalRole, HeaderConfig> = {
  [SystemRole.INSTITUTION_ADMIN]: {
    basePath: DESKTOP_PORTALS[SystemRole.INSTITUTION_ADMIN].route,
    avatarRole: 'generic',
    breadcrumbRoot: 'School Admin',
    pageTitles: SCHOOL_ADMIN_PAGE_TITLES,
  },
  [SystemRole.COUNTY_ADMIN]: {
    basePath: DESKTOP_PORTALS[SystemRole.COUNTY_ADMIN].route,
    avatarRole: 'generic',
    breadcrumbRoot: 'County',
  },
  [SystemRole.DEO]: {
    basePath: DESKTOP_PORTALS[SystemRole.DEO].route,
    avatarRole: 'deo',
    breadcrumbRoot: 'DEO',
  },
  [SystemRole.MINISTRY_ADMIN]: {
    basePath: DESKTOP_PORTALS[SystemRole.MINISTRY_ADMIN].route,
    avatarRole: 'generic',
    breadcrumbRoot: 'Ministry',
  },
  [SystemRole.TEACHER]: {
    basePath: DESKTOP_PORTALS[SystemRole.TEACHER].route,
    avatarRole: 'teacher',
    breadcrumbRoot: 'Teacher',
  },
};
