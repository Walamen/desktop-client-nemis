'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { List, LayoutGrid } from 'lucide-react';
import { type GradeLevel as GradeLevelValue } from '@nemis-desktop/types';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Select, Skeleton } from '@nemis-desktop/ui';
import { totalPages, type StudentRowView } from '@nemis-desktop/presentation';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useSettingsViewModel,
  useStudentSearchViewModel,
  useStudentsListViewModel,
  useStudentStatisticsViewModel,
} from '@/lib/presentation/hooks';
import { grades, human } from './shared';

function StatCards({ stats }: { stats: ReturnType<typeof useStudentStatisticsViewModel> }) {
  const state = useViewModel(stats.store, (s) => s.stats);
  const value = (n: number) => n.toLocaleString();
  const data = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white border border-slate-300 rounded-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Total Students
        </p>
        <p className="text-4xl font-bold text-slate-900 mt-2">{value(data?.totalStudents ?? 0)}</p>
        <p className="text-xs text-slate-400 mt-1">Registered in school</p>
      </div>
      <div className="bg-white border border-slate-300 rounded-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Male</p>
        <p className="text-4xl font-bold text-sky-600 mt-2">{value(data?.maleStudents ?? 0)}</p>
        <p className="text-xs text-slate-400 mt-1">Male students</p>
      </div>
      <div className="bg-white border border-slate-300 rounded-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Female</p>
        <p className="text-4xl font-bold text-pink-500 mt-2">{value(data?.femaleStudents ?? 0)}</p>
        <p className="text-xs text-slate-400 mt-1">Female students</p>
      </div>
      <div className="bg-white border border-slate-300 rounded-card p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          New This Quarter
        </p>
        <p className="text-4xl font-bold text-emerald-600 mt-2">
          {value(data?.recentEnrollments ?? 0)}
        </p>
        <p className="text-xs text-slate-400 mt-1">Recent enrollments</p>
      </div>
    </div>
  );
}

export function StudentsDirectoryPage() {
  const vm = useStudentsListViewModel();
  const search = useStudentSearchViewModel();
  const stats = useStudentStatisticsViewModel();
  const settings = useSettingsViewModel();
  const list = useViewModel(vm.store, (s) => s.list);
  const p = useViewModel(vm.store, (s) => s.pagination);
  const filters = useViewModel(vm.store, (s) => s.filters);
  const selectedIds = useViewModel(vm.selection, (s) => s.selectedIds);
  const profile = useViewModel(settings.store, (s) => s.profile);
  const schoolName = profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
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
  return (
    <div className="p-6 space-y-5">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between rounded-card">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
            {schoolName}
          </p>
          <h1 className="text-xl font-bold text-white">Students</h1>
        </div>
        <Link href="/government/school-admin/students/create">
          <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-slate-700 rounded-button hover:bg-slate-500">
            Add Single Student
          </button>
        </Link>
      </div>
      <StatCards stats={stats} />
      <div className="bg-white border border-slate-300 p-5 space-y-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Filters</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Search
            </label>
            <Input
              placeholder="Name or student number"
              defaultValue={filters.keyword ?? ''}
              onChange={(e) => {
                const keyword = e.target.value;
                search.setFilters({ ...filters, keyword: keyword || undefined });
                if (keywordDebounce.current) clearTimeout(keywordDebounce.current);
                keywordDebounce.current = setTimeout(() => void search.search(), 300);
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Grade Level
            </label>
            <Select
              options={grades.map((v) => ({ value: v, label: human(v) }))}
              placeholder="All Grades"
              value={filters.gradeLevel ?? ''}
              onChange={(e) => {
                search.setFilters({
                  ...filters,
                  gradeLevel: (e.target.value || undefined) as GradeLevelValue | undefined,
                });
                void search.search();
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
              Status
            </label>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {(['all', 'active', 'inactive'] as const).map((s) => {
                const active =
                  s === 'all' ? filters.isActive === undefined : filters.isActive === (s === 'active');
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-800">{p.totalCount}</span> students found
        </p>
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          <button
            aria-label="table view"
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            aria-label="grid view"
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>
      {(list.status === 'loading' || list.status === 'idle') && (
        <Skeleton className="h-56 w-full" />
      )}
      {list.status === 'error' && <ErrorState message={list.error.userMessage} />}{' '}
      {list.status === 'empty' && (
        <EmptyState
          title={filters.keyword ? 'No search results found.' : 'No students have been enrolled.'}
          description="Student records will appear here after enrollment."
          action={
            <Link href="/government/school-admin/students/create">
              <Button>Create student</Button>
            </Link>
          }
        />
      )}
      {(list.status === 'success' || list.status === 'refreshing') && (
        <>
          {viewMode === 'table' ? (
            <div className="bg-white border rounded-card overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left border-b text-slate-500">
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
                    <th className="p-4">Student</th>
                    <th className="p-4">Student number</th>
                    <th className="p-4">Gender</th>
                    <th className="p-4">Grade</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="p-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.fullName}`}
                          checked={selectedIds.has(s.id)}
                          onChange={() => vm.toggleSelection(s.id)}
                        />
                      </td>
                      <td className="p-4 font-medium flex items-center gap-3">
                        <Avatar
                          firstName={s.fullName.split(' ')[0]}
                          lastName={s.fullName.split(' ').slice(1).join(' ')}
                          role="student"
                          size="sm"
                        />
                        {s.fullName}
                      </td>
                      <td className="p-4 font-mono">{s.admissionNumber}</td>
                      <td className="p-4">{s.gender}</td>
                      <td className="p-4">{s.gradeLevel}</td>
                      <td className="p-4">
                        <Badge
                          variant={
                            s.status.badge === 'success' || s.status.badge === 'active'
                              ? 'success'
                              : 'neutral'
                          }
                          size="sm"
                        >
                          {s.status.label}
                        </Badge>
                      </td>
                      <td className="p-4 flex gap-2">
                        <Link
                          className="text-blue-700"
                          href={`/government/school-admin/students/profile?id=${s.id}`}
                        >
                          View
                        </Link>
                        <Link
                          className="text-blue-700"
                          href={`/government/school-admin/students/edit?id=${s.id}`}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {list.data.map((s) => (
                <StudentCard key={s.id} student={s} />
              ))}
            </div>
          )}
          <div className="flex justify-between items-center">
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
              {Array.from({ length: Math.max(1, totalPages(p)) }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => void vm.goToPage(page)}
                  className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                    p.page === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StudentCard({ student }: { student: StudentRowView }) {
  return (
    <Card hoverable bordered={false}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar
            firstName={student.fullName.split(' ')[0]}
            lastName={student.fullName.split(' ').slice(1).join(' ')}
            role="student"
            size="md"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-snug truncate">
              {student.fullName}
            </p>
            <p className="text-xs font-mono text-slate-400 mt-0.5">{student.admissionNumber}</p>
          </div>
        </div>
        <Badge variant={student.status.badge === 'success' || student.status.badge === 'active' ? 'success' : 'neutral'} size="sm">
          {student.status.label}
        </Badge>
      </div>
      <div className="mt-3 space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Grade</span>
          <span className="text-slate-700 font-medium">{student.gradeLevel || 'N/A'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Gender</span>
          <span className="text-slate-700 font-medium">{student.gender}</span>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
        <Link className="text-blue-700" href={`/government/school-admin/students/profile?id=${student.id}`}>
          View
        </Link>
        <Link className="text-blue-700" href={`/government/school-admin/students/edit?id=${student.id}`}>
          Edit
        </Link>
      </div>
    </Card>
  );
}
