'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import {
  EnrollmentStatus,
  type EnrollmentStatus as EnrollmentStatusValue,
  type Gender as GenderValue,
  type GradeLevel as GradeLevelValue,
} from '@nemis-desktop/types';
import { Badge, Button, EmptyState, ErrorState, Input, Select, Skeleton } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useAcademicFoundationViewModel,
  useStudentSearchViewModel,
  useStudentsListViewModel,
} from '@/lib/presentation/hooks';
import { genders, grades, human, Page } from './shared';

export function StudentsDirectoryPage() {
  const vm = useStudentsListViewModel();
  const search = useStudentSearchViewModel();
  const foundation = useAcademicFoundationViewModel();
  const list = useViewModel(vm.store, (s) => s.list);
  const p = useViewModel(vm.store, (s) => s.pagination);
  const filters = useViewModel(vm.store, (s) => s.filters);
  const selectedIds = useViewModel(vm.selection, (s) => s.selectedIds);
  const academicYears = useViewModel(foundation.store, (s) => s.academicYears);
  const classes = useViewModel(foundation.store, (s) => s.classes);
  const yearRows =
    academicYears.status === 'success' || academicYears.status === 'refreshing'
      ? academicYears.data
      : [];
  const classRows =
    classes.status === 'success' || classes.status === 'refreshing' ? classes.data : [];
  useEffect(() => {
    void vm.loadStudents();
    void foundation.loadAcademicYears();
    void foundation.loadClasses();
  }, [foundation, vm]);
  const set = (next: typeof filters) => search.setFilters(next);
  const setAcademicYear = (academicYearId: string) => {
    set({
      ...filters,
      academicYearId: academicYearId || undefined,
      classId: undefined,
    });
    foundation.setClassFilters({ academicYearId: academicYearId || undefined });
    void foundation.loadClasses();
  };
  return (
    <Page
      title="Students"
      action={
        <Link href="/government/school-admin/students/create">
          <Button>Enroll new student</Button>
        </Link>
      }
    >
      <div className="bg-white border rounded-card p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <Input
          placeholder="Name or student number"
          value={filters.keyword ?? ''}
          onChange={(e) => set({ ...filters, keyword: e.target.value })}
        />
        <Select
          options={genders.map((v) => ({ value: v, label: human(v) }))}
          placeholder="All genders"
          value={filters.gender ?? ''}
          onChange={(e) =>
            set({ ...filters, gender: (e.target.value || undefined) as GenderValue | undefined })
          }
        />
        <Select
          options={grades.map((v) => ({ value: v, label: human(v) }))}
          placeholder="All grades"
          value={filters.gradeLevel ?? ''}
          onChange={(e) =>
            set({
              ...filters,
              gradeLevel: (e.target.value || undefined) as GradeLevelValue | undefined,
            })
          }
        />
        <Select
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
          ]}
          placeholder="All statuses"
          value={filters.isActive === undefined ? '' : filters.isActive ? 'active' : 'archived'}
          onChange={(e) =>
            set({
              ...filters,
              isActive: e.target.value === '' ? undefined : e.target.value === 'active',
            })
          }
        />
        <Select
          options={yearRows.map((year) => ({ value: year.id, label: year.code }))}
          placeholder="All academic years"
          value={filters.academicYearId ?? ''}
          onChange={(e) => setAcademicYear(e.target.value)}
        />
        <Select
          options={classRows.map((schoolClass) => ({
            value: schoolClass.id,
            label: schoolClass.name,
          }))}
          placeholder="All classes"
          value={filters.classId ?? ''}
          onChange={(e) => set({ ...filters, classId: e.target.value || undefined })}
        />
        <Select
          options={Object.values(EnrollmentStatus).map((status) => ({
            value: status,
            label: human(status),
          }))}
          placeholder="All enrollment statuses"
          value={filters.enrollmentStatus ?? ''}
          onChange={(e) =>
            set({
              ...filters,
              enrollmentStatus: (e.target.value || undefined) as EnrollmentStatusValue | undefined,
            })
          }
        />
        <Select
          options={[
            { value: 'name', label: 'Name' },
            { value: 'admissionNumber', label: 'Student number' },
            { value: 'updatedAt', label: 'Recently updated' },
          ]}
          placeholder="Sort by"
          value={filters.sort ?? ''}
          onChange={(e) =>
            set({
              ...filters,
              sort: (e.target.value || undefined) as typeof filters.sort,
            })
          }
        />
        <Button onClick={() => void search.search()}>Search</Button>
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
                    <td className="p-4 font-medium">{s.fullName}</td>
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
          <div className="flex justify-between">
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
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={p.page <= 1}
                onClick={() => void vm.goToPage(p.page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={p.page * p.pageSize >= p.totalCount}
                onClick={() => void vm.goToPage(p.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
