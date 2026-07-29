'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { GradeLevel, type GradeLevel as GradeLevelValue } from '@nemis-desktop/types';
import type { ClassRowView } from '@nemis-desktop/presentation';
import { Drawer, Input, Select } from '@nemis-desktop/ui';
import {
  BookOpen,
  Plus,
  Edit,
  RotateCcw,
  Ban,
  UserPlus,
  X,
  Search,
  Users,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel, useAcademicYearViewModel } from '@/lib/presentation/hooks';
import { nemisBridge } from '@/services/nemis-bridge';
import { StatCard } from '@/components/dashboard/StatCard';
import { formatGrade, getUnassignedStudents, type UnassignedStudent } from './shared';

/** Classes & Unassigned Students — mirrors portal-web's Class Management
 * page (header band, 4 stat tiles, tabbed table, edit/assign drawers). The
 * web reference sources "With/Without Teachers" and enrolled counts from
 * backend-joined fields that don't exist here; both are recomputed for real
 * from the same class-scoped teacher/enrollment queries the Teachers and
 * Students modules already expose, rather than being estimated or dropped. */
export function ClassesDirectoryPage() {
  const vm = useAcademicFoundationViewModel();
  const academicYear = useAcademicYearViewModel();
  const state = useViewModel(vm.store, (s) => s.classes);
  const filters = useViewModel(vm.store, (s) => s.classFilters);
  const currentYear = useViewModel(academicYear.store, (s) => s.current);

  const [activeTab, setActiveTab] = useState<'classes' | 'unassigned'>('classes');
  const [totalClasses, setTotalClasses] = useState<number | undefined>(undefined);
  const [teacherCoverage, setTeacherCoverage] = useState<{ with: number; without: number } | undefined>(undefined);
  const [enrolledCounts, setEnrolledCounts] = useState<Record<string, number>>({});
  const [teacherCounts, setTeacherCounts] = useState<Record<string, number>>({});

  const [unassigned, setUnassigned] = useState<UnassignedStudent[] | null>(null);
  const [unassignedGradeFilter, setUnassignedGradeFilter] = useState('all');
  const [unassignedSearch, setUnassignedSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());

  const [editing, setEditing] = useState<ClassRowView | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [section, setSection] = useState('');
  const [gradeLevel, setGradeLevel] = useState<GradeLevelValue>(GradeLevel.KG);
  const [capacity, setCapacity] = useState('');
  const [saving, setSaving] = useState(false);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [studentsToEnroll, setStudentsToEnroll] = useState<UnassignedStudent[]>([]);
  const [enrollClassId, setEnrollClassId] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState('');
  const terms = useViewModel(vm.store, (s) => s.terms);

  useEffect(() => {
    void vm.loadClasses();
    void academicYear.loadCurrent();
    void nemisBridge.listClasses({ limit: 1 }).then((r) => setTotalClasses(r.total));
    void refreshUnassigned();
    void refreshTeacherCoverage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshUnassigned() {
    setUnassigned(await getUnassignedStudents());
  }

  async function refreshTeacherCoverage() {
    const all = await nemisBridge.listClasses({ limit: 500, includeInactive: false });
    const counts = await Promise.all(
      all.items.map((c) => nemisBridge.listTeachers({ classId: c.id, isActive: true, limit: 1 }).then((r) => r.total)),
    );
    setTeacherCoverage({ with: counts.filter((n) => n > 0).length, without: counts.filter((n) => n === 0).length });
  }

  // Per-visible-row enrolled/teacher counts (cheap: only the current page).
  useEffect(() => {
    if (state.status !== 'success' && state.status !== 'refreshing') return;
    let cancelled = false;
    void Promise.all(
      state.data.map(async (c) => {
        const [enrolledRes, teacherRes] = await Promise.all([
          nemisBridge.listStudents({ classId: c.id, enrollmentStatus: 'ACTIVE', limit: 1 }),
          nemisBridge.listTeachers({ classId: c.id, isActive: true, limit: 1 }),
        ]);
        return [c.id, enrolledRes.total, teacherRes.total] as const;
      }),
    ).then((rows) => {
      if (cancelled) return;
      setEnrolledCounts(Object.fromEntries(rows.map(([id, e]) => [id, e])));
      setTeacherCounts(Object.fromEntries(rows.map(([id, , t]) => [id, t])));
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  const gradeLevels = useMemo(
    () =>
      (state.status === 'success' || state.status === 'refreshing'
        ? Array.from(new Set(state.data.map((c) => c.gradeLevel)))
        : []
      ).sort(),
    [state],
  );

  const unassignedByGrade = useMemo(() => {
    const map = new Map<string, number>();
    (unassigned ?? []).forEach((s) => {
      if (s.gradeLevel) map.set(s.gradeLevel, (map.get(s.gradeLevel) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([g, count]) => ({ gradeLevel: g, count }))
      .sort((a, b) => a.gradeLevel.localeCompare(b.gradeLevel));
  }, [unassigned]);

  const filteredUnassigned = useMemo(() => {
    return (unassigned ?? [])
      .filter((s) => {
        if (unassignedGradeFilter === 'all') return true;
        if (unassignedGradeFilter === 'no-grade') return !s.gradeLevel;
        return s.gradeLevel === unassignedGradeFilter;
      })
      .filter((s) => {
        if (!unassignedSearch) return true;
        const q = unassignedSearch.toLowerCase();
        return s.fullName.toLowerCase().includes(q) || s.admissionNumber.toLowerCase().includes(q);
      });
  }, [unassigned, unassignedGradeFilter, unassignedSearch]);

  const commonGradeLevel = useMemo(() => {
    if (studentsToEnroll.length === 0) return null;
    const grades = new Set(studentsToEnroll.map((s) => s.gradeLevel).filter(Boolean));
    return grades.size === 1 ? [...grades][0] : null;
  }, [studentsToEnroll]);

  const classesForEnrollment = useMemo(() => {
    const all = state.status === 'success' || state.status === 'refreshing' ? state.data : [];
    if (commonGradeLevel) {
      const filtered = all.filter((c) => c.gradeLevel === commonGradeLevel);
      return filtered.length > 0 ? filtered : all;
    }
    return all;
  }, [state, commonGradeLevel]);

  const toggleStudentSelection = (id: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectGrade = (grade: string) => {
    if (unassignedGradeFilter === grade) {
      setUnassignedGradeFilter('all');
      setSelectedStudentIds(new Set());
    } else {
      setUnassignedGradeFilter(grade);
      const gradeStudents = (unassigned ?? []).filter((s) =>
        grade === 'no-grade' ? !s.gradeLevel : s.gradeLevel === grade,
      );
      setSelectedStudentIds(new Set(gradeStudents.map((s) => s.id)));
    }
  };

  const openEditDrawer = (item?: ClassRowView) => {
    setEditing(item ?? null);
    setSection(item?.section ?? '');
    setGradeLevel(item?.gradeLevel ?? GradeLevel.KG);
    setCapacity(item?.capacity?.toString() ?? '');
    setDrawerOpen(true);
  };

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    const generatedName = section.trim() ? `${formatGrade(gradeLevel)} ${section.trim()}` : formatGrade(gradeLevel);
    const result = await vm.updateClass({
      id: editing.id,
      name: generatedName,
      gradeLevel,
      section: section || undefined,
      capacity: capacity ? Number(capacity) : undefined,
    });
    setSaving(false);
    if (result.ok) {
      setDrawerOpen(false);
      setEditing(null);
      void nemisBridge.listTeachers({ classId: editing.id, isActive: true, limit: 1 }).then((r) =>
        setTeacherCounts((prev) => ({ ...prev, [editing.id]: r.total })),
      );
    }
  };

  const openEnrollDrawer = (students: UnassignedStudent[]) => {
    setStudentsToEnroll(students);
    setEnrollClassId('');
    setEnrollOpen(true);
  };

  const currentYearId = currentYear.status === 'success' || currentYear.status === 'refreshing' ? currentYear.data.id : '';

  const submitEnroll = async () => {
    if (!enrollClassId || !currentYearId) return;
    setEnrolling(true);
    try {
      for (const student of studentsToEnroll) {
        await nemisBridge.enrollStudent({
          studentId: student.id,
          classId: enrollClassId,
          academicYearId: currentYearId,
          termId: selectedTermId,
          enrollmentDate: new Date().toISOString().slice(0, 10),
        });
      }
      setEnrollOpen(false);
      setStudentsToEnroll([]);
      setSelectedStudentIds(new Set());
      await refreshUnassigned();
      void vm.loadClasses();
    } finally {
      setEnrolling(false);
    }
  };

  useEffect(() => {
    if (currentYearId) void vm.loadTerms(currentYearId);
  }, [vm, currentYearId]);
  useEffect(() => {
    if ((terms.status === 'success' || terms.status === 'refreshing') && !selectedTermId) {
      const current = terms.data.find((t) => t.isCurrent) ?? terms.data[0];
      if (current) setSelectedTermId(current.id);
    }
  }, [terms, selectedTermId]);

  const isLoadingClasses = state.status === 'loading' || state.status === 'idle';
  const classes = state.status === 'success' || state.status === 'refreshing' ? state.data : [];
  const isLoadingUnassigned = unassigned === null;

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Class Management</h1>
        </div>
        <Link href="/government/school-admin/classes/create">
          <button className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-slate-600 border border-slate-500 rounded-button hover:bg-slate-700">
            <Plus className="w-4 h-4" />
            Create Class
          </button>
        </Link>
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Classes" value={totalClasses} icon={BookOpen} valueClassName="text-slate-600" />
          <StatCard
            label="Unassigned Students"
            value={unassigned?.length}
            icon={Users}
            valueClassName={unassigned && unassigned.length > 0 ? 'text-pending' : 'text-slate-600'}
          />
          <StatCard label="With Teachers" value={teacherCoverage?.with} icon={Users} valueClassName="text-slate-600" />
          <StatCard label="Without Teachers" value={teacherCoverage?.without} icon={Users} valueClassName="text-slate-600" />
        </div>

        <div className="border-b border-slate-200">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('classes')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'classes' ? 'border-secondary text-secondary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Classes
            </button>
            <button
              onClick={() => setActiveTab('unassigned')}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'unassigned' ? 'border-secondary text-secondary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="w-4 h-4" />
              Unassigned Students
              {!isLoadingUnassigned && (unassigned?.length ?? 0) > 0 && (
                <span className="bg-pending text-slate-100 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {unassigned?.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {activeTab === 'classes' && (
          <div className="bg-secondary/20 rounded-lg border border-slate-300 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by class name..."
                  value={filters.keyword ?? ''}
                  onChange={(e) => {
                    vm.setClassFilters({ ...filters, keyword: e.target.value });
                    void vm.loadClasses();
                  }}
                  className="pl-9 w-full px-3 py-2 rounded-full focus:outline-none border border-gray-300 focus:ring-2 focus:ring-secondary/5 focus:border-sky-500 text-sm"
                />
              </div>
              <select
                value={filters.gradeLevel ?? 'all'}
                onChange={(e) => {
                  vm.setClassFilters({ ...filters, gradeLevel: e.target.value === 'all' ? undefined : (e.target.value as GradeLevelValue) });
                  void vm.loadClasses();
                }}
                className="w-full sm:w-auto px-3 py-2 border rounded-full border-gray-300 focus:outline-none focus:ring-2 focus:ring-secondary/5 focus:border-sky-500 bg-white text-sm"
              >
                <option value="all">All Grades</option>
                {gradeLevels.map((g) => (
                  <option key={g} value={g}>
                    {formatGrade(g)}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Class Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Students</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Teachers</th>
                    <th className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {isLoadingClasses ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {[0, 1, 2, 3, 4].map((j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-5 w-24 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : classes.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-16">
                        <BookOpen className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No classes found</p>
                        <p className="text-sm text-gray-400 mt-1">
                          {filters.keyword || filters.gradeLevel ? 'Try adjusting your search or filters.' : 'Start by creating classes for your school.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    classes.map((cls) => (
                      <tr key={cls.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900">{cls.name}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                            {formatGrade(cls.gradeLevel)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <span className="font-medium">{enrolledCounts[cls.id] ?? '…'}</span>
                          {cls.capacity ? <span className="text-gray-400"> / {cls.capacity}</span> : null}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {(() => {
                            const teacherCount = teacherCounts[cls.id];
                            if (teacherCount === undefined) return <span className="text-gray-400">…</span>;
                            if (teacherCount === 0) return <span className="text-gray-400 italic">No teacher assigned</span>;
                            return (
                              <span className="text-gray-800">
                                {teacherCount} teacher{teacherCount > 1 ? 's' : ''}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={`/government/school-admin/classes/detail?id=${cls.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-full hover:bg-sky-100 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View
                            </Link>
                            <button
                              onClick={() => openEditDrawer(cls)}
                              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                              title="Edit class"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`${cls.isActive ? 'Deactivate' : 'Restore'} ${cls.name}?`)) void vm.setClassActive(cls.id, !cls.isActive);
                              }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                              title={cls.isActive ? 'Deactivate class' : 'Restore class'}
                            >
                              {cls.isActive ? <Ban className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'unassigned' && (
          <div className="bg-white border border-slate-300 rounded-lg overflow-hidden">
            {!isLoadingUnassigned && unassignedByGrade.length > 0 && (
              <div className="px-4 pt-4 pb-3 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Click a grade to filter and select all students in it
                </p>
                <div className="flex flex-wrap gap-2">
                  {unassignedByGrade.map(({ gradeLevel: g, count }) => {
                    const isActiveGrade = unassignedGradeFilter === g;
                    return (
                      <button
                        key={g}
                        onClick={() => handleSelectGrade(g)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                          isActiveGrade ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:border-sky-700 hover:text-sky-700'
                        }`}
                      >
                        {formatGrade(g)}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isActiveGrade ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedStudentIds.size > 0 && (
              <div className="px-4 py-3 bg-sky-50 border-b border-sky-200 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-sky-700">
                  {selectedStudentIds.size} student{selectedStudentIds.size !== 1 ? 's' : ''} selected
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedStudentIds(new Set());
                      setUnassignedGradeFilter('all');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                  <button
                    onClick={() => openEnrollDrawer(filteredUnassigned.filter((s) => selectedStudentIds.has(s.id)))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-slate-900 rounded-full hover:bg-slate-800"
                  >
                    <UserPlus className="w-4 h-4" />
                    Assign {selectedStudentIds.size} to a Class
                  </button>
                </div>
              </div>
            )}

            <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or admission #..."
                  value={unassignedSearch}
                  onChange={(e) => setUnassignedSearch(e.target.value)}
                  className="pl-9 w-full px-3 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-1 focus:ring-secondary/10 focus:border-sky-500 text-sm"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-secondary/20">
                  <tr>
                    <th className="px-6 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={filteredUnassigned.length > 0 && selectedStudentIds.size === filteredUnassigned.length}
                        onChange={() =>
                          setSelectedStudentIds(
                            selectedStudentIds.size === filteredUnassigned.length ? new Set() : new Set(filteredUnassigned.map((s) => s.id)),
                          )
                        }
                        className="w-4 h-4 text-sky-700 border-gray-300 rounded focus:ring-sky-500"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admission #</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grade Level</th>
                    <th className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {isLoadingUnassigned ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {[0, 1, 2, 3, 4].map((j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredUnassigned.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-16 text-center">
                        <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">
                          {(unassigned ?? []).length === 0 ? 'All students are assigned' : 'No students match your search'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredUnassigned.map((student) => (
                      <tr key={student.id} className={`hover:bg-gray-50 transition-colors ${selectedStudentIds.has(student.id) ? 'bg-blue-50' : ''}`}>
                        <td className="px-6 py-4">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(student.id)}
                            onChange={() => toggleStudentSelection(student.id)}
                            className="w-4 h-4 text-sky-700 border-gray-300 rounded focus:ring-sky-500"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">{student.fullName}</p>
                        </td>
                        <td className="px-6 py-4 text-gray-600 font-mono text-sm">{student.admissionNumber}</td>
                        <td className="px-6 py-4">
                          {student.gradeLevel ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                              {formatGrade(student.gradeLevel)}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic text-sm">Not set</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => openEnrollDrawer([student])}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-button hover:bg-slate-800"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Enroll in Class
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Edit Class Drawer */}
        <Drawer
          isOpen={drawerOpen && editing !== null}
          onClose={() => {
            setDrawerOpen(false);
            setEditing(null);
          }}
          title="Edit Class"
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="edit-class-form"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Updating…' : 'Update Class'}
              </button>
            </div>
          }
        >
          {editing && (
            <form id="edit-class-form" onSubmit={(e) => void submitEdit(e)} className="space-y-6 p-1">
              <Select
                label="Grade level"
                required
                options={Object.values(GradeLevel).map((g) => ({ value: g, label: formatGrade(g) }))}
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value as GradeLevelValue)}
              />
              <Input label="Section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g., A, B, Arts" maxLength={20} />
              <Input label="Capacity (optional)" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </form>
          )}
        </Drawer>

        {/* Assign to Class Drawer */}
        <Drawer
          isOpen={enrollOpen}
          onClose={() => {
            setEnrollOpen(false);
            setStudentsToEnroll([]);
          }}
          title={studentsToEnroll.length === 1 ? `Assign ${studentsToEnroll[0]?.fullName} to a Class` : `Assign ${studentsToEnroll.length} Students to a Class`}
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEnrollOpen(false)}
                disabled={enrolling}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={enrolling || !enrollClassId || !currentYearId || !selectedTermId}
                onClick={() => void submitEnroll()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {enrolling ? 'Assigning…' : 'Assign to Class'}
              </button>
            </div>
          }
        >
          <div className="space-y-6 p-1">
            {(!currentYearId || !selectedTermId) && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800">No active academic year or term is configured yet.</p>
              </div>
            )}
            {studentsToEnroll.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Students being assigned ({studentsToEnroll.length})</label>
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg bg-gray-50/50 divide-y divide-gray-100">
                  {studentsToEnroll.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-medium text-gray-900">{s.fullName}</span>
                      <span className="text-gray-400 font-mono text-xs">{s.admissionNumber}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Class <span className="text-red-500">*</span>
              </label>
              <select
                value={enrollClassId}
                onChange={(e) => setEnrollClassId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-sm"
              >
                <option value="">Choose a class</option>
                {classesForEnrollment.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {enrolledCounts[c.id] ?? 0}/{c.capacity ?? '∞'} enrolled
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-600">
                  {currentYear.status === 'success' || currentYear.status === 'refreshing' ? currentYear.data.code : <span className="text-amber-600">Not set</span>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
                <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-600">
                  {terms.status === 'success' || terms.status === 'refreshing' ? terms.data.find((t) => t.id === selectedTermId)?.name ?? 'Select a term' : <span className="text-amber-600">Not set</span>}
                </div>
              </div>
            </div>
          </div>
        </Drawer>
      </div>
    </div>
  );
}
