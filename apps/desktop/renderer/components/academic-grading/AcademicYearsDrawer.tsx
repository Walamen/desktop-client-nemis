'use client';

import { useCallback, useState, type FormEvent } from 'react';
import type { AcademicYearRowView } from '@nemis-desktop/presentation';
import { Badge, Button, Drawer, Input } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { parseIpcError } from '@/lib/errors/parseIpcError';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { FormField, LoadState, statusVariant } from '@/components/academic/foundation-ui';
import { useEscapeCapture } from './use-escape-capture';
import { useOpenSession, type SetupDrawerProps, type SetupNavigate } from './setup-drawers';

/** Academic years, managed from a drawer on the Academic Grading page.
 * Create/edit swap the drawer body to a form — a Modal can't stack inside the
 * transformed Drawer. A year's status is owned by the server (SETUP,
 * ACTIVE, CLOSED, REOPENED) and is shown read-only here. */
export function AcademicYearsDrawer({ isOpen, onClose, onNavigate }: SetupDrawerProps) {
  const session = useOpenSession(isOpen);
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Academic Years" size="xl">
      <AcademicYearsManager key={session} onNavigate={onNavigate} />
    </Drawer>
  );
}

const OFFLINE_MESSAGE = "You're offline. Connect to the internet to do this.";

/** Only a SETUP year can start, and only while the school has no ACTIVE year
 * (the server refuses a second one). */
function canStart(year: AcademicYearRowView, years: readonly AcademicYearRowView[] | null): boolean {
  return year.status === 'SETUP' && years !== null && !years.some((y) => y.status === 'ACTIVE');
}

function AcademicYearsManager({ onNavigate }: { onNavigate: SetupNavigate }) {
  const vm = useAcademicFoundationViewModel();
  const state = useViewModel(vm.store, (s) => s.academicYears);
  const years = state.status === 'success' || state.status === 'refreshing' ? state.data : null;
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<AcademicYearRowView | null>(null);
  const [code, setCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const backToList = useCallback(() => setView('list'), []);
  useEscapeCapture(view === 'form', backToList);
  useRevalidateOnSync(() => { void vm.loadAcademicYears(); }, [vm]);

  const begin = (year?: AcademicYearRowView) => {
    setEditing(year ?? null);
    setCode(year?.code ?? '');
    setStartDate(year?.startDate ?? '');
    setEndDate(year?.endDate ?? '');
    setStartError(null);
    setNotice(null);
    setView('form');
  };

  /** The server decides when a year starts, so this is online only. */
  const startYear = async (year: AcademicYearRowView) => {
    if (!window.confirm(`Start ${year.code}? Teachers can record grades and attendance once it starts, and it becomes the year every dashboard shows.`)) return;
    setStarting(true);
    setStartError(null);
    try {
      const { refreshed } = await vm.startAcademicYear(year.id);
      setNotice(refreshed ? `${year.code} started.` : `${year.code} started. It will appear here after the next sync.`);
      setView('list');
    } catch (cause) {
      setStartError(parseIpcError(cause)?.message ?? 'The academic year could not be started. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = editing
      ? await vm.updateAcademicYear({ id: editing.id, code, startDate, endDate })
      : await vm.createAcademicYear({ code, startDate, endDate });
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
            <p className="text-sm text-slate-500">
              {canStart(editing, years)
                ? 'Starting a year is done online and cannot be undone here. The server controls when a year closes.'
                : 'The server controls when a year starts and closes.'}
            </p>
            {canStart(editing, years) && (
              <div className="space-y-2">
                <Button type="button" disabled={!online || starting} onClick={() => void startYear(editing)}>
                  {starting ? 'Starting…' : 'Start this year'}
                </Button>
                {!online && <p className="text-sm text-slate-500">{OFFLINE_MESSAGE}</p>}
                {startError && <p role="alert" className="text-sm text-red-700">{startError}</p>}
              </div>
            )}
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice && <p role="status" className="rounded-card border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
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
                  <td className="p-3"><Badge variant={statusVariant(year.status)} size="sm">{year.status}</Badge></td>
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
