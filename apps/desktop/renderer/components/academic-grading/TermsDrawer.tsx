'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { TermRowView } from '@nemis-desktop/presentation';
import { Badge, Button, Drawer, EmptyState, ErrorState, Input, Select } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { FormField, LoadState } from '@/components/academic/foundation-ui';
import { useEscapeCapture } from './use-escape-capture';
import { useOpenSession, type SetupDrawerProps, type SetupNavigate } from './setup-drawers';

/** The year the Terms drawer opens on: the requested one when it is on this
 * device, else the current year, else the first. */
export function initialYearId(years: readonly { id: string; isCurrent: boolean }[], requested: string): string {
  if (requested && years.some((y) => y.id === requested)) return requested;
  return (years.find((y) => y.isCurrent) ?? years[0])?.id ?? '';
}

export interface TermsDrawerProps extends SetupDrawerProps {
  /** Year to open on (from `?yearId=` or the Academic Years drawer). */
  yearId?: string;
}

/** Terms of an academic year, managed from a drawer on the Academic Grading
 * page. Create/edit swap the drawer body to a form (see AcademicYearsDrawer). */
export function TermsDrawer({ isOpen, onClose, onNavigate, yearId = '' }: TermsDrawerProps) {
  const session = useOpenSession(isOpen);
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Terms" size="xl">
      <TermsManager key={session} requestedYearId={yearId} onNavigate={onNavigate} />
    </Drawer>
  );
}

function TermsManager({ requestedYearId, onNavigate }: { requestedYearId: string; onNavigate: SetupNavigate }) {
  const vm = useAcademicFoundationViewModel();
  const years = useViewModel(vm.store, (s) => s.academicYears);
  const terms = useViewModel(vm.store, (s) => s.terms);
  const [selectedYear, setSelectedYear] = useState('');
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<TermRowView | null>(null);
  const [name, setName] = useState('');
  const [sequence, setSequence] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [makeCurrent, setMakeCurrent] = useState(false);
  const [termsPerYear, setTermsPerYear] = useState(2);
  const backToList = useCallback(() => setView('list'), []);
  useEscapeCapture(view === 'form', backToList);

  useRevalidateOnSync(() => { void vm.loadAcademicYears(); }, [vm]);
  useEffect(() => {
    void sharedBridge.listSchoolAdminRecords({ collection: 'institution_grading_configs', limit: 1 }).then((result) => {
      const value = result.items[0]?.termsPerYear;
      if (typeof value === 'number') setTermsPerYear(value);
    }).catch(() => {
      // The position list keeps its default of 2 when the config can't be read.
    });
  }, []);
  useEffect(() => {
    if ((years.status === 'success' || years.status === 'refreshing') && selectedYear === '') {
      const id = initialYearId(years.data, requestedYearId);
      if (id) setSelectedYear(id);
    }
  }, [years, selectedYear, requestedYearId]);
  useRevalidateOnSync(() => { if (selectedYear) void vm.loadTerms(selectedYear); }, [vm, selectedYear]);

  const begin = (term?: TermRowView) => {
    setEditing(term ?? null);
    setName(term?.name ?? '');
    setSequence(term ? String(term.sequence) : '');
    setStartDate(term?.startDate ?? '');
    setEndDate(term?.endDate ?? '');
    setMakeCurrent(term?.isCurrent ?? false);
    setView('form');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = editing
      ? await vm.updateTerm({ id: editing.id, name, sequence: Number(sequence), startDate, endDate }, selectedYear)
      : await vm.createTerm({ academicYearId: selectedYear, name, sequence: Number(sequence), startDate, endDate, makeCurrent });
    if (result.ok) setView('list');
  };

  const yearsReady = years.status === 'success' || years.status === 'refreshing';
  const yearOptions = yearsReady ? years.data.map((year) => ({ value: year.id, label: year.code })) : [];
  const positionOptions = Array.from({ length: termsPerYear }, (_, i) => ({ value: String(i + 1), label: `Term ${i + 1}` }));

  if (view === 'form') {
    return (
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <h3 className="font-semibold text-slate-900">{editing ? 'Edit Term' : 'Create Term'}</h3>
        <Input label="Term name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Term position" required value={sequence} onChange={(e) => setSequence(e.target.value)} options={positionOptions} placeholder="Select position" />
        <FormField>
          <Input label="Start date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End date" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </FormField>
        {!editing && (
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} /> Make this the current term
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={backToList}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[14rem] flex-1">
          <Select label="Academic year" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} options={yearOptions} placeholder="Select academic year" />
        </div>
        <Button disabled={!selectedYear} onClick={() => begin()}>Create term</Button>
      </div>
      {years.status === 'empty' ? (
        <EmptyState
          title="No academic year yet."
          description="Create an academic year before adding its terms."
          action={<Button onClick={() => onNavigate('years')}>Create academic year</Button>}
        />
      ) : years.status === 'error' ? (
        <ErrorState message={years.error.userMessage} />
      ) : (
        <LoadState state={terms} emptyTitle="No terms have been created." emptyDescription="Create terms within the selected academic year." />
      )}
      {yearsReady && (terms.status === 'success' || terms.status === 'refreshing') && (
        <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="p-3">Term</th>
                <th className="p-3">Period</th>
                <th className="p-3">Status</th>
                <th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {terms.data.filter((term) => term.academicYearId === selectedYear).map((term) => (
                <tr key={term.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {term.name} <span className="text-xs font-normal text-slate-500">(Term {term.sequence})</span>
                  </td>
                  <td className="p-3">{term.startDate} — {term.endDate}</td>
                  <td className="p-3">{term.isCurrent ? <Badge variant="success" size="sm">Current</Badge> : '—'}</td>
                  <td className="flex gap-2 p-3">
                    <Button size="sm" variant="secondary" onClick={() => begin(term)}>Edit</Button>
                    {!term.isCurrent && (
                      <Button size="sm" onClick={() => void vm.setCurrentTerm(term.id, selectedYear)}>Set current</Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (window.confirm(`Delete ${term.name}?`)) void vm.deleteTerm(term.id, selectedYear);
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
