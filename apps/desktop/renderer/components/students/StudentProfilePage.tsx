'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { EnrollmentStatus } from '@nemis-desktop/types';
import {
  Avatar,
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
  useStudentProfileViewModel,
} from '@/lib/presentation/hooks';
import { human, Page, queryId } from './shared';

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
      <div className="bg-white border border-slate-300 rounded-card p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <Avatar
            firstName={d.fullName.split(' ')[0]}
            lastName={d.fullName.split(' ').slice(1).join(' ')}
            role="student"
            size="xl"
          />
          <div className="flex-1 text-center sm:text-left">
            <h1 className="text-2xl font-bold text-gray-900">{d.fullName}</h1>
            <p className="text-gray-500 text-sm mt-1">
              Admission No: <span className="font-mono font-medium text-gray-700">{d.admissionNumber}</span>
            </p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
              <Badge variant={d.status.label === 'Active' ? 'success' : 'neutral'} size="sm">
                {d.status.label}
              </Badge>
              <Badge variant="neutral" size="sm">{d.gender}</Badge>
              {d.gradeLevel && <Badge variant="neutral" size="sm">{d.gradeLevel}</Badge>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-300 rounded-card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Personal Information</h2>
          <div className="space-y-4">
            <DetailRow label="Grade" value={d.gradeLevel} />
            <DetailRow label="Date of birth" value={d.dateOfBirth} />
          </div>
        </section>
        <section className="bg-white border border-slate-300 rounded-card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Contact Information</h2>
          <div className="space-y-4">
            <DetailRow label="Phone" value={d.phoneNumber ?? '—'} />
            <DetailRow label="Email" value={d.email ?? '—'} />
            <DetailRow label="Address" value={d.address ?? '—'} />
          </div>
        </section>
      </div>

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
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-gray-900">{value}</p>
    </div>
  );
}
