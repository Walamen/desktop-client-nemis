'use client';
import { useEffect } from 'react';
import { Button, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';

export interface TermValue {
  academicYearId: string;
  termId: string;
}

/** The term of the CURRENT academic year — ClassTermPicker's year + term half,
 * for screens where each row picks its own class. Same hint rules: a hint
 * renders only once a list has loaded empty, never while loading or after an
 * error. */
export function TermPicker({ value, onChange }: { value: TermValue; onChange: (value: TermValue) => void }) {
  const foundation = useAcademicFoundationViewModel();
  const years = useViewModel(foundation.store, (s) => s.academicYears);
  const terms = useViewModel(foundation.store, (s) => s.terms);

  useEffect(() => {
    void foundation.loadAcademicYears();
  }, [foundation]);

  const current =
    years.status === 'success' || years.status === 'refreshing' ? years.data.find((y) => y.isCurrent) : undefined;
  const yearId = current?.id ?? '';

  useEffect(() => {
    if (!yearId) return;
    void foundation.loadTerms(yearId);
  }, [foundation, yearId]);

  // Keep the reported year in step; a term of another year no longer fits.
  useEffect(() => {
    if (value.academicYearId !== yearId) onChange({ academicYearId: yearId, termId: '' });
  }, [yearId, value, onChange]);

  const noCurrentYear = (years.status === 'success' || years.status === 'refreshing') && !current;
  if (years.status === 'empty' || noCurrentYear) {
    return (
      <p className="text-sm text-amber-700">
        There is no current academic year on this device. Set one under Academic Setup → Academic Grading before enrolling.
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

  // Only this year's terms: the shared store may still hold another year's list.
  const termOptions =
    terms.status === 'success' || terms.status === 'refreshing'
      ? terms.data.filter((t) => t.academicYearId === yearId).map((t) => ({ value: t.id, label: t.name }))
      : [];
  const termsLoaded = terms.status === 'success' || (terms.status === 'refreshing' && termOptions.length > 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Academic year: {current?.code ?? '…'}</p>
      {terms.status === 'error' ? (
        <div className="text-sm text-red-700">
          Couldn&apos;t load terms.{' '}
          <Button type="button" variant="secondary" onClick={() => void foundation.loadTerms(yearId)}>
            Try again
          </Button>
        </div>
      ) : terms.status === 'empty' ? (
        <p className="text-sm text-amber-700">No terms in this academic year — create one under Academic Setup → Academic Grading, then return.</p>
      ) : (
        <Select
          label="Term"
          required
          placeholder={termsLoaded ? 'Select term' : 'Loading…'}
          options={termOptions}
          value={value.termId}
          onChange={(e) => onChange({ academicYearId: yearId, termId: e.target.value })}
        />
      )}
    </div>
  );
}
