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
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
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
  if (edit) {
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

  const STEPS = [
    { number: 1, title: 'Student Information', description: 'Basic details' },
    { number: 2, title: 'Guardian Information', description: 'Parent/Guardian' },
    { number: 3, title: 'Grade Level', description: 'Level selection' },
    { number: 4, title: 'Review & Submit', description: 'Confirm details' },
  ] as const;
  const [currentStep, setCurrentStep] = useState(1);
  const [stepError, setStepError] = useState('');

  const validateStep1 = () => {
    if (!firstName.trim() || !lastName.trim() || !dob || !number.trim()) {
      setStepError('First name, last name, date of birth, and student number are required.');
      return false;
    }
    setStepError('');
    return true;
  };
  const validateStep3 = () => {
    if (!grade) {
      setStepError('Grade level is required.');
      return false;
    }
    setStepError('');
    return true;
  };
  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 3 && !validateStep3()) return;
    setCurrentStep((s) => Math.min(4, s + 1));
  };
  const handleBack = () => setCurrentStep((s) => Math.max(1, s - 1));

  return (
    <div className="p-6">
      <div className="flex gap-8">
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 sticky top-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Progress</h2>
            <div className="space-y-1">
              {STEPS.map((step) => (
                <div
                  key={step.number}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    currentStep === step.number
                      ? 'bg-slate-100 border-l-4 border-slate-900'
                      : currentStep > step.number
                        ? 'bg-green-50 border-l-4 border-green-500'
                        : 'bg-white border-l-4 border-transparent'
                  }`}
                >
                  <div
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      currentStep === step.number
                        ? 'bg-slate-900 text-white'
                        : currentStep > step.number
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {step.number}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{step.title}</p>
                    <p className="text-xs text-slate-400">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-4">
          {stepError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{stepError}</p>}
          {currentStep === 1 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Student Information</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input label="First name" required value={firstName} onChange={(e) => setFirst(e.target.value)} />
                <Input label="Middle name" value={middleName} onChange={(e) => setMiddle(e.target.value)} />
                <Input label="Last name" required value={lastName} onChange={(e) => setLast(e.target.value)} />
                <Input label="Student number" required value={number} onChange={(e) => setNumber(e.target.value)} />
                <Input label="Date of birth" type="date" required value={dob} onChange={(e) => setDob(e.target.value)} />
                <Select
                  label="Gender"
                  required
                  options={genders.map((v) => ({ value: v, label: human(v) }))}
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderValue)}
                />
                <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="mt-4">
                <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>
          )}
          {currentStep === 2 && <GuardianStep />}
          {currentStep === 3 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Grade Level</h2>
              <p className="text-sm text-gray-600 mb-6">
                Class assignment can be done later once classes are set up.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {grades.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrade(g)}
                    className={`p-4 rounded-lg border-2 text-center font-semibold ${
                      grade === g ? 'border-slate-900 bg-slate-100 text-sky-700' : 'border-gray-200 text-gray-700'
                    }`}
                  >
                    {human(g)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {currentStep === 4 && <ReviewStep />}
          <div className="flex justify-between">
            <div>
              {currentStep > 1 && (
                <Button type="button" variant="secondary" onClick={handleBack}>
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Link href="/government/school-admin/students">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
              {currentStep < 4 ? (
                <Button type="button" onClick={handleNext}>
                  Next
                </Button>
              ) : (
                <Button type="button" onClick={() => void submit()}>
                  Create student
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuardianStep() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Guardian Information</h2>
      <p className="text-sm text-slate-500">Guardian fields are added in the next task.</p>
    </div>
  );
}
function ReviewStep() {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Review & Submit</h2>
      <p className="text-sm text-slate-500">Review summary is added in the next task.</p>
    </div>
  );
}
