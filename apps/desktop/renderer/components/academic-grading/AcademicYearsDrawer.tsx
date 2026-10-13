'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { AcademicYearStatus } from '@nemis-desktop/types';
import type { AcademicYearRowView } from '@nemis-desktop/presentation';
import { Badge, Button, Drawer, Input } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { FormField, LoadState, statusVariant } from '@/components/academic/foundation-ui';
import { useEscapeCapture } from './use-escape-capture';
import { useOpenSession, type SetupDrawerProps, type SetupNavigate } from './setup-drawers';

type YearStatus = (typeof AcademicYearStatus)[keyof typeof AcademicYearStatus];

/** Academic years, managed from a drawer on the Academic Grading page.
 * Create/edit swap the drawer body to a form — a Modal can't stack inside the
 * transformed Drawer. A year's status actions live in its edit form so the
 * table fits the drawer width. */
export function AcademicYearsDrawer({ isOpen, onClose, onNavigate }: SetupDrawerProps) {
  const session = useOpenSession(isOpen);
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Academic Years" size="xl">
      <AcademicYearsManager key={session} onNavigate={onNavigate} />
    </Drawer>
  );
}

function AcademicYearsManager({ onNavigate }: { onNavigate: SetupNavigate }) {
  const vm = useAcademicFoundationViewModel();
  const state = useViewModel(vm.store, (s) => s.academicYears);
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<AcademicYearRowView | null>(null);
  const [code, setCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [makeCurrent, setMakeCurrent] = useState(false);
  const backToList = useCallback(() => setView('list'), []);
  useEscapeCapture(view === 'form', backToList);
  useRevalidateOnSync(() => { void vm.loadAcademicYears(); }, [vm]);

  const begin = (year?: AcademicYearRowView) => {
    setEditing(year ?? null);
    setCode(year?.code ?? '');
    setStartDate(year?.startDate ?? '');
    setEndDate(year?.endDate ?? '');
    setMakeCurrent(year?.isCurrent ?? false);
    setView('form');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = editing
      ? await vm.updateAcademicYear({ id: editing.id, code, startDate, endDate })
      : await vm.createAcademicYear({ code, startDate, endDate, makeCurrent });
    if (result.ok) setView('list');
  };

  const setStatus = async (year: AcademicYearRowView, status: YearStatus) => {
    if (!window.confirm(`Change ${year.code} to ${status.toLowerCase()}?`)) return;
    const result = await vm.setAcademicYearStatus(year.id, status);
    if (result.ok) setView('list');
  };

  const setCurrent = async (year: AcademicYearRowView) => {
    const result = await vm.setCurrentAcademicYear(year.id);
    if (result.ok) setView('list');
  };

  if (view === 'form') {
    return (
      <div className="space-y-6">
        <form onSubmit={(e) => void submit(e)} className="space-y-4">
          <h3 className="font-semibold text-slate-900">{editing ? 'Edit Academic Year' : 'Create Academic Year'}</h3>
          <Input label="Academic year code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="2026/2027" />
          <FormField>
            <Input label="Start date" required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="End date" required type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </FormField>
          {!editing && (
            <label className="flex gap-2 text-sm">
              <input type="checkbox" checked={makeCurrent} onChange={(e) => setMakeCurrent(e.target.checked)} /> Make this the current academic year
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={backToList}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
        {editing && (
          <section className="space-y-3 border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-900">Status</h4>
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Badge variant={statusVariant(editing.status)} size="sm">{editing.status}</Badge>
              {editing.isCurrent && <span>Current academic year</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {editing.status === 'ACTIVE' && !editing.isCurrent && (
                <Button type="button" size="sm" onClick={() => void setCurrent(editing)}>Set current</Button>
              )}
              {editing.status === 'ACTIVE' && !editing.isCurrent && (
                <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus(editing, AcademicYearStatus.CLOSED)}>Close</Button>
              )}
              {editing.status !== 'ARCHIVED' && !editing.isCurrent && (
                <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus(editing, AcademicYearStatus.ARCHIVED)}>Archive</Button>
              )}
              {editing.status !== 'ACTIVE' && (
                <Button type="button" size="sm" variant="secondary" onClick={() => void setStatus(editing, AcademicYearStatus.ACTIVE)}>Restore</Button>
              )}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => begin()}>Create academic year</Button>
      </div>
      <LoadState state={state} emptyTitle="No Academic Year has been configured." emptyDescription="Create an academic year before setting up terms and classes." />
      {(state.status === 'success' || state.status === 'refreshing') && (
        <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="p-3">Code</th>
                <th className="p-3">Period</th>
                <th className="p-3">Status</th>
                <th className="p-3">Terms</th>
                <th className="p-3">Classes</th>
                <th className="p-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((year) => (
                <tr key={year.id} className="border-b last:border-0">
                  <td className="p-3 font-medium">
                    {year.code}
                    {year.isCurrent && <Badge className="ml-2" size="sm">Current</Badge>}
                  </td>
                  <td className="p-3">{year.startDate} — {year.endDate}</td>
                  <td className="p-3"><Badge variant={statusVariant(year.status)} size="sm">{year.isCurrent ? 'Active' : "Inactive"}</Badge></td>
                  <td className="p-3">
                    <button
                      type="button"
                      className="text-blue-700 hover:underline"
                      onClick={() => onNavigate('terms', { yearId: year.id })}
                      aria-label={`${year.termCount} ${year.termCount === 1 ? 'term' : 'terms'} in ${year.code}`}
                    >
                      {year.termCount}
                    </button>
                  </td>
                  <td className="p-3">{year.classCount}</td>
                  <td className="p-3">
                    <Button size="sm" variant="secondary" onClick={() => begin(year)} aria-label={`Edit ${year.code}`}>Edit</Button>
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
