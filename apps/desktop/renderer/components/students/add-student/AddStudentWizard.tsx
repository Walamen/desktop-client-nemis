'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import {
  Gender,
  type Gender as GenderValue,
  type GradeLevel as GradeLevelValue,
} from '@nemis-desktop/types';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { formatNemisId } from '@nemis-desktop/shared';
import { useViewModel } from '@/hooks/use-view-model';
import {
  useAcademicFoundationViewModel,
  useSettingsViewModel,
  useStudentsListViewModel,
} from '@/lib/presentation/hooks/school-admin';
import { genders, grades, human } from '../shared';
import { ClaimStudentPanel } from './ClaimStudentPanel';
import { ClassTermPicker, isClassTermComplete, type ClassTermValue } from './ClassTermPicker';
import { GuardianStep, ReviewStep, type GuardianDraft } from './CreateStudentSteps';
import { FindStudentStep, type FindOutcome } from './FindStudentStep';
import { RequestReleasePanel } from './RequestReleasePanel';
import { branchForLookup, type WizardBranch } from './wizard-logic';

const STEPS = [
  { number: 1, title: 'Find Student', description: 'National lookup' },
  { number: 2, title: 'Student Information', description: 'Basic details' },
  { number: 3, title: 'Guardian Information', description: 'Parent/Guardian' },
  { number: 4, title: 'Grade & Class', description: 'Grade, class and term' },
  { number: 5, title: 'Review', description: 'Confirm details' },
] as const;

const LAST_STEP = STEPS.length;
const EMPTY_TARGET: ClassTermValue = { academicYearId: '', classId: '', termId: '' };

/** Lookup-first add-student flow. Step 1 searches the national registry; a
 * hit branches to claim (IMMEDIATE) or release request (REQUIRES_APPROVAL),
 * and only a miss or the first-time-enrollee assertion continues into the
 * local create-and-enrol steps. */
export function AddStudentWizard() {
  const listVm = useStudentsListViewModel();
  const settings = useSettingsViewModel();
  const foundation = useAcademicFoundationViewModel();
  const profile = useViewModel(settings.store, (s) => s.profile);
  const classes = useViewModel(foundation.store, (s) => s.classes);
  const terms = useViewModel(foundation.store, (s) => s.terms);

  const [branch, setBranch] = useState<WizardBranch>('find');
  const [find, setFind] = useState<FindOutcome | null>(null);
  const [assertedNoNemisId, setAssertedNoNemisId] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [stepError, setStepError] = useState('');

  const [firstName, setFirst] = useState('');
  const [middleName, setMiddle] = useState('');
  const [lastName, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<GenderValue>(Gender.FEMALE);
  const [grade, setGrade] = useState<GradeLevelValue | ''>('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [guardians, setGuardians] = useState<GuardianDraft[]>([
    { firstName: '', lastName: '', relationship: '', phoneNumber: '', email: '', isPrimary: true },
  ]);
  const [target, setTarget] = useState<ClassTermValue>(EMPTY_TARGET);
  // Captured when leaving step 4: the picker (and its filtered lists) is
  // unmounted on Review, so the names are read while they are on screen.
  const [targetNames, setTargetNames] = useState<{ className: string; termName: string }>({
    className: '',
    termName: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);
  const [createdNemisId, setCreatedNemisId] = useState<string | null>(null);

  useEffect(() => {
    void settings.loadCurrentSchool();
  }, [settings]);

  const updateGuardian = (index: number, field: keyof GuardianDraft, value: string | boolean) => {
    setGuardians((prev) => prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  };
  const addGuardian = () =>
    setGuardians((prev) => [
      ...prev,
      { firstName: '', lastName: '', relationship: '', phoneNumber: '', email: '', isPrimary: false },
    ]);
  const removeGuardian = (index: number) => setGuardians((prev) => prev.filter((_, i) => i !== index));
  // A class belongs to one grade: a new grade invalidates the chosen class
  // (the term does not depend on grade, so it is kept).
  const changeGrade = (next: GradeLevelValue) => {
    if (next === grade) return;
    setGrade(next);
    setTarget((t) => ({ ...t, classId: '' }));
  };

  const onFound = (outcome: FindOutcome) => {
    setFind(outcome);
    setStepError('');
    if (outcome.kind === 'hit') {
      const next = branchForLookup(outcome.hit);
      // A hit is never 'miss'; the guard keeps the types honest.
      setBranch(next === 'miss' ? 'find' : next);
      return;
    }
    setBranch('create');
    setAssertedNoNemisId(outcome.assertedNoNemisId);
    if (outcome.dateOfBirth) setDob(outcome.dateOfBirth);
    setCurrentStep(2);
  };
  const backToSearch = () => {
    setBranch('find');
    setFind(null);
    setStepError('');
    setCurrentStep(1);
  };

  const schoolName =
    profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';

  const header = (
    <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
        <h1 className="text-xl font-bold mt-0.5">Add Student</h1>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-slate-300">{schoolName}</p>
      </div>
    </div>
  );

  if (createdStudentId) {
    return (
      <div className="min-h-full bg-slate-100">
        {header}
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
          {createdNemisId && (
            <div className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">NEMIS ID</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatNemisId(createdNemisId)}</p>
              <p className="mt-1 text-xs text-slate-500">
                This is the student&apos;s permanent national identifier. Record it now — it is also visible
                any time on the students directory or this student&apos;s profile.
              </p>
            </div>
          )}
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

  const validateStep2 = () => {
    if (!firstName.trim() || !lastName.trim() || !dob) {
      setStepError('First name, last name, and date of birth are required.');
      return false;
    }
    setStepError('');
    return true;
  };
  const validateStep3 = () => {
    // Mirrors CreateAndEnrollStudentUseCase: the server creates each
    // guardian's parent login before the student's own, so a shared email
    // would get the student rejected on sync.
    const studentEmail = email.trim().toLowerCase();
    const kept = guardians.filter((g) => g.firstName.trim() && g.lastName.trim() && g.phoneNumber.trim());
    if (studentEmail && kept.some((g) => g.email.trim().toLowerCase() === studentEmail)) {
      setStepError(
        "The student's email can't be the same as a guardian's email. Leave the student's email blank or use a different one.",
      );
      return false;
    }
    setStepError('');
    return true;
  };
  const validateStep4 = () => {
    if (!grade || !isClassTermComplete(target)) {
      setStepError('Choose a grade, class and term.');
      return false;
    }
    setStepError('');
    return true;
  };
  const handleNext = () => {
    if (currentStep === 2 && !validateStep2()) return;
    if (currentStep === 3 && !validateStep3()) return;
    if (currentStep === 4) {
      if (!validateStep4()) return;
      const cls =
        classes.status === 'success' || classes.status === 'refreshing'
          ? classes.data.find((c) => c.id === target.classId)
          : undefined;
      const term =
        terms.status === 'success' || terms.status === 'refreshing'
          ? terms.data.find((t) => t.id === target.termId)
          : undefined;
      setTargetNames({ className: cls?.name ?? '', termName: term?.name ?? '' });
    }
    setCurrentStep((s) => Math.min(LAST_STEP, s + 1));
  };
  const handleBack = () => {
    setStepError('');
    if (currentStep === 2) backToSearch();
    else setCurrentStep((s) => Math.max(1, s - 1));
  };

  const submitCreate = async () => {
    if (profile.status !== 'success' && profile.status !== 'refreshing') return;
    if (!grade) return;
    setSubmitting(true);
    try {
      const r = await listVm.createAndEnrollStudent({
        institutionId: profile.data.id,
        firstName,
        middleName: middleName || undefined,
        lastName,
        dateOfBirth: dob,
        gender,
        gradeLevel: grade,
        phoneNumber: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        academicYearId: target.academicYearId,
        termId: target.termId,
        classId: target.classId,
        assertedNoNemisId,
        guardians: guardians.map(({ firstName, lastName, relationship, phoneNumber, email, isPrimary }) => ({
          firstName,
          lastName,
          relationship,
          phoneNumber,
          email: email?.trim() || undefined,
          isPrimary,
        })),
      });
      if (!r.ok) return;
      setCreatedStudentId(r.data.id);
      // A freshly created student always has a nemisId; the fallback only
      // satisfies the type checker.
      setCreatedNemisId(r.data.nemisId ?? null);
    } finally {
      setSubmitting(false);
    }
  };

  // In a claim/request branch step 1 is done and no create step is current.
  const onCreatePath = branch === 'find' || branch === 'create';
  const isDone = (n: number) => (onCreatePath ? currentStep > n : n === 1);
  const isCurrent = (n: number) => onCreatePath && currentStep === n;

  return (
    <div className="min-h-full bg-slate-100">
      {header}
      <div className="px-6 py-6 flex gap-8">
        <div className="w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-200 p-6 sticky top-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Progress</h2>
            <div className="space-y-1">
              {STEPS.map((step) => (
                <div
                  key={step.number}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    isCurrent(step.number)
                      ? 'bg-slate-100 border-l-4 border-slate-900'
                      : isDone(step.number)
                        ? 'bg-green-50 border-l-4 border-green-500'
                        : 'bg-white border-l-4 border-transparent'
                  }`}
                >
                  <div
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                      isCurrent(step.number)
                        ? 'bg-slate-900 text-white'
                        : isDone(step.number)
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
          {branch === 'claim' && find?.kind === 'hit' && (
            <ClaimStudentPanel hit={find.hit} dateOfBirth={find.dateOfBirth} onBack={backToSearch} />
          )}
          {branch === 'request' && find?.kind === 'hit' && (
            <RequestReleasePanel hit={find.hit} dateOfBirth={find.dateOfBirth} onBack={backToSearch} />
          )}
          {onCreatePath && (
            <>
              {stepError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{stepError}</p>}
              {currentStep === 1 && <FindStudentStep onDone={onFound} />}
              {currentStep === 2 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Student Information</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Input label="First name" required value={firstName} onChange={(e) => setFirst(e.target.value)} />
                    <Input label="Middle name" value={middleName} onChange={(e) => setMiddle(e.target.value)} />
                    <Input label="Last name" required value={lastName} onChange={(e) => setLast(e.target.value)} />
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
                    <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                    <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="mt-4">
                    <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
                  </div>
                </div>
              )}
              {currentStep === 3 && (
                <GuardianStep
                  guardians={guardians}
                  updateGuardian={updateGuardian}
                  addGuardian={addGuardian}
                  removeGuardian={removeGuardian}
                />
              )}
              {currentStep === 4 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900">Grade & Class</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {grades.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => changeGrade(g)}
                        className={`p-4 rounded-lg border-2 text-center font-semibold ${
                          grade === g ? 'border-slate-900 bg-slate-100 text-sky-700' : 'border-gray-200 text-gray-700'
                        }`}
                      >
                        {human(g)}
                      </button>
                    ))}
                  </div>
                  <ClassTermPicker gradeLevel={grade} value={target} onChange={setTarget} />
                </div>
              )}
              {currentStep === 5 && (
                <ReviewStep
                  firstName={firstName}
                  middleName={middleName}
                  lastName={lastName}
                  dob={dob}
                  grade={grade}
                  className={targetNames.className}
                  termName={targetNames.termName}
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
                  {currentStep === 1 ? null : currentStep < LAST_STEP ? (
                    <Button type="button" onClick={handleNext}>
                      Next
                    </Button>
                  ) : (
                    <Button type="button" disabled={submitting} onClick={() => void submitCreate()}>
                      {submitting ? 'Creating…' : 'Create student'}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
