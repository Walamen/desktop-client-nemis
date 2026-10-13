'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle, Eye, FileText, Lock, Plus, RotateCcw, Unlock } from 'lucide-react';
import { Drawer, Input } from '@nemis-desktop/ui';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { useAcademicFoundationViewModel, useAcademicYearViewModel } from '@/lib/presentation/hooks/school-admin';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { formatDateShort, listAllWindows, listPeriodsForTerm, WINDOW_STATUS_CHIP, WINDOW_STATUS_RAIL } from './shared';
import { useEscapeCapture } from './use-escape-capture';
import { useOpenSession, type SetupDrawerProps } from './setup-drawers';

const EMPTY_FORM = { gradingPeriodId: '', name: '', description: '', openDate: '', closeDate: '' };
const UNPUBLISH_PHRASE = 'unpublish this window';

/** Grade entry windows, managed from a drawer on the Academic Grading page —
 * mirrors portal-web's academic-grading/windows lifecycle (DRAFT -> OPEN ->
 * CLOSED -> PUBLISHED, with Reopen/Unpublish), all against the real, mutable
 * grade_entry_windows table via the generic offline collection API. Create and
 * Unpublish swap the drawer body (an overlay can't stack inside the
 * transformed Drawer); View Grades stays a page because its results table
 * needs the full width. */
export function GradeEntryWindowsDrawer({ isOpen, onClose }: SetupDrawerProps) {
  const session = useOpenSession(isOpen);
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Grade Entry Windows" size="xl">
      <GradeEntryWindowsManager key={session} />
    </Drawer>
  );
}

function GradeEntryWindowsManager() {
  const academicYear = useAcademicYearViewModel();
  const foundation = useAcademicFoundationViewModel();
  const year = useViewModel(academicYear.store, (s) => s.current);
  const terms = useViewModel(foundation.store, (s) => s.terms);

  const [windows, setWindows] = useState<SchoolAdminRecord[] | null>(null);
  const [view, setView] = useState<'list' | 'create' | 'unpublish'>('list');
  const [selectedTermId, setSelectedTermId] = useState('');
  const [periods, setPeriods] = useState<SchoolAdminRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [unpublishTarget, setUnpublishTarget] = useState<SchoolAdminRecord | null>(null);
  const [unpublishInput, setUnpublishInput] = useState('');
  const [unpublishing, setUnpublishing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const backToList = useCallback(() => setView('list'), []);
  useEscapeCapture(view !== 'list', backToList);

  const reload = async () => setWindows(await listAllWindows());

  useRevalidateOnSync(() => {
    void reload();
    void academicYear.loadCurrent();
  }, [academicYear]);

  useEffect(() => {
    if (year.status === 'success' || year.status === 'refreshing') void foundation.loadTerms(year.data.id);
  }, [year, foundation]);

  useEffect(() => {
    if (selectedTermId) void listPeriodsForTerm(selectedTermId).then(setPeriods);
    else setPeriods([]);
  }, [selectedTermId]);

  // The academic-foundation view model is app-wide, so `terms` can briefly hold
  // another year's rows; only offer the current year's terms.
  const currentYearId = year.status === 'success' || year.status === 'refreshing' ? year.data.id : '';
  const termOptions =
    terms.status === 'success' || terms.status === 'refreshing'
      ? terms.data.filter((term) => term.academicYearId === currentYearId)
      : [];

  const beginCreate = () => {
    setForm(EMPTY_FORM);
    setSelectedTermId('');
    setView('create');
  };

  const createWindow = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      await sharedBridge.saveSchoolAdminRecord({
        collection: 'grade_entry_windows',
        record: {
          gradingPeriodId: form.gradingPeriodId,
          name: form.name,
          description: form.description || null,
          openDate: form.openDate,
          closeDate: form.closeDate,
          status: 'DRAFT',
          // Matches the server's own default (grade-entry-window.service.ts) and the
          // desktop's JSON-stringified storage convention for array-shaped fields in
          // this generic collection API; the column is NOT NULL so this can't be null.
          allowedRoles: JSON.stringify(['TEACHER']),
        },
      });
      setForm(EMPTY_FORM);
      setSelectedTermId('');
      setView('list');
      await reload();
    } finally {
      setCreating(false);
    }
  };

  const transition = async (win: SchoolAdminRecord, changes: SchoolAdminRecord) => {
    await sharedBridge.saveSchoolAdminRecord({ collection: 'grade_entry_windows', record: { id: win.id!, ...changes } });
    await reload();
  };

  const now = () => new Date().toISOString();
  const openWindow = (win: SchoolAdminRecord) => void transition(win, { status: 'OPEN', openedAt: now() });
  const closeWindow = (win: SchoolAdminRecord) => void transition(win, { status: 'CLOSED', closedAt: now() });
  const publishGrades = (win: SchoolAdminRecord) => void transition(win, { status: 'PUBLISHED', publishedAt: now() });
  const reopenWindow = (win: SchoolAdminRecord) => void transition(win, { status: 'OPEN', openedAt: now() });

  const beginUnpublish = (win: SchoolAdminRecord) => {
    setUnpublishTarget(win);
    setUnpublishInput('');
    setUnpublishing(false);
    setView('unpublish');
  };

  const confirmUnpublish = async () => {
    if (!unpublishTarget || unpublishing) return;
    setUnpublishing(true);
    try {
      await transition(unpublishTarget, { status: 'CLOSED' });
      setUnpublishTarget(null);
      setUnpublishInput('');
      setView('list');
    } finally {
      setUnpublishing(false);
    }
  };

  if (view === 'unpublish') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Unpublish Grades</h3>
          <p className="mt-1 text-sm text-slate-600">
            This will hide all grades from students and move the window back to{' '}
            <span className="font-medium">Closed</span> status. Grades remain saved and can be re-published at
            any time.
          </p>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Type{' '}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-error">{UNPUBLISH_PHRASE}</span> to
            confirm
          </label>
          <Input
            type="text"
            value={unpublishInput}
            onChange={(e) => setUnpublishInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && unpublishInput === UNPUBLISH_PHRASE && !unpublishing) void confirmUnpublish();
            }}
            placeholder={UNPUBLISH_PHRASE}
            autoFocus
            className="font-mono"
          />
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={backToList}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={unpublishInput !== UNPUBLISH_PHRASE || unpublishing}
            onClick={() => void confirmUnpublish()}
            className="rounded-full bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Unpublish
          </button>
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div>
        <h3 className="mb-4 text-xl font-semibold text-slate-900">Create Grade Entry Window</h3>
        <form onSubmit={(e) => void createWindow(e)} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Term</label>
            <select
              value={selectedTermId}
              onChange={(e) => {
                setSelectedTermId(e.target.value);
                setForm((f) => ({ ...f, gradingPeriodId: '' }));
              }}
              required
              autoFocus
              className="w-full rounded-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
            >
              <option value="">Select term</option>
              {termOptions.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Grading Period</label>
            <select
              value={form.gradingPeriodId}
              onChange={(e) => setForm((f) => ({ ...f, gradingPeriodId: e.target.value }))}
              required
              disabled={!selectedTermId}
              className="w-full rounded-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
            >
              <option value="">Select period</option>
              {periods.map((period) => (
                <option key={String(period.id)} value={String(period.id)}>
                  {String(period.name)}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Window Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g., Period 1 Grade Entry"
            required
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Open Date"
              type="date"
              value={form.openDate}
              onChange={(e) => setForm((f) => ({ ...f, openDate: e.target.value }))}
              required
            />
            <Input
              label="Close Date"
              type="date"
              value={form.closeDate}
              onChange={(e) => setForm((f) => ({ ...f, closeDate: e.target.value }))}
              required
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={backToList}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create Window'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Control when teachers can enter grades</p>
        <button
          type="button"
          onClick={beginCreate}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-400"
        >
          <Plus className="h-4 w-4" />
          Create Window
        </button>
      </div>

      {windows === null ? (
        <div className="flex justify-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-secondary border-t-transparent" />
        </div>
      ) : windows.length === 0 ? (
        <div className="py-8 text-center">
          <Lock className="mx-auto mb-3 h-12 w-12 text-slate-300" />
          <p className="text-slate-500">No grade entry windows found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {windows.map((win) => (
            <div
              key={String(win.id)}
              className={`border border-slate-200 border-l-[3px] p-4 ${
                WINDOW_STATUS_RAIL[String(win.status)] ?? 'border-l-slate-300'
              }`}
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h4 className="font-semibold text-slate-900">{String(win.name)}</h4>
                  {win.description && <p className="text-sm text-slate-500">{String(win.description)}</p>}
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    WINDOW_STATUS_CHIP[String(win.status)] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {String(win.status)}
                </span>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Open Date</p>
                  <p className="mt-0.5 font-medium text-slate-900">{formatDateShort(String(win.openDate))}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Close Date</p>
                  <p className="mt-0.5 font-medium text-slate-900">{formatDateShort(String(win.closeDate))}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {win.status === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={() => openWindow(win)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-400"
                  >
                    <Unlock className="h-4 w-4" />
                    Open Window
                  </button>
                )}
                {win.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => closeWindow(win)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-secondary hover:text-secondary"
                  >
                    <Lock className="h-4 w-4" />
                    Close Window
                  </button>
                )}
                {win.status === 'CLOSED' && (
                  <>
                    <button
                      type="button"
                      onClick={() => publishGrades(win)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-400"
                    >
                      <Eye className="h-4 w-4" />
                      Publish Grades
                    </button>
                    <button
                      type="button"
                      onClick={() => reopenWindow(win)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-secondary hover:text-secondary"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reopen
                    </button>
                  </>
                )}
                {win.status === 'PUBLISHED' && (
                  <>
                    <span className="flex items-center gap-1 text-sm font-medium text-active">
                      <CheckCircle className="h-4 w-4" />
                      Grades Published
                    </span>
                    <button
                      type="button"
                      onClick={() => beginUnpublish(win)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-pending/30 bg-pending/10 px-2.5 py-1.5 text-xs font-semibold text-pending hover:bg-pending/20"
                    >
                      <Eye className="h-4 w-4" />
                      Unpublish
                    </button>
                    <button
                      type="button"
                      onClick={() => reopenWindow(win)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-secondary hover:text-secondary"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reopen
                    </button>
                  </>
                )}
                {(win.status === 'CLOSED' || win.status === 'PUBLISHED') && (
                  <Link
                    href={`/government/school-admin/academic-grading/windows/grades?id=${win.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-secondary hover:text-secondary"
                  >
                    <FileText className="h-4 w-4" />
                    View Grades
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
