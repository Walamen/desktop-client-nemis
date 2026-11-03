'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useAcademicFoundationViewModel,
  useEnrollmentViewModel,
  useStudentProfileViewModel,
} from '@/lib/presentation/hooks/school-admin';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useQueryParam } from '@/hooks/use-query-param';
import { human, Page } from './shared';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { RETURNING_STUDENT_REFUSAL } from '@nemis-desktop/shared';
import { parseIpcError } from '@/lib/errors/parseIpcError';

/** Reads its own `?id=`; the body is keyed on it so a new student starts clean. */
export function EnrollmentPage() {
  const id = useQueryParam('id');
  return <EnrollmentBody key={id} id={id} />;
}

function EnrollmentBody({ id }: { id: string }) {
  const router = useRouter();
  const students = useEnrollmentViewModel();
  const profileVm = useStudentProfileViewModel();
  const details = useViewModel(profileVm.store, (s) => s.details);
  const foundation = useAcademicFoundationViewModel();
  const years = useViewModel(foundation.store, (s) => s.academicYears);
  const terms = useViewModel(foundation.store, (s) => s.terms);
  const classes = useViewModel(foundation.store, (s) => s.classes);
  const [year, setYear] = useState('');
  const [term, setTerm] = useState('');
  const [clazz, setClazz] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [refusal, setRefusal] = useState<string | null>(null);
  useRevalidateOnSync(() => {
    void foundation.loadAcademicYears();
  }, [foundation]);
  useEffect(() => {
    if ((years.status === 'success' || years.status === 'refreshing') && !year) {
      const y = years.data.find((v) => v.isCurrent);
      if (y) setYear(y.id);
    }
  }, [years, year]);
  useRevalidateOnSync(() => {
    if (year) {
      void foundation.loadTerms(year);
      foundation.setClassFilters({ academicYearId: year });
      void foundation.loadClasses();
    }
  }, [foundation, year]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setRefusal(null);
    const r = await students.enrollStudent({
      studentId: id,
      academicYearId: year,
      termId: term,
      classId: clazz,
      enrollmentDate: date,
    });
    if (r.ok) {
      router.push(`/government/school-admin/students/profile?id=${id}`);
      return;
    }
    // The IPC layer carries the server-authored refusal text; show it here
    // as well as in the toast so the admin sees where to go next.
    const message = parseIpcError(r.error.cause)?.message ?? r.error.userMessage;
    setRefusal(message);
    // The lookup needs the child's NEMIS ID and date of birth; fetch them only
    // for this refusal.
    if (message === RETURNING_STUDENT_REFUSAL) void profileVm.loadDetails(id);
  };
  const lookupHref =
    refusal === RETURNING_STUDENT_REFUSAL &&
    (details.status === 'success' || details.status === 'refreshing') &&
    details.data.id === id &&
    details.data.nemisId
      ? `/government/school-admin/students/create?${new URLSearchParams({
          nemisId: details.data.nemisId,
          dob: details.data.rawDateOfBirth.slice(0, 10),
        }).toString()}`
      : null;
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
        {refusal && (
          <p role="alert" className="text-sm text-red-700">
            {refusal}
          </p>
        )}
        {lookupHref && (
          <Link href={lookupHref} className="block text-sm font-medium text-accent underline">
            Find this student in the lookup
          </Link>
        )}
        <Button type="submit">Complete enrollment</Button>
      </form>
    </Page>
  );
}
