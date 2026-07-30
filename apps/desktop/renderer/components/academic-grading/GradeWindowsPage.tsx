'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle, Eye, FileText, Lock, Plus, RotateCcw, Unlock } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel, useAcademicYearViewModel } from '@/lib/presentation/hooks/school-admin';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import type { SchoolAdminRecord } from '@nemis-desktop/types';
import { formatDateShort, listAllWindows, listPeriodsForTerm, WINDOW_STATUS_CHIP, WINDOW_STATUS_RAIL } from './shared';

const EMPTY_FORM = { gradingPeriodId: '', name: '', description: '', openDate: '', closeDate: '' };

/** Dedicated Grade Entry Windows page — mirrors portal-web's
 * academic-grading/windows/page.tsx lifecycle (DRAFT -> OPEN -> CLOSED ->
 * PUBLISHED, with Reopen/Unpublish), all against the real, mutable
 * grade_entry_windows table via the generic offline collection API. */
export function GradeWindowsPage() {
  const academicYear = useAcademicYearViewModel();
  const foundation = useAcademicFoundationViewModel();
  const year = useViewModel(academicYear.store, (s) => s.current);
  const terms = useViewModel(foundation.store, (s) => s.terms);

  const [windows, setWindows] = useState<SchoolAdminRecord[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTermId, setSelectedTermId] = useState('');
  const [periods, setPeriods] = useState<SchoolAdminRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [unpublishTarget, setUnpublishTarget] = useState<string | null>(null);
  const [unpublishInput, setUnpublishInput] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const reload = async () => setWindows(await listAllWindows());

  useEffect(() => {
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

  const termOptions = terms.status === 'success' || terms.status === 'refreshing' ? terms.data : [];

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
          allowedRoles: null,
        },
      });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setSelectedTermId('');
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

  const confirmUnpublish = async () => {
    const win = (windows ?? []).find((w) => w.id === unpublishTarget);
    if (!win) return;
    await transition(win, { status: 'CLOSED' });
    setUnpublishTarget(null);
    setUnpublishInput('');
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between bg-primary px-6 py-5 text-white">
        <div>
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-slate-400">School Admin Portal</p>
          <h1 className="text-xl font-bold">Grade Entry Windows</h1>
        </div>
      </div>

      <div className="space-y-5 px-6 py-6">
        <div className="flex items-center justify-between">
          <p className="text-slate-600">Control when teachers can enter grades</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-400"
          >
            <Plus className="h-4 w-4" />
            Create Window
          </button>
        </div>

        <div className="rounded-lg border border-slate-300 bg-white">
          <div className="bg-secondary/30 px-6 py-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600">Active Windows</h3>
          </div>
          <div className="p-6">
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
                        <h3 className="font-semibold text-slate-900">{String(win.name)}</h3>
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
                            onClick={() => {
                              setUnpublishTarget(String(win.id));
                              setUnpublishInput('');
                            }}
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
        </div>

        {unpublishTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/60 p-4">
            <div className="w-full max-w-md space-y-4 border border-slate-300 bg-white p-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Unpublish Grades</h2>
                <p className="mt-1 text-sm text-slate-600">
                  This will hide all grades from students and move the window back to{' '}
                  <span className="font-medium">Closed</span> status. Grades remain saved and can be re-published at
                  any time.
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Type{' '}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-error">
                    unpublish this window
                  </span>{' '}
                  to confirm
                </label>
                <input
                  type="text"
                  value={unpublishInput}
                  onChange={(e) => setUnpublishInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && unpublishInput === 'unpublish this window') void confirmUnpublish();
                  }}
                  placeholder="unpublish this window"
                  autoFocus
                  className="w-full rounded-full border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-error focus:ring-2 focus:ring-error"
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setUnpublishTarget(null);
                    setUnpublishInput('');
                  }}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={unpublishInput !== 'unpublish this window'}
                  onClick={() => void confirmUnpublish()}
                  className="rounded-full bg-error px-4 py-2 text-sm font-medium text-white hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Unpublish
                </button>
              </div>
            </div>
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/60 p-4">
            <div className="w-full max-w-2xl border border-slate-300 bg-white p-6">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">Create Grade Entry Window</h2>
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

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Window Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g., Period 1 Grade Entry"
                    required
                    className="w-full rounded-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
                  />
                </div>

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
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Open Date</label>
                    <input
                      type="date"
                      value={form.openDate}
                      onChange={(e) => setForm((f) => ({ ...f, openDate: e.target.value }))}
                      required
                      className="w-full rounded-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">Close Date</label>
                    <input
                      type="date"
                      value={form.closeDate}
                      onChange={(e) => setForm((f) => ({ ...f, closeDate: e.target.value }))}
                      required
                      className="w-full rounded-full border border-slate-300 px-3 py-2 text-sm outline-none focus:border-secondary focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
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
          </div>
        )}
      </div>
    </div>
  );
}
