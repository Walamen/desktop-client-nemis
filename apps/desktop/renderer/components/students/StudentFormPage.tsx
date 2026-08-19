'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
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
} from '@/lib/presentation/hooks/school-admin';
import { genders, grades, human, Page, queryId } from './shared';

interface GuardianDraft {
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string;
  isPrimary: boolean;
}

export function StudentFormPage({ edit = false }: { edit?: boolean }) {
  const router = useRouter();
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
  // Wizard-only state (create mode). Declared unconditionally, alongside the
  // other hooks, so hook order stays stable regardless of `edit` — see the
  // `if (edit) return` branch below, which simply doesn't use these.
  const [currentStep, setCurrentStep] = useState(1);
  const [stepError, setStepError] = useState('');
  const [guardians, setGuardians] = useState<GuardianDraft[]>([
    { firstName: '', lastName: '', relationship: '', phoneNumber: '', email: '', isPrimary: true },
  ]);
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);
  const updateGuardian = (index: number, field: keyof GuardianDraft, value: string | boolean) => {
    setGuardians((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  };
  const addGuardian = () =>
    setGuardians((prev) => [
      ...prev,
      { firstName: '', lastName: '', relationship: '', phoneNumber: '', email: '', isPrimary: false },
    ]);
  const removeGuardian = (index: number) => setGuardians((prev) => prev.filter((_, i) => i !== index));
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
      if (r.ok) router.push(`/government/school-admin/students/profile?id=${id}`);
    }
  };
  const submitCreate = async () => {
    if (profile.status !== 'success' && profile.status !== 'refreshing') return;
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
    if (!r.ok) return;
    for (const g of guardians.filter(
      (guardian) => guardian.firstName && guardian.lastName && guardian.phoneNumber,
    )) {
      await profileVm.createGuardian({
        studentId: r.data.id,
        firstName: g.firstName,
        lastName: g.lastName,
        relationship: g.relationship,
        phoneNumber: g.phoneNumber,
        email: g.email?.trim() || undefined,
        isPrimary: g.isPrimary,
      });
    }
    setCreatedStudentId(r.data.id);
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

  const schoolName =
    profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';

  if (createdStudentId) {
    return (
      <div className="min-h-full bg-slate-100">
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
            <h1 className="text-xl font-bold mt-0.5">Add Student</h1>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-300">{schoolName}</p>
          </div>
        </div>
        <div className="px-6 py-6 max-w-2xl mx-auto space-y-5">
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-green-800 text-sm">Student created successfully</p>
              <p className="text-xs text-green-700 mt-0.5">
                {firstName} {lastName} has been added to your school.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href={`/government/school-admin/students/profile?id=${createdStudentId}`}>
              <Button>Go to student profile</Button>
            </Link>
            <Link href="/government/school-admin/students">
              <Button variant="secondary">Back to students list</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const STEPS = [
    { number: 1, title: 'Student Information', description: 'Basic details' },
    { number: 2, title: 'Guardian Information', description: 'Parent/Guardian' },
    { number: 3, title: 'Grade Level', description: 'Level selection' },
    { number: 4, title: 'Review & Submit', description: 'Confirm details' },
  ] as const;

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
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Add Student</h1>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-300">{schoolName}</p>
        </div>
      </div>
      <div className="px-6 py-6 flex gap-8">
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
          {currentStep === 2 && (
            <GuardianStep
              guardians={guardians}
              updateGuardian={updateGuardian}
              addGuardian={addGuardian}
              removeGuardian={removeGuardian}
            />
          )}
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
          {currentStep === 4 && (
            <ReviewStep
              firstName={firstName}
              middleName={middleName}
              lastName={lastName}
              number={number}
              dob={dob}
              grade={grade}
              guardians={guardians}
              profileMissing={profile.status === 'empty'}
            />
          )}
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
                <Button type="button" onClick={() => void submitCreate()}>
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

function GuardianStep({
  guardians,
  updateGuardian,
  addGuardian,
  removeGuardian,
}: {
  guardians: GuardianDraft[];
  updateGuardian: (index: number, field: keyof GuardianDraft, value: string | boolean) => void;
  addGuardian: () => void;
  removeGuardian: (index: number) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Guardian Information</h2>
      {guardians.map((g, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">
              Guardian {index + 1} {g.isPrimary && <span className="text-xs text-sky-700">(Primary)</span>}
            </h3>
            {guardians.length > 1 && (
              <button type="button" className="text-red-600 text-sm" onClick={() => removeGuardian(index)}>
                Remove
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Guardian first name"
              value={g.firstName}
              onChange={(e) => updateGuardian(index, 'firstName', e.target.value)}
            />
            <Input
              label="Guardian last name"
              value={g.lastName}
              onChange={(e) => updateGuardian(index, 'lastName', e.target.value)}
            />
            <Input
              label="Relationship"
              value={g.relationship}
              onChange={(e) => updateGuardian(index, 'relationship', e.target.value)}
            />
            <Input
              label="Guardian phone"
              value={g.phoneNumber}
              onChange={(e) => updateGuardian(index, 'phoneNumber', e.target.value)}
            />
            <Input
              label="Guardian email"
              type="email"
              value={g.email}
              onChange={(e) => updateGuardian(index, 'email', e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={g.isPrimary}
              onChange={(e) => updateGuardian(index, 'isPrimary', e.target.checked)}
            />
            Primary contact
          </label>
        </div>
      ))}
      <Button type="button" variant="secondary" fullWidth onClick={addGuardian}>
        Add another guardian
      </Button>
    </div>
  );
}
function ReviewStep({
  firstName,
  middleName,
  lastName,
  number,
  dob,
  grade,
  guardians,
  profileMissing,
}: {
  firstName: string;
  middleName: string;
  lastName: string;
  number: string;
  dob: string;
  grade: GradeLevelValue | '';
  guardians: GuardianDraft[];
  profileMissing: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Review & Submit</h2>
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">Student Information</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-600">Name</dt>
            <dd className="font-medium">
              {firstName} {middleName} {lastName}
            </dd>
          </div>
          <div>
            <dt className="text-gray-600">Student number</dt>
            <dd className="font-medium">{number}</dd>
          </div>
          <div>
            <dt className="text-gray-600">Date of birth</dt>
            <dd className="font-medium">{dob}</dd>
          </div>
          <div>
            <dt className="text-gray-600">Grade</dt>
            <dd className="font-medium">{grade ? human(grade) : 'Not selected'}</dd>
          </div>
        </dl>
      </div>
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">Guardian Information</h3>
        {guardians.filter((g) => g.firstName && g.lastName && g.phoneNumber).length === 0 && (
          <p className="text-sm text-gray-600">No guardians added.</p>
        )}
        {guardians
          .filter((g) => g.firstName && g.lastName && g.phoneNumber)
          .map((g, i) => (
            <p key={i} className="text-sm text-gray-700">
              {g.firstName} {g.lastName} — {g.relationship} {g.isPrimary && '(Primary)'}
            </p>
          ))}
      </div>
      {profileMissing && (
        <p className="text-sm text-red-700">
          A school profile must be provisioned before students can be created.
        </p>
      )}
    </div>
  );
}
