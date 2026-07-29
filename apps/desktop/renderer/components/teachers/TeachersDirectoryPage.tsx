'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { StaffPosition } from '@nemis-desktop/types';
import { Avatar, Button, Card, EmptyState, ErrorState, Skeleton } from '@nemis-desktop/ui';
import type { TeacherRowView } from '@nemis-desktop/presentation';
import {
  Search,
  UserPlus,
  GraduationCap,
  Users,
  UserCheck,
  UserCog2,
  ClipboardList,
  Edit,
  Trash2,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useSettingsViewModel,
  useTeacherDashboardViewModel,
  useTeacherSearchViewModel,
  useTeachersListViewModel,
} from '@/lib/presentation/hooks';
import { StatCard } from '@/components/dashboard/StatCard';
import { human } from './shared';

/** Teachers & Staff directory — mirrors portal-web's Teacher Management page
 * (header band, 4 stat tiles, search/status toolbar, Table/Grid toggle,
 * numbered pagination). The list is scoped to `position: TEACHER` to match
 * the web reference exactly; the underlying ViewModel can list any staff
 * position, that capability is just not exposed in this toolbar, same as web. */
export function TeachersDirectoryPage() {
  const vm = useTeachersListViewModel();
  const search = useTeacherSearchViewModel();
  const settings = useSettingsViewModel();
  const teacherDashboard = useTeacherDashboardViewModel();

  const list = useViewModel(vm.store, (s) => s.list);
  const p = useViewModel(vm.store, (s) => s.pagination);
  const filters = useViewModel(vm.store, (s) => s.filters);
  const profile = useViewModel(settings.store, (s) => s.profile);
  const dashboard = useViewModel(teacherDashboard.store, (s) => s.dashboard);

  const schoolName =
    profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');

  useEffect(() => {
    search.setFilters({ ...filters, position: StaffPosition.TEACHER });
    void vm.loadTeachers();
    void teacherDashboard.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dashboardReady = dashboard.status === 'success' || dashboard.status === 'refreshing';
  const totalTeachers = dashboardReady ? dashboard.data.totalTeachers : undefined;
  const fullTime = dashboardReady
    ? dashboard.data.byEmploymentStatus.find((v) => v.employmentType === 'FULL_TIME')?.teacherCount ?? 0
    : undefined;
  const partTime = dashboardReady
    ? dashboard.data.byEmploymentStatus.find((v) => v.employmentType === 'PART_TIME')?.teacherCount ?? 0
    : undefined;
  const totalAssignments = dashboardReady ? dashboard.data.totalAssignments : undefined;

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            {schoolName}
          </p>
          <h1 className="text-xl font-bold mt-0.5">Teacher Management</h1>
        </div>
        <Link href="/government/school-admin/teachers-staff/create">
          <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-slate-600 border border-slate-500 rounded-button hover:bg-slate-700">
            <UserPlus className="w-4 h-4" />
            Add Teacher
          </button>
        </Link>
      </div>

      <div className="px-6 py-6 space-y-5">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard label="Total Teachers" value={totalTeachers} icon={UserCog2} />
          <StatCard label="Full Time" value={fullTime} icon={UserCheck} valueClassName="text-secondary" />
          <StatCard label="Part Time" value={partTime} icon={Users} valueClassName="text-pending" />
          <StatCard label="Total Assignments" value={totalAssignments} icon={ClipboardList} />
        </div>

        {/* Teacher List */}
        <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
          {/* Toolbar */}
          <div className="bg-secondary/20 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or teacher ID..."
                  defaultValue={filters.keyword ?? ''}
                  onChange={(e) => {
                    search.setKeyword(e.target.value);
                    void search.search();
                  }}
                  className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-button focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
                />
              </div>
              <div>
                <select
                  value={filters.isActive === undefined ? 'ALL' : filters.isActive ? 'ACTIVE' : 'INACTIVE'}
                  onChange={(e) => {
                    const value = e.target.value;
                    search.setFilters({
                      ...filters,
                      isActive: value === 'ALL' ? undefined : value === 'ACTIVE',
                    });
                    void search.search();
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                  className={`p-2 border transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-sky-200 hover:text-sky-700'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  title="Table view"
                  className={`p-2 border transition-colors ${
                    viewMode === 'table'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-gray-500 border-gray-300 hover:border-sky-200 hover:text-sky-700'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {(list.status === 'loading' || list.status === 'idle') && (
              <div className="flex justify-center py-8">
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            )}
            {list.status === 'error' && (
              <ErrorState message={list.error.userMessage} onRetry={() => void vm.loadTeachers()} />
            )}
            {list.status === 'empty' && (
              <EmptyState
                icon={<GraduationCap className="w-12 h-12 text-gray-300" />}
                title="No teachers found"
                description={
                  filters.keyword
                    ? 'No teachers match your filters.'
                    : 'Start by adding your teaching staff to the system.'
                }
                action={
                  !filters.keyword ? (
                    <Link href="/government/school-admin/teachers-staff/create">
                      <Button>Add First Teacher</Button>
                    </Link>
                  ) : undefined
                }
              />
            )}
            {(list.status === 'success' || list.status === 'refreshing') && (
              <>
                {viewMode === 'table' ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                            Employee ID
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                            Name
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                            Contact
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                            Employment Type
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                            Status
                          </th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.data.map((teacher) => (
                          <tr key={teacher.id} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm">{teacher.employeeNumber}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  src={teacher.photoUrl}
                                  firstName={teacher.firstName}
                                  lastName={teacher.lastName}
                                  role="teacher"
                                  size="sm"
                                />
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {teacher.firstName} {teacher.lastName}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    {teacher.email || 'No email'}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-sm">{teacher.phoneNumber}</td>
                            <td className="py-3 px-4 text-sm">
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs whitespace-nowrap">
                                {human(teacher.employmentType)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm">
                              <span
                                className={`px-2 py-1 rounded text-xs whitespace-nowrap ${
                                  teacher.isActive
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {teacher.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/government/school-admin/teachers-staff/edit?id=${teacher.id}`}
                                  className="p-1 hover:bg-gray-100 rounded inline-flex"
                                  aria-label="Edit"
                                  title="Edit teacher"
                                >
                                  <Edit className="w-4 h-4 text-gray-600" />
                                </Link>
                                <button
                                  onClick={() => void vm.bulkArchive([teacher.id])}
                                  className="p-1 hover:bg-gray-100 rounded"
                                  aria-label="Deactivate"
                                  title="Deactivate teacher"
                                >
                                  <Trash2 className="w-4 h-4 text-red-600" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {list.data.map((teacher) => (
                      <TeacherCard key={teacher.id} teacher={teacher} onArchive={() => void vm.bulkArchive([teacher.id])} />
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {p.totalCount > p.pageSize && (
                  <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-500">
                      Showing{' '}
                      <span className="font-medium text-gray-700">
                        {(p.page - 1) * p.pageSize + 1}–{Math.min(p.page * p.pageSize, p.totalCount)}
                      </span>{' '}
                      of <span className="font-medium text-gray-700">{p.totalCount}</span> teachers
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void vm.goToPage(p.page - 1)}
                        disabled={p.page <= 1}
                        className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void vm.goToPage(p.page + 1)}
                        disabled={p.page * p.pageSize >= p.totalCount}
                        className="p-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeacherCard({ teacher, onArchive }: { teacher: TeacherRowView; onArchive: () => void }) {
  return (
    <Card hoverable bordered={false}>
      <div className="flex -mx-6 -mt-6 -mb-6 min-h-[160px]">
        {/* Image — left 40% */}
        <div className="w-2/5 shrink-0 relative bg-slate-100">
          <Avatar
            src={teacher.photoUrl}
            firstName={teacher.firstName}
            lastName={teacher.lastName}
            role="teacher"
            fill
            alt={`${teacher.firstName} ${teacher.lastName}`}
          />
        </div>
        {/* Content — right 60% */}
        <div className="flex-1 min-w-0 p-4 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-snug">
                {teacher.firstName} {teacher.lastName}
              </p>
              <p className="text-xs font-mono text-slate-400 mt-0.5">{teacher.employeeNumber}</p>
            </div>
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 ${
                teacher.isActive ? 'text-slate-100 bg-active' : 'text-slate-400 bg-slate-100'
              }`}
            >
              {teacher.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="mt-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Employment</span>
              <span className="text-slate-700 font-medium">{human(teacher.employmentType)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Position</span>
              <span className="text-slate-700 font-medium">{human(teacher.position)}</span>
            </div>
          </div>
          <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Link
              href={`/government/school-admin/teachers-staff/edit?id=${teacher.id}`}
              className="px-4 py-1 rounded-full text-slate-600 border text-xs border-slate-300 hover:text-slate-700 hover:bg-slate-100"
              title="Edit teacher"
            >
              Update
            </Link>
            <button
              onClick={onArchive}
              className="px-4 py-1 rounded-full text-error text-xs border border-slate-300 hover:text-error/90 hover:bg-error/10"
              title="Deactivate teacher"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
