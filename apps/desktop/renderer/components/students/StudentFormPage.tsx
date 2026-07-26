'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
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
  useStudentsListViewModel,
} from '@/lib/presentation/hooks';
import { genders, grades, human, Page, queryId } from './shared';

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
