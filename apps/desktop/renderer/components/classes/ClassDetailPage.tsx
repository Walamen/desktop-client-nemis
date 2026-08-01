'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { StudentListItemResult } from '@nemis-desktop/types';
import { GradeLevel, type GradeLevel as GradeLevelValue } from '@nemis-desktop/types';
import { Drawer, EmptyState, ErrorState, Select, Skeleton } from '@nemis-desktop/ui';
import { ArrowLeft, Users, BookOpen, UserCheck, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { schoolAdminBridge } from '@/services/nemis-bridge/school-admin';
import { fetchAllPages, formatGrade, getClassTeacherRoster, queryId, type TeacherOnClass } from './shared';

type Tab = 'students' | 'subjects' | 'settings';

function StatChip({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg">
      <div>
        <p className="text-lg font-bold text-white leading-none">{value}</p>
        <p className="text-xs text-slate-300 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

/** Class detail — mirrors portal-web's Students / Subjects & Teachers /
 * Settings tabs. The Teachers card is real: it's built from a class-scoped
 * teacher query plus each of those (few) teachers' own assignment list
 * filtered to this class, since no bulk "assignments by class" query exists.
 * Assigning a teacher to a specific subject-in-class isn't wired up here —
 * that flow belongs to the Teachers module's "Assign Teaching" action. */
export function ClassDetailPage() {
  const vm = useAcademicFoundationViewModel();
  const classSubjects = useViewModel(vm.store, (s) => s.classSubjects);
  const subjects = useViewModel(vm.store, (s) => s.subjects);

  const [id, setId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('students');
  const [cls, setCls] = useState<{ id: string; name: string; gradeLevel: GradeLevelValue; section?: string; capacity?: number; isActive: boolean } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [students, setStudents] = useState<readonly StudentListItemResult[] | null>(null);
  const [teachers, setTeachers] = useState<TeacherOnClass[] | null>(null);

  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [subjectToAdd, setSubjectToAdd] = useState('');
  const [addingSubject, setAddingSubject] = useState(false);

  const [section, setSection] = useState('');
  const [gradeLevel, setGradeLevel] = useState<GradeLevelValue>(GradeLevel.KG);
  const [capacity, setCapacity] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const value = queryId();
    setId(value);
    if (value) void loadClass(value);
    void vm.loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadClass(classId: string) {
    setLoadError(null);
    const allClasses = await fetchAllPages((limit, offset) =>
      schoolAdminBridge.listClasses({ limit, offset, includeInactive: true }),
    );
    const found = allClasses.find((c) => c.id === classId);
    if (!found) {
      setLoadError('Class not found.');
      return;
    }
    setCls(found);
    setSection(found.section ?? '');
    setGradeLevel(found.gradeLevel);
    setCapacity(found.capacity?.toString() ?? '');
    void vm.loadClassSubjects(classId);
    void refreshStudents(classId);
    void refreshTeachers(classId);
  }

  async function refreshStudents(classId: string) {
    const items = await fetchAllPages((limit, offset) =>
      schoolAdminBridge.listStudents({ classId, enrollmentStatus: 'ACTIVE', limit, offset }),
    );
    setStudents(items);
  }

  async function refreshTeachers(classId: string) {
    setTeachers(await getClassTeacherRoster(classId));
  }

  const availableSubjectsForClass =
    (subjects.status === 'success' || subjects.status === 'refreshing') && (classSubjects.status === 'success' || classSubjects.status === 'refreshing')
      ? subjects.data.filter((s) => s.isActive && !classSubjects.data.some((link) => link.subjectId === s.id))
      : [];

  const handleAddSubject = async () => {
    if (!subjectToAdd || !id) return;
    setAddingSubject(true);
    const result = await vm.assignSubject(id, subjectToAdd);
    setAddingSubject(false);
    if (result.ok) {
      setIsAddSubjectOpen(false);
      setSubjectToAdd('');
    }
  };

  const handleRemoveSubject = async (subjectId: string) => {
    if (!id) return;
    await vm.unassignSubject(id, subjectId);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!cls) return;
    setSaving(true);
    const generatedName = section.trim() ? `${formatGrade(gradeLevel)} ${section.trim()}` : formatGrade(gradeLevel);
    const result = await vm.updateClass({ id: cls.id, name: generatedName, gradeLevel, section: section || undefined, capacity: capacity ? Number(capacity) : undefined });
    setSaving(false);
    if (result.ok) setCls({ ...cls, name: generatedName, gradeLevel, section: section || undefined, capacity: capacity ? Number(capacity) : undefined });
  };

  const handleDeactivate = async () => {
    if (!cls) return;
    await vm.setClassActive(cls.id, !cls.isActive);
    setCls({ ...cls, isActive: !cls.isActive });
    setShowDeleteConfirm(false);
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 px-6 py-5">
        <Link href="/government/school-admin/classes" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-3 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Class Management
        </Link>
        {children}
      </div>
    </div>
  );

  if (loadError)
    return (
      <Shell>
        <ErrorState message={loadError} />
      </Shell>
    );
  if (!cls)
    return (
      <Shell>
        <Skeleton className="h-24 w-full" />
      </Shell>
    );

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 px-6 py-5">
        <Link href="/government/school-admin/classes" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 mb-3 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          Class Management
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{cls.name}</h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-slate-700 text-slate-200 rounded">{formatGrade(cls.gradeLevel)}</span>
              {!cls.isActive && <span className="px-2 py-0.5 text-xs font-semibold bg-red-900/50 text-red-200 rounded">Deactivated</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <StatChip label="Students" value={students === null ? '…' : students.length} />
            <StatChip label="Subjects" value={classSubjects.status === 'success' || classSubjects.status === 'refreshing' ? classSubjects.data.length : '…'} />
            <StatChip label="Teachers" value={teachers === null ? '…' : teachers.length} />
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="border-b border-slate-200">
          <nav className="flex">
            {(
              [
                { key: 'students' as Tab, label: 'Students', icon: <Users className="w-4 h-4" /> },
                { key: 'subjects' as Tab, label: 'Subjects & Teachers', icon: <BookOpen className="w-4 h-4" /> },
                { key: 'settings' as Tab, label: 'Settings', icon: null },
              ]
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === tab.key ? 'border-sky-700 text-sky-700' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'students' && (
          <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
            <div className="bg-secondary/20 px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-600">Enrolled Students</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {students?.length ?? 0} active enrollment{students?.length !== 1 ? 's' : ''}
                {cls.capacity ? ` · capacity ${cls.capacity}` : ''}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-8">#</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Admission #</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Gender</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {students === null ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        {[0, 1, 2, 3].map((j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-16 text-center">
                        <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-gray-500 font-medium">No students enrolled</p>
                        <p className="text-xs text-gray-400 mt-1">Assign students from the Unassigned Students tab.</p>
                      </td>
                    </tr>
                  ) : (
                    students.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-xs text-gray-400">{idx + 1}</td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-gray-900">{s.fullName}</p>
                        </td>
                        <td className="px-6 py-4 font-mono text-sm text-gray-600">{s.admissionNumber}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 capitalize">{s.gender?.toLowerCase() ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'subjects' && (
          <>
            <div className="flex items-start gap-3 p-4 border border-amber-200 rounded-lg bg-amber-50">
              <AlertTriangle className="w-6 h-6 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-800">Assign subjects to this class, then assign teachers from the Teachers module</p>
                <p className="text-xs font-semibold text-amber-700 mt-0.5">
                  Use a teacher&apos;s profile page ({'"'}Assign Teaching{'"'}) to link them to a subject in this class. The roster below reflects those assignments.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Subjects</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {classSubjects.status === 'success' || classSubjects.status === 'refreshing' ? classSubjects.data.length : 0} assigned
                    </p>
                  </div>
                  <button
                    onClick={() => setIsAddSubjectOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Subject
                  </button>
                </div>
                {classSubjects.status === 'loading' || classSubjects.status === 'idle' ? (
                  <div className="p-6">
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : classSubjects.status === 'empty' ? (
                  <EmptyState icon={<BookOpen className="w-8 h-8 text-gray-200" />} title="No subjects assigned yet" description="Add subjects to build this class's curriculum." />
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {(classSubjects.status === 'success' || classSubjects.status === 'refreshing' ? classSubjects.data : []).map((subject) => (
                      <li key={subject.subjectId} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 text-sm">{subject.subjectName}</p>
                              <span className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-600 rounded font-mono">{subject.subjectCode}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => void handleRemoveSubject(subject.subjectId)}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                            title="Remove subject"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-gray-900">Teachers</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{teachers?.length ?? 0} assigned</p>
                </div>
                {teachers === null ? (
                  <div className="p-6">
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : teachers.length === 0 ? (
                  <EmptyState icon={<UserCheck className="w-8 h-8 text-gray-200" />} title="No teachers assigned yet" />
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {teachers.map((t) => (
                      <li key={t.teacherId} className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 text-sm">
                            {t.firstName} {t.lastName}
                          </p>
                          {t.isClassTeacher && <span className="px-1.5 py-0.5 text-xs font-semibold bg-amber-50 text-amber-700 rounded">Homeroom</span>}
                        </div>
                        {t.subjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {t.subjects.map((s) => (
                              <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 rounded">
                                {s}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5 italic">No subjects assigned</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-5 max-w-xl">
            <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-gray-900">Class Details</h2>
              </div>
              <form onSubmit={(e) => void handleUpdate(e)} className="px-6 py-5 space-y-4">
                <Select
                  label="Grade level"
                  required
                  options={Object.values(GradeLevel).map((g) => ({ value: g, label: formatGrade(g) }))}
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value as GradeLevelValue)}
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                  <input
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                    placeholder="e.g., A, B, Arts"
                    maxLength={20}
                    className="w-full px-3 py-2 border border-gray-300 rounded-button focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Capacity <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-button focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 text-sm"
                  />
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-lg border border-red-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-red-100">
                <h2 className="text-sm font-semibold text-red-600">Danger Zone</h2>
              </div>
              <div className="px-6 py-5">
                {!showDeleteConfirm ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{cls.isActive ? 'Deactivate this class' : 'Restore this class'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {cls.isActive
                          ? "There's no hard delete on this device — deactivating hides the class from active lists while keeping its history."
                          : 'Restoring makes this class active again.'}
                      </p>
                    </div>
                    <button
                      onClick={() => (cls.isActive ? setShowDeleteConfirm(true) : void handleDeactivate())}
                      className="shrink-0 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      {cls.isActive ? 'Deactivate Class' : 'Restore Class'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-700">
                        Are you sure? <span className="font-semibold">{cls.name}</span> will be hidden from active class lists.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                        Cancel
                      </button>
                      <button
                        onClick={() => void handleDeactivate()}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                      >
                        Yes, Deactivate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <Drawer
          isOpen={isAddSubjectOpen}
          onClose={() => {
            setIsAddSubjectOpen(false);
            setSubjectToAdd('');
          }}
          title="Add Subject"
          size="md"
          footer={
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsAddSubjectOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={addingSubject || !subjectToAdd}
                onClick={() => void handleAddSubject()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {addingSubject ? 'Adding…' : 'Add Subject'}
              </button>
            </div>
          }
        >
          <div className="space-y-4 p-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject <span className="text-red-500">*</span>
            </label>
            {availableSubjectsForClass.length === 0 ? (
              <p className="text-sm text-gray-400 italic">All available subjects are already assigned.</p>
            ) : (
              <select
                value={subjectToAdd}
                onChange={(e) => setSubjectToAdd(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-sm"
              >
                <option value="">Select a subject…</option>
                {availableSubjectsForClass.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            )}
          </div>
        </Drawer>
      </div>
    </div>
  );
}
