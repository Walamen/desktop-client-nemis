'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import {
  EnrollmentStatus,
  Gender,
  GradeLevel,
  type EnrollmentStatus as EnrollmentStatusValue,
  type Gender as GenderValue,
  type GradeLevel as GradeLevelValue,
} from '@nemis-desktop/types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Select,
  Skeleton,
} from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useAcademicFoundationViewModel,
  useEnrollmentViewModel,
  useSettingsViewModel,
  useStudentProfileViewModel,
  useStudentSearchViewModel,
  useStudentsListViewModel,
} from '@/lib/presentation/hooks';

const grades = Object.values(GradeLevel);
const genders = Object.values(Gender);
const human = (v: string) => v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const queryId = () =>
  typeof window === 'undefined'
    ? ''
    : (new URLSearchParams(window.location.search).get('id') ?? '');
function Page({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-6 space-y-5">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-slate-500">Offline student records stored on this device.</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

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

export function StudentFormPage({ edit = false }: { edit?: boolean }) {
  const listVm = useStudentsListViewModel();
  const profileVm = useStudentProfileViewModel();
  const settings = useSettingsViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);
  const details = useViewModel(profileVm.store, (s) => s.details);
  const [id, setId] = useState('');
  const [firstName, setFirst] = useState('');
  const [middleName, setMiddle] = useState('');
  const [lastName, setLast] = useState('');
  const [number, setNumber] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<GenderValue>(Gender.FEMALE);
  const [grade, setGrade] = useState<GradeLevelValue | ''>('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  useEffect(() => {
    void settings.loadCurrentSchool();
    const value = queryId();
    setId(value);
    if (edit && value) void profileVm.loadDetails(value);
  }, [settings, profileVm, edit]);
  useEffect(() => {
    if (edit && (details.status === 'success' || details.status === 'refreshing')) {
      const d = details.data;
      setFirst(d.firstName);
      setMiddle(d.middleName ?? '');
      setLast(d.lastName);
      setNumber(d.admissionNumber);
      setDob(d.rawDateOfBirth.slice(0, 10));
      setGender(d.rawGender as GenderValue);
      setGrade((d.rawGradeLevel ?? '') as GradeLevelValue | '');
      setPhone(d.phoneNumber ?? '');
      setEmail(d.email ?? '');
      setAddress(d.address ?? '');
    }
  }, [details, edit]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (edit) {
      const r = await profileVm.updateStudent({
        studentId: id,
        firstName,
        middleName: middleName || undefined,
        lastName,
        dateOfBirth: dob,
        gender,
        gradeLevel: grade || undefined,
        phoneNumber: phone || undefined,
        email: email || undefined,
        address: address || undefined,
      });
      if (r.ok) window.location.href = `/government/school-admin/students/profile?id=${id}`;
    } else if (profile.status === 'success' || profile.status === 'refreshing') {
      const r = await listVm.createStudent({
        institutionId: profile.data.id,
        firstName,
        middleName: middleName || undefined,
        lastName,
        admissionNumber: number,
        dateOfBirth: dob,
        gender,
        gradeLevel: grade || undefined,
        phoneNumber: phone || undefined,
        email: email || undefined,
        address: address || undefined,
      });
      if (r.ok) window.location.href = `/government/school-admin/students/profile?id=${r.data.id}`;
    }
  };
  return (
    <Page title={edit ? 'Edit Student' : 'Create Student'}>
      <form
        onSubmit={(e) => void submit(e)}
        className="bg-white border rounded-card p-6 space-y-4 max-w-3xl"
      >
        <div className="grid sm:grid-cols-3 gap-3">
          <Input
            label="First name"
            required
            value={firstName}
            onChange={(e) => setFirst(e.target.value)}
          />
          <Input
            label="Middle name"
            value={middleName}
            onChange={(e) => setMiddle(e.target.value)}
          />
          <Input
            label="Last name"
            required
            value={lastName}
            onChange={(e) => setLast(e.target.value)}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input
            label="Student number"
            required
            disabled={edit}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <Input
            label="Date of birth"
            type="date"
            required
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
          <Select
            label="Gender"
            required
            options={genders.map((v) => ({ value: v, label: human(v) }))}
            value={gender}
            onChange={(e) => setGender(e.target.value as GenderValue)}
          />
          <Select
            label="Grade"
            options={grades.map((v) => ({ value: v, label: human(v) }))}
            placeholder="Select grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value as GradeLevelValue)}
          />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        {profile.status === 'empty' && !edit && (
          <p className="text-sm text-red-700">
            A school profile must be provisioned before students can be created.
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit">{edit ? 'Save changes' : 'Create student'}</Button>
          <Link href="/government/school-admin/students">
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </Page>
  );
}

export function StudentProfilePage() {
  const vm = useStudentProfileViewModel();
  const enrollmentVm = useEnrollmentViewModel();
  const foundation = useAcademicFoundationViewModel();
  const details = useViewModel(vm.store, (s) => s.details);
  const enrollments = useViewModel(vm.store, (s) => s.enrollments);
  const classes = useViewModel(foundation.store, (s) => s.classes);
  const [id, setId] = useState('');
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [gFirst, setGFirst] = useState('');
  const [gLast, setGLast] = useState('');
  const [relationship, setRelationship] = useState('');
  const [phone, setPhone] = useState('');
  const [primary, setPrimary] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movingEnrollmentId, setMovingEnrollmentId] = useState('');
  const [movingClassId, setMovingClassId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  useEffect(() => {
    const value = queryId();
    setId(value);
    if (value) {
      void vm.loadDetails(value);
      void vm.loadEnrollments(value);
    }
  }, [vm]);
  if (details.status === 'loading' || details.status === 'idle')
    return (
      <Page title="Student Profile">
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  if (details.status === 'error')
    return (
      <Page title="Student Profile">
        <ErrorState message={details.error.userMessage} />
      </Page>
    );
  if (details.status === 'empty')
    return (
      <Page title="Student Profile">
        <EmptyState title="Student not found." />
      </Page>
    );
  const d = details.data;
  const addGuardian = async (e: FormEvent) => {
    e.preventDefault();
    const r = await vm.createGuardian({
      studentId: id,
      firstName: gFirst,
      lastName: gLast,
      relationship,
      phoneNumber: phone,
      isPrimary: primary,
    });
    if (r.ok) setGuardianOpen(false);
  };
  const beginMove = (enrollmentId: string, academicYearId: string, classId: string) => {
    setMovingEnrollmentId(enrollmentId);
    setMovingClassId(classId);
    setTargetClassId('');
    foundation.setClassFilters({ academicYearId });
    void foundation.loadClasses();
    setMoveOpen(true);
  };
  const moveClass = async (e: FormEvent) => {
    e.preventDefault();
    const result = await enrollmentVm.moveEnrollmentClass(
      { enrollmentId: movingEnrollmentId, targetClassId },
      id,
    );
    if (result.ok) setMoveOpen(false);
  };
  return (
    <Page
      title={d.fullName}
      action={
        <div className="flex gap-2">
          <Link href={`/government/school-admin/students/edit?id=${id}`}>
            <Button variant="secondary">Edit</Button>
          </Link>
          <Link href={`/government/school-admin/students/enroll?id=${id}`}>
            <Button>Enroll</Button>
          </Link>
          <Button
            variant={d.status.label === 'Active' ? 'destructive' : 'secondary'}
            onClick={() =>
              void vm.setStudentActive({ studentId: id, isActive: d.status.label !== 'Active' })
            }
          >
            {d.status.label === 'Active' ? 'Archive' : 'Restore'}
          </Button>
        </div>
      }
    >
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white border rounded-card p-6 grid sm:grid-cols-2 gap-4">
          <Fact label="Student number" value={d.admissionNumber} />
          <Fact label="Date of birth" value={d.dateOfBirth} />
          <Fact label="Gender" value={d.gender} />
          <Fact label="Grade" value={d.gradeLevel} />
          <Fact label="Phone" value={d.phoneNumber ?? '—'} />
          <Fact label="Email" value={d.email ?? '—'} />
          <Fact label="Address" value={d.address ?? '—'} />
          <Fact label="Status" value={d.status.label} />
        </section>
        <section className="bg-white border rounded-card p-6">
          <div className="flex justify-between">
            <h2 className="font-semibold">Guardians</h2>
            <Button size="sm" onClick={() => setGuardianOpen(true)}>
              Add
            </Button>
          </div>
          {d.guardians.length === 0 ? (
            <p className="text-sm text-slate-500 mt-4">No guardians assigned.</p>
          ) : (
            d.guardians.map((g) => (
              <p className="text-sm mt-3" key={g.id}>
                Guardian record {g.guardianId.slice(0, 8)}{' '}
                {g.isPrimary && <Badge size="sm">Primary</Badge>}
              </p>
            ))
          )}
        </section>
      </div>
      <section className="bg-white border rounded-card p-6">
        <h2 className="font-semibold mb-3">Enrollment History</h2>
        {enrollments.status === 'empty' ? (
          <p className="text-sm text-slate-500">No enrollment history available.</p>
        ) : enrollments.status === 'success' || enrollments.status === 'refreshing' ? (
          enrollments.data.map((e) => (
            <div className="grid sm:grid-cols-5 gap-2 text-sm border-b py-2" key={e.id}>
              <span>{e.enrollmentDate.slice(0, 10)}</span>
              <span>Class {e.classId.slice(0, 8)}</span>
              <span>{e.status}</span>
              <span>Term {e.termId.slice(0, 8)}</span>
              {e.status === EnrollmentStatus.ACTIVE ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => beginMove(e.id, e.academicYearId, e.classId)}
                >
                  Move class
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
      </section>
      <div className="grid sm:grid-cols-2 gap-4">
        <EmptyState
          title="Student Documents"
          description="Document storage will be added in a future phase."
        />
        <EmptyState
          title="Student Activity"
          description="Timeline events will appear when synchronization is available."
        />
      </div>
      <Modal
        isOpen={guardianOpen}
        onClose={() => setGuardianOpen(false)}
        title="Add Guardian"
        footer={
          <Button form="guardian-form" type="submit">
            Save guardian
          </Button>
        }
      >
        <form id="guardian-form" onSubmit={(e) => void addGuardian(e)} className="space-y-3">
          <Input
            label="First name"
            required
            value={gFirst}
            onChange={(e) => setGFirst(e.target.value)}
          />
          <Input
            label="Last name"
            required
            value={gLast}
            onChange={(e) => setGLast(e.target.value)}
          />
          <Input
            label="Relationship"
            required
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
          <Input
            label="Phone number"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={primary}
              onChange={(e) => setPrimary(e.target.checked)}
            />{' '}
            Primary guardian
          </label>
        </form>
      </Modal>
      <Modal
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="Move Student to Another Class"
        footer={
          <Button form="move-class-form" type="submit" disabled={!targetClassId}>
            Move student
          </Button>
        }
      >
        <form id="move-class-form" onSubmit={(e) => void moveClass(e)}>
          <Select
            label="Target class"
            required
            value={targetClassId}
            onChange={(e) => setTargetClassId(e.target.value)}
            options={
              classes.status === 'success' || classes.status === 'refreshing'
                ? classes.data
                    .filter(
                      (schoolClass) =>
                        schoolClass.isActive &&
                        schoolClass.id !== movingClassId &&
                        schoolClass.gradeLevel === d.rawGradeLevel,
                    )
                    .map((schoolClass) => ({
                      value: schoolClass.id,
                      label: `${schoolClass.name} — ${human(schoolClass.gradeLevel)}`,
                    }))
                : []
            }
          />
        </form>
      </Modal>
    </Page>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

export function EnrollmentPage() {
  const students = useEnrollmentViewModel();
  const foundation = useAcademicFoundationViewModel();
  const years = useViewModel(foundation.store, (s) => s.academicYears);
  const terms = useViewModel(foundation.store, (s) => s.terms);
  const classes = useViewModel(foundation.store, (s) => s.classes);
  const [id, setId] = useState('');
  const [year, setYear] = useState('');
  const [term, setTerm] = useState('');
  const [clazz, setClazz] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  useEffect(() => {
    setId(queryId());
    void foundation.loadAcademicYears();
  }, [foundation]);
  useEffect(() => {
    if ((years.status === 'success' || years.status === 'refreshing') && !year) {
      const y = years.data.find((v) => v.isCurrent);
      if (y) setYear(y.id);
    }
  }, [years, year]);
  useEffect(() => {
    if (year) {
      void foundation.loadTerms(year);
      foundation.setClassFilters({ academicYearId: year });
      void foundation.loadClasses();
    }
  }, [foundation, year]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await students.enrollStudent({
      studentId: id,
      academicYearId: year,
      termId: term,
      classId: clazz,
      enrollmentDate: date,
    });
    if (r.ok) window.location.href = `/government/school-admin/students/profile?id=${id}`;
  };
  const yearOptions =
    years.status === 'success' || years.status === 'refreshing'
      ? years.data.map((v) => ({ value: v.id, label: v.code }))
      : [];
  const termOptions =
    terms.status === 'success' || terms.status === 'refreshing'
      ? terms.data.map((v) => ({ value: v.id, label: v.name }))
      : [];
  const classOptions =
    classes.status === 'success' || classes.status === 'refreshing'
      ? classes.data
          .filter((v) => v.isActive)
          .map((v) => ({ value: v.id, label: `${v.name} — ${human(v.gradeLevel)}` }))
      : [];
  return (
    <Page title="Enrollment Wizard">
      <form
        onSubmit={(e) => void submit(e)}
        className="bg-white border rounded-card p-6 max-w-2xl space-y-4"
      >
        <p className="text-sm text-slate-500">
          Assign the student to the current academic structure.
        </p>
        <Select
          label="Academic year"
          required
          options={yearOptions}
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
        <Select
          label="Term"
          required
          options={termOptions}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Select term"
        />
        <Select
          label="Class / section"
          required
          options={classOptions}
          value={clazz}
          onChange={(e) => setClazz(e.target.value)}
          placeholder="Select class"
        />
        <Input
          label="Enrollment date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button type="submit">Complete enrollment</Button>
      </form>
    </Page>
  );
}
