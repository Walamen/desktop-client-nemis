'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { List, LayoutGrid, Search, SlidersHorizontal, UserPlus, Plus, ChevronLeft, ChevronRight, Eye, Edit as EditIcon, GraduationCap } from 'lucide-react';
import {
  Gender,
  type Gender as GenderValue,
  type GradeLevel as GradeLevelValue,
} from '@nemis-desktop/types';
import {
  Avatar,
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
} from '@nemis-desktop/ui';
import {
  totalPages,
  type StudentRowView,
  type StudentStatisticsViewModel,
} from '@nemis-desktop/presentation';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useSettingsViewModel,
  useStudentProfileViewModel,
  useStudentSearchViewModel,
  useStudentsListViewModel,
  useStudentStatisticsViewModel,
} from '@/lib/presentation/hooks/school-admin';
import { genders, grades, human } from './shared';

/**
 * Windows a page-button strip down to a bounded set: page 1, page `total`,
 * the current page +/- `delta` neighbors, and an `'ellipsis'` marker for any
 * skipped range in between. Keeps the row from growing unbounded with the
 * number of pages (e.g. 50+ pages for a large school) while still letting
 * the user jump to the start/end or step through nearby pages.
 */
function getPaginationWindow(
  current: number,
  total: number,
  delta = 2,
): (number | 'ellipsis')[] {
  if (total <= 1) return total === 1 ? [1] : [];
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const pages: (number | 'ellipsis')[] = [1];
  if (left > 2) pages.push('ellipsis');
  for (let page = left; page <= right; page++) pages.push(page);
  if (right < total - 1) pages.push('ellipsis');
  pages.push(total);
  return pages;
}

function StatValue({
  status,
  value,
  className,
}: {
  status: 'idle' | 'loading' | 'success' | 'refreshing' | 'empty' | 'error';
  value: number | undefined;
  className: string;
}) {
  if (status === 'error') {
    return <p className={className}>—</p>;
  }
  if (value === undefined) {
    return <Skeleton className="h-9 w-16 mt-2" />;
  }
  return <p className={className}>{value.toLocaleString()}</p>;
}

function StatCards({ stats }: { stats: StudentStatisticsViewModel }) {
  const state = useViewModel(stats.store, (s) => s.stats);
  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="bg-white border border-slate-300">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Total Students
        </p>
        <StatValue
          status={state.status}
          value={data?.totalStudents}
          className="text-4xl font-bold text-slate-900 mt-2"
        />
        <p className="text-xs text-slate-400 mt-1">Registered in school</p>
      </Card>
      <Card className="bg-white border border-slate-300">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Male</p>
        <StatValue
          status={state.status}
          value={data?.maleStudents}
          className="text-4xl font-bold text-sky-600 mt-2"
        />
        <p className="text-xs text-slate-400 mt-1">Male students</p>
      </Card>
      <Card className="bg-white border border-slate-300">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Female</p>
        <StatValue
          status={state.status}
          value={data?.femaleStudents}
          className="text-4xl font-bold text-pink-500 mt-2"
        />
        <p className="text-xs text-slate-400 mt-1">Female students</p>
      </Card>
      <Card className="bg-white border border-slate-300">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          New This Quarter
        </p>
        <StatValue
          status={state.status}
          value={data?.recentEnrollments}
          className="text-4xl font-bold text-emerald-600 mt-2"
        />
        <p className="text-xs text-slate-400 mt-1">Recent enrollments</p>
      </Card>
    </div>
  );
}

export function StudentsDirectoryPage() {
  const vm = useStudentsListViewModel();
  const search = useStudentSearchViewModel();
  const stats = useStudentStatisticsViewModel();
  const settings = useSettingsViewModel();
  const profileVm = useStudentProfileViewModel();
  const list = useViewModel(vm.store, (s) => s.list);
  const p = useViewModel(vm.store, (s) => s.pagination);
  const filters = useViewModel(vm.store, (s) => s.filters);
  const selectedIds = useViewModel(vm.selection, (s) => s.selectedIds);
  const profile = useViewModel(settings.store, (s) => s.profile);
  const details = useViewModel(profileVm.store, (s) => s.details);
  const schoolName =
    profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFirst, setEditFirst] = useState('');
  const [editMiddle, setEditMiddle] = useState('');
  const [editLast, setEditLast] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editGender, setEditGender] = useState<GenderValue>(Gender.FEMALE);
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const keywordDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (keywordDebounce.current) clearTimeout(keywordDebounce.current);
    };
  }, []);
  useEffect(() => {
    void vm.setPageSize(12);
    void stats.loadStatistics();
  }, [stats, vm]);
  const openEdit = (id: string) => {
    setEditingId(id);
    void profileVm.loadDetails(id);
  };
  const detailsReady =
    editingId !== null &&
    (details.status === 'success' || details.status === 'refreshing') &&
    details.data.id === editingId;
  useEffect(() => {
    if (
      editingId &&
      (details.status === 'success' || details.status === 'refreshing') &&
      details.data.id === editingId
    ) {
      setEditFirst(details.data.firstName);
      setEditMiddle(details.data.middleName ?? '');
      setEditLast(details.data.lastName);
      setEditDob(details.data.rawDateOfBirth.slice(0, 10));
      setEditGender(details.data.rawGender as GenderValue);
      setEditPhone(details.data.phoneNumber ?? '');
      setEditEmail(details.data.email ?? '');
      setEditAddress(details.data.address ?? '');
    }
  }, [details, editingId]);
  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const r = await profileVm.updateStudent({
      studentId: editingId,
      firstName: editFirst,
      middleName: editMiddle || undefined,
      lastName: editLast,
      dateOfBirth: editDob,
      gender: editGender,
      phoneNumber: editPhone || undefined,
      email: editEmail || undefined,
      address: editAddress || undefined,
    });
    if (r.ok) {
      setEditingId(null);
      // Note: profileVm.updateStudent (StudentsViewModel.updateStudent) already
      // awaits this.loadStudents() internally on success — vm and profileVm share
      // the same underlying store, so an explicit refetch here would be redundant.
    }
  };
  return (
    <>
      <div className="min-h-full bg-slate-100">
        {/* Full-bleed header band — matches portal-web's Students page header exactly. */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
              {schoolName}
            </p>
            <h1 className="text-xl font-bold text-white">Students</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/government/school-admin/students/createbulk">
              <button className="inline-flex items-center gap-2 rounded-button border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-700">
                <Plus className="w-4 h-4" />
                Create Many
              </button>
            </Link>
            <Link href="/government/school-admin/students/create">
              <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-slate-700 rounded-button hover:bg-slate-500">
                <UserPlus className="w-4 h-4" />
                Add Single Student
              </button>
            </Link>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          <StatCards stats={stats} />

          {/* Sidebar + Main content */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Filter sidebar */}
            <div className="w-full lg:w-56 shrink-0 lg:sticky lg:top-6 lg:self-start">
              <div className="bg-white border border-slate-300 p-5 space-y-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
                </p>

                {/* Search */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Name or student number"
                      defaultValue={filters.keyword ?? ''}
                      onChange={(e) => {
                        const keyword = e.target.value;
                        search.setFilters({ ...filters, keyword: keyword || undefined });
                        if (keywordDebounce.current) clearTimeout(keywordDebounce.current);
                        keywordDebounce.current = setTimeout(() => void search.search(), 300);
                      }}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none text-slate-700 placeholder:text-slate-300"
                    />
                  </div>
                </div>

                {/* Grade Level */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Grade Level
                  </label>
                  <select
                    value={filters.gradeLevel ?? ''}
                    onChange={(e) => {
                      search.setFilters({
                        ...filters,
                        gradeLevel: (e.target.value || undefined) as GradeLevelValue | undefined,
                      });
                      void search.search();
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none text-slate-700"
                  >
                    <option value="">All Grades</option>
                    {grades.map((g) => (
                      <option key={g} value={g}>
                        {human(g)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Status
                  </label>
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
                    {(['all', 'active', 'inactive'] as const).map((s) => {
                      const active =
                        s === 'all'
                          ? filters.isActive === undefined
                          : filters.isActive === (s === 'active');
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            search.setFilters({
                              ...filters,
                              isActive: s === 'all' ? undefined : s === 'active',
                            });
                            void search.search();
                          }}
                          className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                            active ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {s === 'all' ? 'All' : s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-800">{p.totalCount}</span> students found
                </p>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                  <button
                    aria-label="table view"
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    aria-label="grid view"
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {(list.status === 'loading' || list.status === 'idle') && (
                <div className="bg-white border border-slate-300 p-12 flex items-center justify-center">
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              )}
              {list.status === 'error' && (
                <div className="bg-white border border-slate-300 p-8">
                  <ErrorState message={list.error.userMessage} />
                </div>
              )}
              {list.status === 'empty' && (
                <div className="bg-white border border-slate-300 p-12">
                  <EmptyState
                    icon={<GraduationCap className="w-10 h-10 text-slate-200" />}
                    title={filters.keyword ? 'No search results found.' : 'No students have been enrolled.'}
                    description="Student records will appear here after enrollment."
                    action={
                      <Link href="/government/school-admin/students/create">
                        <Button>Create student</Button>
                      </Link>
                    }
                  />
                </div>
              )}
              {(list.status === 'success' || list.status === 'refreshing') && (
                <>
                  {viewMode === 'table' ? (
                    <div className="bg-white border border-slate-300 overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-secondary/20 border-b border-slate-100">
                          <tr>
                            <th className="p-4">
                              <input
                                type="checkbox"
                                aria-label="Select all students"
                                checked={list.data.every((student) => selectedIds.has(student.id))}
                                onChange={(event) =>
                                  vm.selectPage(
                                    list.data.map((student) => student.id),
                                    event.target.checked,
                                  )
                                }
                              />
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                              Student
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                              Student number
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                              Grade
                            </th>
                            <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                              Gender
                            </th>
                            <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                              Status
                            </th>
                            <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {list.data.map((s) => (
                            <tr key={s.id} className="hover:bg-slate-50">
                              <td className="p-4">
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${s.fullName}`}
                                  checked={selectedIds.has(s.id)}
                                  onChange={() => vm.toggleSelection(s.id)}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <Avatar
                                    firstName={s.fullName.split(' ')[0]}
                                    lastName={s.fullName.split(' ').slice(1).join(' ')}
                                    role="student"
                                    size="sm"
                                  />
                                  <p className="font-medium text-slate-800">{s.fullName}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-500 font-mono">{s.admissionNumber}</td>
                              <td className="px-4 py-3">
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                  {s.gradeLevel || 'N/A'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{s.gender}</td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    s.status.badge === 'success' || s.status.badge === 'active'
                                      ? 'text-emerald-700 bg-emerald-50'
                                      : 'text-slate-400 bg-slate-100'
                                  }`}
                                >
                                  {s.status.label}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-center gap-1">
                                  <Link
                                    href={`/government/school-admin/students/profile?id=${s.id}`}
                                    aria-label="View"
                                    title="View"
                                    className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-50 inline-flex"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Link>
                                  <button
                                    onClick={() => openEdit(s.id)}
                                    aria-label="Edit"
                                    title="Edit"
                                    className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                                  >
                                    <EditIcon className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {list.data.map((s) => (
                        <StudentCard key={s.id} student={s} onEdit={() => openEdit(s.id)} />
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-4">
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span>{p.totalCount} students</span>
                      {selectedIds.size > 0 && (
                        <>
                          <span>{selectedIds.size} selected</span>
                          <Button size="sm" variant="secondary" onClick={() => vm.clearSelection()}>
                            Clear
                          </Button>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void vm.goToPage(Math.max(1, p.page - 1))}
                        disabled={p.page === 1}
                        aria-label="Previous page"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      {getPaginationWindow(p.page, totalPages(p)).map((entry, index) =>
                        entry === 'ellipsis' ? (
                          <span
                            key={`ellipsis-${index}`}
                            className="w-8 h-8 flex items-center justify-center text-xs text-slate-400"
                          >
                            …
                          </span>
                        ) : (
                          <button
                            key={entry}
                            onClick={() => void vm.goToPage(entry)}
                            aria-current={p.page === entry ? 'page' : undefined}
                            className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                              p.page === entry
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {entry}
                          </button>
                        ),
                      )}
                      <button
                        onClick={() => void vm.goToPage(Math.min(totalPages(p), p.page + 1))}
                        disabled={p.page === totalPages(p)}
                        aria-label="Next page"
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <Drawer
        isOpen={editingId !== null}
        onClose={() => {
          setEditingId(null);
        }}
        title="Edit Student"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-student-form" disabled={!detailsReady}>
              Save changes
            </Button>
          </>
        }
      >
        {!detailsReady ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <form id="edit-student-form" onSubmit={(e) => void submitEdit(e)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First name"
                required
                value={editFirst}
                onChange={(e) => setEditFirst(e.target.value)}
              />
              <Input
                label="Last name"
                required
                value={editLast}
                onChange={(e) => setEditLast(e.target.value)}
              />
              <Input
                label="Middle name"
                value={editMiddle}
                onChange={(e) => setEditMiddle(e.target.value)}
              />
              <Input
                label="Date of birth"
                type="date"
                required
                value={editDob}
                onChange={(e) => setEditDob(e.target.value)}
              />
              <Select
                label="Gender"
                required
                options={genders.map((v) => ({ value: v, label: human(v) }))}
                value={editGender}
                onChange={(e) => setEditGender(e.target.value as GenderValue)}
              />
              <Input
                label="Phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
              <Input
                label="Email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <Input
              label="Address"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
            />
          </form>
        )}
      </Drawer>
    </>
  );
}

function StudentCard({ student, onEdit }: { student: StudentRowView; onEdit: () => void }) {
  return (
    <Card hoverable bordered={false}>
      <div className="flex -mx-6 -mt-6 -mb-6 min-h-[120px]">
        {/* Image — left 30% */}
        <div className="w-[30%] shrink-0 relative bg-slate-100">
          <Avatar
            firstName={student.fullName.split(' ')[0]}
            lastName={student.fullName.split(' ').slice(1).join(' ')}
            role="student"
            fill
            alt={student.fullName}
          />
        </div>
        {/* Content — right 70% */}
        <div className="flex-1 min-w-0 p-3 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 leading-snug truncate">
                {student.fullName}
              </p>
              <p className="text-xs font-mono text-slate-400 mt-0.5">{student.admissionNumber}</p>
            </div>
            <span
              className={`shrink-0 text-xs font-semibold px-2 py-0.5 ${
                student.status.badge === 'success' || student.status.badge === 'active'
                  ? 'text-slate-100 bg-active'
                  : 'text-slate-400 bg-slate-100'
              }`}
            >
              {student.status.label}
            </span>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Grade</span>
              <span className="text-slate-700 font-medium">{student.gradeLevel || 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Gender</span>
              <span className="text-slate-700 font-medium">{student.gender}</span>
            </div>
          </div>
          <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-end gap-1">
            <Link
              href={`/government/school-admin/students/profile?id=${student.id}`}
              className="px-3 py-0.5 text-xs rounded-button border border-slate-300 text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            >
              View
            </Link>
            <button
              onClick={onEdit}
              className="px-3 py-0.5 text-xs rounded-button border border-slate-300 text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
