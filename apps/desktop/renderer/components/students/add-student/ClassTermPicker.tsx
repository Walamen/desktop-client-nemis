'use client';
import { useEffect } from 'react';
import type { GradeLevel } from '@nemis-desktop/types';
import { Button, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { human } from '../shared';

export interface ClassTermValue {
  academicYearId: string;
  classId: string;
  termId: string;
}

export function isClassTermComplete(value: ClassTermValue): boolean {
  return Boolean(value.academicYearId && value.classId && value.termId);
}

/** Class + term for the CURRENT academic year, with classes filtered to the
 * chosen grade so a grade/class mismatch cannot be picked. Explanatory hints
 * render only once a list has loaded empty — never while loading, never after
 * an error (the defect that bit portal-web's B.2 twice: an "add one first"
 * hint after a transient failure makes the admin create duplicates). */
export function ClassTermPicker({
  gradeLevel,
  value,
  onChange,
}: {
  gradeLevel: GradeLevel | '';
  value: ClassTermValue;
  onChange: (value: ClassTermValue) => void;
}) {
  const foundation = useAcademicFoundationViewModel();
  const years = useViewModel(foundation.store, (s) => s.academicYears);
  const terms = useViewModel(foundation.store, (s) => s.terms);
  const classes = useViewModel(foundation.store, (s) => s.classes);

  // The foundation ViewModel is shared app-wide and other pages call a bare
  // loadClasses(). Give back the class filters we found, untouched, so they
  // don't silently list one grade's classes after the wizard. No reload on
  // unmount: the next page loads its own. Declared before the filter effect so
  // the snapshot is taken before this picker narrows the filters.
  useEffect(() => {
    const snapshot = foundation.store.getState().classFilters;
    return () => foundation.setClassFilters(snapshot);
  }, [foundation]);

  useEffect(() => {
    void foundation.loadAcademicYears();
  }, [foundation]);

  const current =
    years.status === 'success' || years.status === 'refreshing'
      ? years.data.find((y) => y.isCurrent)
      : undefined;
  const yearId = current?.id ?? '';

  useEffect(() => {
    if (!yearId) return;
    void foundation.loadTerms(yearId);
  }, [foundation, yearId]);

  useEffect(() => {
    if (!yearId || !gradeLevel) return;
    foundation.setClassFilters({ academicYearId: yearId, gradeLevel });
    void foundation.loadClasses();
  }, [foundation, yearId, gradeLevel]);

  // Keep the reported year in step, and drop a class that no longer fits.
  useEffect(() => {
    if (value.academicYearId !== yearId) onChange({ academicYearId: yearId, classId: '', termId: value.termId });
  }, [yearId, value, onChange]);

  const noCurrentYear =
    (years.status === 'success' || years.status === 'refreshing') && !current;
  if (years.status === 'empty' || noCurrentYear) {
    return (
      <p className="text-sm text-amber-700">
        There is no current academic year on this device. Set one under Academic Years before enrolling.
      </p>
    );
  }
  if (years.status === 'error') {
    return (
      <div className="text-sm text-red-700">
        Couldn&apos;t load the academic year.{' '}
        <Button type="button" variant="secondary" onClick={() => void foundation.loadAcademicYears()}>
          Try again
        </Button>
      </div>
    );
  }

  const classOptions =
    classes.status === 'success' || classes.status === 'refreshing'
      ? classes.data
          .filter((c) => c.isActive && c.gradeLevel === gradeLevel && c.academicYearId === yearId)
          .map((c) => ({ value: c.id, label: c.name }))
      : [];
  const termOptions =
    terms.status === 'success' || terms.status === 'refreshing'
      ? terms.data.map((t) => ({ value: t.id, label: t.name }))
      : [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Academic year: {current?.code ?? '…'}</p>
      {!gradeLevel ? (
        <p className="text-sm text-slate-500">Choose a grade to see its classes.</p>
      ) : classes.status === 'error' ? (
        <div className="text-sm text-red-700">
          Couldn&apos;t load classes.{' '}
          <Button type="button" variant="secondary" onClick={() => void foundation.loadClasses()}>
            Try again
          </Button>
        </div>
      ) : classes.status === 'empty' ||
        ((classes.status === 'success' || classes.status === 'refreshing') && classOptions.length === 0) ? (
        <p className="text-sm text-amber-700">
          No classes for {human(gradeLevel)} — create one first.
        </p>
      ) : (
        <Select
          label="Class"
          required
          placeholder={classes.status === 'success' || classes.status === 'refreshing' ? 'Select class' : 'Loading…'}
          options={classOptions}
          value={value.classId}
          onChange={(e) => onChange({ ...value, academicYearId: yearId, classId: e.target.value })}
        />
      )}
      {terms.status === 'error' ? (
        <div className="text-sm text-red-700">
          Couldn&apos;t load terms.{' '}
          <Button type="button" variant="secondary" onClick={() => void foundation.loadTerms(yearId)}>
            Try again
          </Button>
        </div>
      ) : terms.status === 'empty' ? (
        <p className="text-sm text-amber-700">No terms in this academic year — create one first.</p>
      ) : (
        <Select
          label="Term"
          required
          placeholder={terms.status === 'success' || terms.status === 'refreshing' ? 'Select term' : 'Loading…'}
          options={termOptions}
          value={value.termId}
          onChange={(e) => onChange({ ...value, academicYearId: yearId, termId: e.target.value })}
        />
      )}
    </div>
  );
}
