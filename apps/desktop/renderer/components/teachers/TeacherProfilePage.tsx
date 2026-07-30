'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Avatar, Button, EmptyState, ErrorState, Modal, Select, Skeleton } from '@nemis-desktop/ui';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  ClipboardList,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useAcademicFoundationViewModel,
  useTeacherProfileViewModel,
  useTeachingAssignmentViewModel,
} from '@/lib/presentation/hooks/school-admin';
import { human, queryId, rows } from './shared';

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
      {icon && <div className="w-4 h-4 mt-0.5 text-slate-400 shrink-0">{icon}</div>}
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-0.5 text-slate-800">
          {value || <span className="text-gray-400 italic">Not provided</span>}
        </p>
      </div>
    </div>
  );
}

/** Teacher profile — mirrors the Students profile page pattern (dark header
 * band, back link, Contact/Employment cards with icons, assignments table,
 * honest empty-state placeholders for phases not yet built). */
export function TeacherProfilePage() {
  const profileVm = useTeacherProfileViewModel();
  const assignVm = useTeachingAssignmentViewModel();
  const foundation = useAcademicFoundationViewModel();
  const state = useViewModel(profileVm.store, (s) => s.profile);
  const assignments = useViewModel(assignVm.store, (s) => s.assignments);
  const classes = useViewModel(foundation.store, (s) => s.classes);
  const subjects = useViewModel(foundation.store, (s) => s.subjects);

  const [id, setId] = useState('');
  const [open, setOpen] = useState(false);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [homeroom, setHomeroom] = useState(false);

  useEffect(() => {
    const value = queryId();
    setId(value);
    if (value) {
      void profileVm.loadProfile(value);
      void assignVm.load(value);
    }
    void foundation.loadClasses();
    void foundation.loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
        <h1 className="text-xl font-bold mt-0.5">Teacher Profile</h1>
      </div>
      <div className="px-6 py-6 space-y-5">
        <Link
          href="/government/school-admin/teachers-staff"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Teachers
        </Link>
        {children}
      </div>
    </div>
  );

  if (state.status === 'loading' || state.status === 'idle')
    return (
      <Shell>
        <Skeleton className="h-64 w-full" />
      </Shell>
    );
  if (state.status === 'error')
    return (
      <Shell>
        <ErrorState message={state.error.userMessage} />
      </Shell>
    );
  if (state.status === 'empty')
    return (
      <Shell>
        <EmptyState title="Teacher not found." />
      </Shell>
    );

  const d = state.data;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await assignVm.assign({ teacherId: id, classId, subjectId, isClassTeacher: homeroom });
    if (r.ok) {
      setOpen(false);
      setClassId('');
      setSubjectId('');
    }
  };

  return (
    <Shell>
      {/* Header card */}
      <div className="bg-white border border-slate-300 rounded-lg p-6 flex flex-col md:flex-row md:items-center gap-5 justify-between">
        <div className="flex items-center gap-4">
          <Avatar src={d.photoUrl} firstName={d.firstName} lastName={d.lastName} role="teacher" size="lg" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{d.fullName}</h2>
            <p className="text-sm text-slate-500">
              {human(d.position)} · {d.employeeNumber}
            </p>
            <span
              className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded ${
                d.isActive ? 'bg-active/10 text-active' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {d.isActive ? 'Active' : 'Archived'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/government/school-admin/teachers-staff/edit?id=${id}`}>
            <button className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-button hover:bg-slate-50">
              Edit
            </button>
          </Link>
          <Button onClick={() => setOpen(true)} disabled={!d.isActive}>
            Assign Teaching
          </Button>
          <button
            onClick={() => void profileVm.setActive(id, !d.isActive)}
            className={`px-4 py-2 text-sm font-medium rounded-button border ${
              d.isActive
                ? 'text-error border-error/30 hover:bg-error/10'
                : 'text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {d.isActive ? 'Archive' : 'Restore'}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-white border border-slate-300 rounded-lg p-6 space-y-5">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-3">
              <Briefcase className="w-4 h-4 text-secondary" />
              Employment
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <DetailRow icon={<Briefcase className="w-4 h-4" />} label="Position" value={human(d.position)} />
              <DetailRow icon={<ClipboardList className="w-4 h-4" />} label="Employment Type" value={human(d.employmentType)} />
              <DetailRow icon={<Calendar className="w-4 h-4" />} label="Date Joined" value={d.dateOfJoining.slice(0, 10)} />
            </div>
          </div>
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-slate-800 mb-3">
              <Phone className="w-4 h-4 text-secondary" />
              Contact Information
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <DetailRow icon={<Phone className="w-4 h-4" />} label="Phone" value={d.phoneNumber} />
              <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={d.email} />
              <DetailRow icon={<MapPin className="w-4 h-4" />} label="Address" value={d.address} />
            </div>
          </div>
        </section>
        <section className="bg-white border border-slate-300 rounded-lg p-6">
          <h2 className="font-semibold text-slate-800">Teacher Summary</h2>
          <p className="text-sm mt-3 text-slate-600">{rows(assignments).length} active assignment(s)</p>
          <p className="text-sm mt-2 text-slate-600">Approval: {human(d.approvalStatus)}</p>
          <p className="text-sm mt-2 text-slate-600">
            Qualifications: {typeof d.qualifications?.summary === 'string' ? d.qualifications.summary : 'Not recorded'}
          </p>
        </section>
      </div>

      <section className="bg-white border border-slate-300 rounded-lg p-6">
        <h2 className="font-semibold text-slate-800 mb-3">Teaching Assignments</h2>
        {assignments.status === 'empty' ? (
          <p className="text-sm text-slate-500">No teaching assignments.</p>
        ) : assignments.status === 'success' || assignments.status === 'refreshing' ? (
          <div className="space-y-2">
            {assignments.data.map((a) => (
              <div
                key={a.id}
                className="grid md:grid-cols-6 gap-2 items-center border-b border-slate-100 py-3 text-sm"
              >
                <span>{a.academicYearName}</span>
                <span>{human(a.gradeLevel)}</span>
                <span>
                  {a.className}
                  {a.section ? ` — ${a.section}` : ''}
                </span>
                <span>{a.subjectName ?? 'Homeroom'}</span>
                <span>{a.isClassTeacher ? 'Class teacher' : 'Subject teacher'}</span>
                <button
                  onClick={() => void assignVm.remove(a.id, id)}
                  className="text-xs font-medium text-error hover:underline text-left"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Skeleton className="h-20 w-full" />
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <EmptyState
          title="Assignment History"
          description="Historical assignment snapshots will appear when the backend exposes an assignment-history model."
        />
        <EmptyState title="Teacher Documents" description="Document storage is reserved for a future phase." />
        <EmptyState
          title="Teacher Activity Timeline"
          description="Synchronized activity events will appear here in a future phase."
        />
        <EmptyState title="Payroll" description="Payroll is outside this phase." />
      </div>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Assign Teacher"
        footer={
          <Button form="assignment-form" type="submit" disabled={!classId || !subjectId}>
            Save assignment
          </Button>
        }
      >
        <form id="assignment-form" onSubmit={(e) => void submit(e)} className="space-y-3">
          <Select
            label="Class / section"
            required
            placeholder="Select class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={rows(classes)
              .filter((v) => v.isActive)
              .map((v) => ({ value: v.id, label: `${v.name} — ${human(v.gradeLevel)}` }))}
          />
          <Select
            label="Subject"
            required
            placeholder="Select subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            options={rows(subjects)
              .filter((v) => v.isActive)
              .map((v) => ({ value: v.id, label: v.name }))}
          />
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={homeroom} onChange={(e) => setHomeroom(e.target.checked)} />
            Make this teacher the homeroom / class teacher
          </label>
        </form>
      </Modal>
    </Shell>
  );
}
