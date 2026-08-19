'use client';
import { useState, type FormEvent } from 'react';
import type { SubjectRowView } from '@nemis-desktop/presentation';
import { Card, Drawer, Input } from '@nemis-desktop/ui';
import { Plus, Trash2, Edit, BookOpen, RotateCcw } from 'lucide-react';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel } from '@/lib/presentation/hooks/school-admin';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';

/** Subjects — mirrors portal-web's Subject Management page (dark header
 * band, all-subjects table, create/edit drawer). Web's "Bulk Import" (.xlsx
 * upload) has no equivalent mutation on this device, so it's dropped rather
 * than faked; single create/edit/deactivate all use the real ViewModel. */
export function SubjectsDirectoryPage() {
  const vm = useAcademicFoundationViewModel();
  const state = useViewModel(vm.store, (s) => s.subjects);
  const filters = useViewModel(vm.store, (s) => s.subjectFilters);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectRowView | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useRevalidateOnSync(() => {
    void vm.loadSubjects();
     
  }, []);

  const begin = (item?: SubjectRowView) => {
    setEditing(item ?? null);
    setName(item?.name ?? '');
    setCode(item?.code ?? '');
    setDescription(item?.description ?? '');
    setDrawerOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = editing
      ? await vm.updateSubject({ id: editing.id, name, code, description: description || null })
      : await vm.createSubject({ name, code, description: description || undefined });
    setSaving(false);
    if (result.ok) {
      setDrawerOpen(false);
      setEditing(null);
    }
  };

  const isLoading = state.status === 'loading' || state.status === 'idle';
  const subjects = state.status === 'success' || state.status === 'refreshing' ? state.data : [];

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
        onClose={() => {
          setDrawerOpen(false);
          setEditing(null);
        }}
        title={editing ? 'Edit Subject' : 'New Subject'}
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="subject-form"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </button>
          </>
        }
      >
        <form id="subject-form" onSubmit={(e) => void submit(e)} className="space-y-4">
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
        </form>
      </Drawer>
    </div>
  );
}
