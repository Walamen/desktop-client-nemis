import {
  LayoutDashboard, Map, School, CheckCircle, BookOpen, CalendarCheck, Users,
  FileText, UserPlus, CreditCard, Bell, MessageCircle, Settings2Icon, type LucideIcon,
} from 'lucide-react';

export interface SidebarNavItem { name: string; href: string; icon: LucideIcon; }
export interface SidebarGroup { label: string; items: readonly SidebarNavItem[]; }

export const SIDEBAR_DASHBOARD_ITEM: SidebarNavItem = {
  name: 'Overview', href: '/government/school-admin', icon: LayoutDashboard,
};

export const SIDEBAR_NAV: readonly SidebarGroup[] = [
  { label: 'User Management', items: [
    { name: 'Students', href: '/government/school-admin/students', icon: Map },
    { name: 'Teachers & Staff', href: '/government/school-admin/teachers-staff', icon: School },
    { name: 'Parents & Guardians', href: '/government/school-admin/parents-guardians', icon: CheckCircle },
  ]},
  { label: 'ACADEMIC', items: [
    { name: 'Classes Management', href: '/government/school-admin/classes', icon: BookOpen },
    { name: 'Subjects Management', href: '/government/school-admin/subjects', icon: BookOpen },
    { name: 'Attendence Management', href: '/government/school-admin/attendance', icon: CalendarCheck },
    { name: 'Academic & Grading', href: '/government/school-admin/academic-grading', icon: Users },
    { name: 'General Schedule Management', href: '/government/school-admin/timetable', icon: BookOpen },
    { name: 'Grade Windows', href: '/government/school-admin/academic-grading/windows', icon: FileText },
  ]},
  { label: 'FINANCIAL', items: [
    { name: 'Financial / Fees', href: '/government/school-admin/financial', icon: UserPlus },
    { name: 'Record Payment', href: '/government/school-admin/financial/record-payment', icon: CreditCard },
  ]},
  { label: 'REPORTS', items: [
    { name: 'Reports', href: '/government/school-admin/reports', icon: FileText },
  ]},
  { label: 'COMMUNICATION', items: [
    { name: 'Notifications', href: '/government/school-admin/notifications', icon: Bell },
    { name: 'Messages', href: '/government/school-admin/messages', icon: MessageCircle },
  ]},
  { label: 'SYSTEM', items: [
    { name: 'School Settings', href: '/government/school-admin/settings', icon: Settings2Icon },
  ]},
];
