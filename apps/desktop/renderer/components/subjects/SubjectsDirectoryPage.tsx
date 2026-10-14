'use client';
import { useState, type FormEvent } from 'react';
import type { SubjectRowView } from '@nemis-desktop/presentation';
import { Card, Drawer, Input } from '@nemis-desktop/ui';
import { Plus, Trash2, Edit, BookOpen, RotateCcw } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

/** One subject being typed in the multi-row create drawer. `error` is the
 * save result for this row; validation errors are computed, not stored. */
export interface SubjectDraftRow {
  key: string;
  name: string;
  code: string;
  description: string;
  error?: string;
}

const makeKey = () => Math.random().toString(36).slice(2, 10);
const emptyRow = (): SubjectDraftRow => ({ key: makeKey(), name: '', code: '', description: '' });
const isBlank = (row: SubjectDraftRow) => !row.name.trim() && !row.code.trim() && !row.description.trim();

/** Client-side checks for the create drawer: row key → message for rows that
 * cannot be sent. Fully blank rows are skipped, not errors. Codes compare
 * trimmed + uppercased, the same way CreateSubjectUseCase does. */
export function validateDraftRows(rows: readonly SubjectDraftRow[]): Map<string, string> {
  const errors = new Map<string, string>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (isBlank(row)) continue;
    const code = row.code.trim().toUpperCase();
    if (!row.name.trim() || !code) {
      errors.set(row.key, 'Name and code are required');
      continue;
    }
    if (seen.has(code)) errors.set(row.key, 'Duplicate code in this batch');
    seen.add(code);
  }
  return errors;
}

/** Subjects — mirrors portal-web's Subject Management page (dark header
 * band, all-subjects table, create/edit drawer). The create drawer takes
 * several subjects at once: rows are checked here, codes already on the
 * device are caught by vm.createSubjects, and only failed rows stay open.
 * Web's "Bulk Import" (.xlsx upload) has no equivalent here; edit and
 * deactivate stay single-subject. */
export function SubjectsDirectoryPage() {
  const vm = useAcademicFoundationViewModel();
  const state = useViewModel(vm.store, (s) => s.subjects);
  const filters = useViewModel(vm.store, (s) => s.subjectFilters);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRowView | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<SubjectDraftRow[]>(() => [emptyRow()]);
  const [showValidation, setShowValidation] = useState(false);
  const [saving, setSaving] = useState(false);

  useRevalidateOnSync(() => {
    void vm.loadSubjects();

  }, []);

  const begin = (item?: SubjectRowView) => {
    setEditing(item ?? null);
    setName(item?.name ?? '');
    setCode(item?.code ?? '');
    setDescription(item?.description ?? '');
    setRows([emptyRow()]);
    setShowValidation(false);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
  };

  const validationErrors = showValidation ? validateDraftRows(rows) : new Map<string, string>();
  const countedRows = rows.filter((row) => !isBlank(row)).length;

  /** Editing a row drops its stale save error. */
  const updateRow = (key: string, patch: Partial<Pick<SubjectDraftRow, 'name' | 'code' | 'description'>>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch, error: undefined } : row)));
  const removeRow = (key: string) => setRows((prev) => prev.filter((row) => row.key !== key));
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const submitEdit = async (item: SubjectRowView) => {
    setSaving(true);
    const result = await vm.updateSubject({ id: item.id, name, code, description: description || null });
    setSaving(false);
    if (result.ok) closeDrawer();
  };

  const submitCreate = async () => {
    setShowValidation(true);
    if (validateDraftRows(rows).size > 0) return;
    const toSend = rows.filter((row) => !isBlank(row));
    if (toSend.length === 0) return;
    setSaving(true);
    const outcomes = await vm.createSubjects(
      toSend.map((row) => ({ name: row.name, code: row.code, description: row.description || undefined })),
    );
    setSaving(false);
    const failedRows = toSend.flatMap((row, i) => {
      const outcome = outcomes[i];
      return outcome && !outcome.ok ? [{ ...row, error: outcome.error.userMessage }] : [];
    });
    if (failedRows.length === 0) closeDrawer();
    else setRows(failedRows);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void (editing ? submitEdit(editing) : submitCreate());
  };

  const isLoading = state.status === 'loading' || state.status === 'idle';
  const subjects = state.status === 'success' || state.status === 'refreshing' ? state.data : [];

  const submitLabel = saving
    ? 'Saving...'
    : editing
      ? 'Update'
      : countedRows <= 1
        ? 'Create subject'
        : `Create ${countedRows} subjects`;

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-primary px-6 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Subject Management</h1>
          <p className="text-sm text-slate-300">Create subjects, then assign them to classes to build each class&apos;s curriculum.</p>
        </div>
        <button
          onClick={() => begin()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-500 rounded-button hover:bg-slate-700"
        >
          <Plus className="w-4 h-4" />
          New Subject
        </button>
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="bg-white border border-slate-300 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            placeholder="Search by name or code"
            value={filters.keyword ?? ''}
            onChange={(e) => {
              vm.setSubjectFilters({ ...filters, keyword: e.target.value });
              void vm.loadSubjects();
            }}
          />
          <label className="text-sm flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={filters.includeInactive ?? false}
              onChange={(e) => {
                vm.setSubjectFilters({ ...filters, includeInactive: e.target.checked });
                void vm.loadSubjects();
              }}
            />
            Include deactivated subjects
          </label>
        </div>

        <Card bordered={false}>
          <h2 className="text-base font-semibold text-gray-900 mb-4">All Subjects</h2>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : subjects.length === 0 ? (
            <div className="text-center py-10">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No subjects yet. Create the first one above.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Classes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subjects.map((subject) => (
                  <tr key={subject.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{subject.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 font-mono">{subject.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{subject.description || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{subject.classCount}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${subject.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {subject.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => begin(subject)} className="text-sky-700 hover:text-sky-900 p-1" title="Edit subject">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`${subject.isActive ? 'Deactivate' : 'Restore'} ${subject.name}?`)) void vm.setSubjectActive(subject.id, !subject.isActive);
                          }}
                          className="text-gray-500 hover:text-red-600 p-1"
                          title={subject.isActive ? 'Deactivate subject' : 'Restore subject'}
                        >
                          {subject.isActive ? <Trash2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Drawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        title={editing ? 'Edit Subject' : 'New Subjects'}
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={closeDrawer}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="subject-form"
              disabled={saving || (!editing && countedRows === 0)}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {submitLabel}
            </button>
          </>
        }
      >
        <form id="subject-form" onSubmit={submit} className="space-y-4">
          {editing ? (
            <>
              <Input
                label="Subject Name"
                type="text"
                required
                placeholder="e.g., Mathematics"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                label="Subject Code"
                type="text"
                required
                placeholder="e.g., MATH101"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  rows={3}
                  placeholder="Brief description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 text-sm"
                />
              </div>
            </>
          ) : (
            <>
              {rows.map((row, i) => {
                const rowNumber = i + 1;
                const error = validationErrors.get(row.key) ?? row.error;
                return (
                  <div
                    key={row.key}
                    className={`rounded-lg border p-3 space-y-3 ${error ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="grid flex-1 grid-cols-2 gap-3">
                        <Input
                          label="Subject Name"
                          aria-label={`Subject Name (row ${rowNumber})`}
                          type="text"
                          placeholder="e.g., Mathematics"
                          value={row.name}
                          onChange={(e) => updateRow(row.key, { name: e.target.value })}
                        />
                        <Input
                          label="Subject Code"
                          aria-label={`Subject Code (row ${rowNumber})`}
                          type="text"
                          placeholder="e.g., MATH101"
                          value={row.code}
                          onChange={(e) => updateRow(row.key, { code: e.target.value })}
                        />
                      </div>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          title="Remove row"
                          aria-label={`Remove row ${rowNumber}`}
                          className="mt-8 p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <Input
                      label="Description"
                      aria-label={`Description (row ${rowNumber})`}
                      type="text"
                      placeholder="Brief description (optional)"
                      value={row.description}
                      onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    />
                    {error && (
                      <p role="alert" className="text-xs text-red-600">
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-900"
              >
                <Plus className="w-4 h-4" />
                Add another subject
              </button>
            </>
          )}
        </form>
      </Drawer>
    </div>
  );
}
