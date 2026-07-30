'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, GraduationCap, Mail, MapPin, Phone, User, Users } from 'lucide-react';
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
  useSettingsViewModel,
  useStudentProfileViewModel,
} from '@/lib/presentation/hooks/school-admin';
import { human, queryId } from './shared';

function DetailRow({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && <div className="mt-0.5 text-gray-400 flex-shrink-0">{icon}</div>}
      <div>
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-sm text-gray-900 mt-0.5">
          {value || <span className="text-gray-400 italic">Not provided</span>}
        </p>
      </div>
    </div>
  );
}

export function StudentProfilePage() {
  const vm = useStudentProfileViewModel();
  const enrollmentVm = useEnrollmentViewModel();
  const foundation = useAcademicFoundationViewModel();
  const settings = useSettingsViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);
  const schoolName =
    profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';
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
      <div className="p-6 space-y-5">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (details.status === 'error')
    return (
      <div className="p-6 space-y-5">
        <ErrorState message={details.error.userMessage} />
      </div>
    );
  if (details.status === 'empty')
    return (
      <div className="p-6 space-y-5">
        <EmptyState title="Student not found." />
      </div>
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
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Student Profile</h1>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-300">{schoolName}</p>
        </div>
      </div>
      <div className="px-6 py-6 space-y-5">
        <Link
          href="/government/school-admin/students"
          className="flex items-center text-gray-600 font-bold hover:text-gray-900 transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to Students
        </Link>

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
          <div className="flex flex-wrap justify-center sm:justify-end gap-2 sm:ml-auto">
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-300 rounded-card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-sky-700" />
            Personal Information
          </h2>
          <div className="space-y-4">
            <DetailRow icon={<GraduationCap className="w-4 h-4" />} label="Grade" value={d.gradeLevel} />
            <DetailRow icon={<Calendar className="w-4 h-4" />} label="Date of birth" value={d.dateOfBirth} />
          </div>
        </section>
        <section className="bg-white border border-slate-300 rounded-card p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Phone className="w-4 h-4 text-sky-700" />
            Contact Information
          </h2>
          <div className="space-y-4">
            <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone" value={d.phoneNumber} />
            <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={d.email} />
            <DetailRow icon={<MapPin className="w-4 h-4" />} label="Address" value={d.address} />
          </div>
        </section>
      </div>

      <section className="bg-white border border-slate-300 rounded-card p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-700" />
            Guardians
          </h2>
          <Button size="sm" onClick={() => setGuardianOpen(true)}>
            Add
          </Button>
        </div>
        {d.guardians.length === 0 ? (
          <p className="text-sm text-slate-500">No guardians assigned.</p>
        ) : (
          d.guardians.map((g) => (
            <p className="text-sm mt-3" key={g.id}>
              Guardian record {g.guardianId.slice(0, 8)}{' '}
              {g.isPrimary && <Badge size="sm">Primary</Badge>}
            </p>
          ))
        )}
      </section>
      <section className="bg-white border border-slate-300 rounded-card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-sky-700" />
          Enrollment History
        </h2>
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
      </div>
    </div>
  );
}
