'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useAcademicFoundationViewModel, useEnrollmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { Button, Input, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { human, Page, queryId } from './shared';

export function EnrollmentPage() {
  const students = useEnrollmentViewModel();
  const foundation = useAcademicFoundationViewModel();
  const years = useViewModel(foundation.store, (s) => s.academicYears);
  const terms = useViewModel(foundation.store, (s) => s.terms);
  const classes = useViewModel(foundation.store, (s) => s.classes);
  const [id, setId] = useState('');
  const [year, setYear] = useState('');
  const [term, setTerm] = useState('');
  const [clazz, setClazz] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  useEffect(() => {
    setId(queryId());
    void foundation.loadAcademicYears();
  }, [foundation]);
  useEffect(() => {
    if ((years.status === 'success' || years.status === 'refreshing') && !year) {
      const y = years.data.find((v) => v.isCurrent);
      if (y) setYear(y.id);
    }
  }, [years, year]);
  useEffect(() => {
    if (year) {
      void foundation.loadTerms(year);
      foundation.setClassFilters({ academicYearId: year });
      void foundation.loadClasses();
    }
  }, [foundation, year]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await students.enrollStudent({
      studentId: id,
      academicYearId: year,
      termId: term,
      classId: clazz,
      enrollmentDate: date,
    });
    if (r.ok) window.location.href = `/government/school-admin/students/profile?id=${id}`;
  };
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
        <Button type="submit">Complete enrollment</Button>
      </form>
    </Page>
  );
}
