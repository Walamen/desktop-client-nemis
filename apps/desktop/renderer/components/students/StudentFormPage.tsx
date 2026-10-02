'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Gender,
  type Gender as GenderValue,
  type GradeLevel as GradeLevelValue,
} from '@nemis-desktop/types';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useSettingsViewModel,
  useStudentProfileViewModel,
} from '@/lib/presentation/hooks/school-admin';
import { AddStudentWizard } from './add-student/AddStudentWizard';
import { genders, grades, human, Page, queryId } from './shared';

/** Create mode is the lookup-first wizard; edit mode is the plain form. The
 * branch happens before any hook so neither component's hooks are conditional. */
export function StudentFormPage({ edit = false }: { edit?: boolean }) {
  return edit ? <EditStudentForm /> : <AddStudentWizard />;
}

function EditStudentForm() {
  const router = useRouter();
  const profileVm = useStudentProfileViewModel();
  const settings = useSettingsViewModel();
  const details = useViewModel(profileVm.store, (s) => s.details);
  const [id, setId] = useState('');
  const [firstName, setFirst] = useState('');
  const [middleName, setMiddle] = useState('');
  const [lastName, setLast] = useState('');
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
    if (value) void profileVm.loadDetails(value);
  }, [settings, profileVm]);
  useEffect(() => {
    if (details.status === 'success' || details.status === 'refreshing') {
      const d = details.data;
      setFirst(d.firstName);
      setMiddle(d.middleName ?? '');
      setLast(d.lastName);
      setDob(d.rawDateOfBirth.slice(0, 10));
      setGender(d.rawGender as GenderValue);
      setGrade((d.rawGradeLevel ?? '') as GradeLevelValue | '');
      setPhone(d.phoneNumber ?? '');
      setEmail(d.email ?? '');
      setAddress(d.address ?? '');
    }
  }, [details]);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
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
    if (r.ok) router.push(`/government/school-admin/students/profile?id=${id}`);
  };
  return (
    <Page title="Edit Student">
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
        <div className="flex gap-2">
          <Button type="submit">Save changes</Button>
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
