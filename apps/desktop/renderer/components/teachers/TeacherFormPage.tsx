'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  EmploymentType,
  Gender,
  StaffPosition,
  type EmploymentType as EmploymentTypeValue,
  type Gender as GenderValue,
  type StaffPosition as StaffPositionValue,
} from '@nemis-desktop/types';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { ArrowLeft, Briefcase, Phone, User } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { useSettingsViewModel, useTeacherProfileViewModel, useTeachersListViewModel } from '@/lib/presentation/hooks/school-admin';
import { human, queryId } from './shared';

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-300 rounded-lg p-6 space-y-4">
      <h2 className="flex items-center gap-2 font-semibold text-slate-800">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Create / edit teacher — mirrors portal-web's staff creation page layout
 * (dark header band, sectioned cards, primary/secondary action pair) while
 * keeping the desktop's real offline create/update flow unchanged. */
export function TeacherFormPage({ edit = false }: { edit?: boolean }) {
  const router = useRouter();
  const list = useTeachersListViewModel();
  const profileVm = useTeacherProfileViewModel();
  const settings = useSettingsViewModel();
  const school = useViewModel(settings.store, (s) => s.profile);
  const profileState = useViewModel(profileVm.store, (s) => s.profile);

  const [id, setId] = useState('');
  const [first, setFirst] = useState('');
  const [middle, setMiddle] = useState('');
  const [last, setLast] = useState('');
  const [employee, setEmployee] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<GenderValue>(Gender.FEMALE);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [position, setPosition] = useState<StaffPositionValue>(StaffPosition.TEACHER);
  const [employment, setEmployment] = useState<EmploymentTypeValue>(EmploymentType.FULL_TIME);
  const [joining, setJoining] = useState(new Date().toISOString().slice(0, 10));
  const [qualification, setQualification] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void settings.loadCurrentSchool();
    const value = queryId();
    setId(value);
    if (edit && value) void profileVm.loadProfile(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (edit && (profileState.status === 'success' || profileState.status === 'refreshing')) {
      const d = profileState.data;
      setFirst(d.firstName);
      setMiddle(d.middleName ?? '');
      setLast(d.lastName);
      setEmployee(d.employeeNumber);
      setDob(d.dateOfBirth.slice(0, 10));
      setGender(d.gender);
      setPhone(d.phoneNumber);
      setEmail(d.email ?? '');
      setAddress(d.address ?? '');
      setPosition(d.position);
      setEmployment(d.employmentType);
      setJoining(d.dateOfJoining.slice(0, 10));
      setQualification(typeof d.qualifications?.summary === 'string' ? d.qualifications.summary : '');
    }
  }, [edit, profileState]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const common = {
      firstName: first,
      middleName: middle || undefined,
      lastName: last,
      dateOfBirth: dob,
      gender,
      phoneNumber: phone,
      email: email || undefined,
      address: address || undefined,
      employeeNumber: employee,
      position,
      employmentType: employment,
      dateOfJoining: joining,
      qualifications: qualification ? { summary: qualification } : undefined,
    };
    const result = edit
      ? await profileVm.updateTeacher({ teacherId: id, ...common })
      : school.status === 'success' || school.status === 'refreshing'
        ? await list.createTeacher({ institutionId: school.data.id, ...common })
        : null;
    setSaving(false);
    if (result?.ok) router.push('/government/school-admin/teachers-staff');
  };

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
        <h1 className="text-xl font-bold mt-0.5">{edit ? 'Edit Teacher' : 'Add Teacher'}</h1>
      </div>

      <div className="px-6 py-6 max-w-4xl mx-auto space-y-5">
        <Link
          href="/government/school-admin/teachers-staff"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Teachers
        </Link>

        <form onSubmit={(e) => void submit(e)} className="space-y-5">
          <SectionCard title="Personal Information" icon={<User className="w-4 h-4 text-secondary" />}>
            <div className="grid md:grid-cols-3 gap-3">
              <Input label="First name" required value={first} onChange={(e) => setFirst(e.target.value)} />
              <Input label="Middle name" value={middle} onChange={(e) => setMiddle(e.target.value)} />
              <Input label="Last name" required value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Input label="Date of birth" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
              <Select
                label="Gender"
                options={Object.values(Gender).map((v) => ({ value: v, label: human(v) }))}
                value={gender}
                onChange={(e) => setGender(e.target.value as GenderValue)}
              />
            </div>
          </SectionCard>

          <SectionCard title="Contact Information" icon={<Phone className="w-4 h-4 text-secondary" />}>
            <div className="grid md:grid-cols-2 gap-3">
              <Input label="Phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </SectionCard>

          <SectionCard title="Employment Details" icon={<Briefcase className="w-4 h-4 text-secondary" />}>
            <div className="grid md:grid-cols-2 gap-3">
              <Input label="Employee number" required value={employee} onChange={(e) => setEmployee(e.target.value)} />
              <Input label="Date joined" type="date" required value={joining} onChange={(e) => setJoining(e.target.value)} />
              <Select
                label="Position"
                options={Object.values(StaffPosition).map((v) => ({ value: v, label: human(v) }))}
                value={position}
                onChange={(e) => setPosition(e.target.value as StaffPositionValue)}
              />
              <Select
                label="Employment type"
                options={Object.values(EmploymentType).map((v) => ({ value: v, label: human(v) }))}
                value={employment}
                onChange={(e) => setEmployment(e.target.value as EmploymentTypeValue)}
              />
            </div>
            <Input label="Qualification summary" value={qualification} onChange={(e) => setQualification(e.target.value)} />
          </SectionCard>

          {school.status === 'empty' && !edit && (
            <p className="text-sm text-error">A school profile must be provisioned before teachers can be created.</p>
          )}

          <div className="flex justify-end gap-3">
            <Link href="/government/school-admin/teachers-staff">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-button hover:bg-slate-50"
              >
                Cancel
              </button>
            </Link>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : edit ? 'Save Changes' : 'Add Teacher'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
