'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Copy, Edit2, Hash, Plus, Trash2, X } from 'lucide-react';
import { Card, Button, Drawer, Spinner } from '@nemis-desktop/ui';
import { PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useTeachingAssignmentViewModel } from '@/lib/presentation/hooks/school-admin';
import { useViewModel } from '@/hooks/use-view-model';
import { sharedBridge } from '@/services/nemis-bridge/shared';
import { rows } from '@/components/teachers/shared';
import {
  type AssessmentTemplateRow,
  listTemplatesForSubject,
  totalWeight,
} from '@/components/academic-grading/assessments';

const CHART_COLORS = ['#000e21', '#26556A', '#146316', '#a6731c', '#8099A8', '#c10021'];

const ASSESSMENT_TYPES = [
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'TEST', label: 'Test' },
  { value: 'ASSIGNMENT', label: 'Assignment' },
  { value: 'LAB', label: 'Lab' },
  { value: 'PRACTICAL', label: 'Practical' },
];

interface TemplateFormData {
  name: string;
  type: string;
  totalMarks: string;
  weight: string;
  date: string;
}

function emptyFormData(): TemplateFormData {
  return { name: '', type: 'QUIZ', totalMarks: '', weight: '', date: new Date().toISOString().slice(0, 10) };
}

interface BulkRow {
  id: string;
  name: string;
  type: string;
  totalMarks: string;
  weight: string;
  date: string;
}

const makeRowId = () => Math.random().toString(36).slice(2, 9);
function emptyBulkRow(): BulkRow {
  return { id: makeRowId(), name: '', type: 'QUIZ', totalMarks: '', weight: '', date: new Date().toISOString().slice(0, 10) };
}

interface ClassOption {
  classId: string;
  label: string;
  subjects: { id: string; name: string }[];
}

/** Teacher's per-class/subject weighted assessment template setup — mirrors
 * portal-web's grades/templates/page.tsx. Templates are reusable
 * definitions (see design doc); scoring them per grading period happens on
 * the main Gradebook page, not here. */
export default function AssessmentSetupPage() {
  const currentUser = useCurrentUserViewModel();
  const teachingAssignments = useTeachingAssignmentViewModel();

  const user = useViewModel(currentUser.store, (s) => s.user);
  const assignments = useViewModel(teachingAssignments.store, (s) => s.assignments);

  const userId = user.status === 'success' ? user.data.id : undefined;
  const [staffId, setStaffId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void sharedBridge.listSchoolAdminRecords({ collection: 'staff', limit: 250 }).then((result) => {
      if (cancelled) return;
      const mine = result.items.find((r) => r.userId === userId);
      setStaffId(mine ? String(mine.id) : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (staffId && assignments.status === 'idle') void teachingAssignments.load(staffId);
  }, [staffId, assignments.status, teachingAssignments]);

  const myClasses = useMemo<ClassOption[]>(() => {
    const byClass = new Map<string, ClassOption>();
    for (const a of rows(assignments)) {
      const existing = byClass.get(a.classId);
      const label = `${a.className}${a.section ? ` — ${a.section}` : ''}`;
      if (existing) {
        if (a.subjectId && a.subjectName && !existing.subjects.some((s) => s.id === a.subjectId)) {
          existing.subjects.push({ id: a.subjectId, name: a.subjectName });
        }
      } else {
        byClass.set(a.classId, {
          classId: a.classId,
          label,
          subjects: a.subjectId && a.subjectName ? [{ id: a.subjectId, name: a.subjectName }] : [],
        });
      }
    }
    return Array.from(byClass.values());
  }, [assignments]);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const selectedClass = myClasses.find((c) => c.classId === selectedClassId);

  const [templates, setTemplates] = useState<AssessmentTemplateRow[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(emptyFormData());
  const [saving, setSaving] = useState(false);

  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow()]);
  const [bulkErrors, setBulkErrors] = useState<Record<string, Record<string, string>>>({});
  const [bulkSaving, setBulkSaving] = useState(false);

  const handleBulkRowChange = (id: string, field: keyof Omit<BulkRow, 'id'>, value: string) =>
    setBulkRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const handleAddBulkRow = () => setBulkRows((prev) => [...prev, emptyBulkRow()]);

  const handleRemoveBulkRow = (id: string) => {
    setBulkRows((prev) => prev.filter((r) => r.id !== id));
    setBulkErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const liveWeight = bulkRows.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0);

  const handleBulkSubmit = async () => {
    const errors: Record<string, Record<string, string>> = {};
    bulkRows.forEach((row) => {
      const e: Record<string, string> = {};
      if (!row.name.trim()) e.name = 'Required';
      if (!row.date) e.date = 'Required';
      const marks = parseFloat(row.totalMarks);
      if (!row.totalMarks || Number.isNaN(marks) || marks <= 0) e.totalMarks = 'Must be > 0';
      if (Object.keys(e).length > 0) errors[row.id] = e;
    });
    setBulkErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBulkSaving(true);
    try {
      for (const row of bulkRows) {
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'assessment_templates',
          record: {
            classId: selectedClassId,
            subjectId: selectedSubjectId,
            name: row.name.trim(),
            type: row.type,
            totalMarks: parseFloat(row.totalMarks),
            weight: row.weight ? parseFloat(row.weight) : null,
            date: row.date,
          },
        });
      }
      setBulkRows([emptyBulkRow()]);
      setBulkErrors({});
      setIsDrawerOpen(false);
      setReloadToken((t) => t + 1);
    } finally {
      setBulkSaving(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyFormData());
    setEditingId(null);
    setIsDrawerOpen(false);
  };

  const handleEdit = (template: AssessmentTemplateRow) => {
    setEditingId(template.id);
    setFormData({
      name: template.name,
      type: template.type,
      totalMarks: String(template.totalMarks),
      weight: template.weight != null ? String(template.weight) : '',
      date: template.date.slice(0, 10),
    });
    setIsDrawerOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await sharedBridge.saveSchoolAdminRecord({
        collection: 'assessment_templates',
        record: {
          ...(editingId ? { id: editingId } : {}),
          classId: selectedClassId,
          subjectId: selectedSubjectId,
          name: formData.name,
          type: formData.type,
          totalMarks: Number(formData.totalMarks),
          weight: formData.weight ? Number(formData.weight) : null,
          date: formData.date,
        },
      });
      resetForm();
      setReloadToken((t) => t + 1);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await sharedBridge.deleteSchoolAdminRecord({ collection: 'assessment_templates', id });
    setReloadToken((t) => t + 1);
  };

  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const [copyTargetSubjectId, setCopyTargetSubjectId] = useState('');
  const [isCopying, setIsCopying] = useState(false);

  const handleCopyToSubject = async () => {
    if (!copyTargetSubjectId || templates.length === 0) return;
    setIsCopying(true);
    try {
      const targetTemplates = await listTemplatesForSubject(selectedClassId, copyTargetSubjectId);
      for (const template of templates) {
        const existing = targetTemplates.find((t) => t.name.toLowerCase() === template.name.toLowerCase());
        await sharedBridge.saveSchoolAdminRecord({
          collection: 'assessment_templates',
          record: {
            ...(existing ? { id: existing.id } : {}),
            classId: selectedClassId,
            subjectId: copyTargetSubjectId,
            name: template.name,
            type: template.type,
            totalMarks: template.totalMarks,
            weight: template.weight,
            date: template.date,
          },
        });
      }
      setIsCopyOpen(false);
      setCopyTargetSubjectId('');
    } finally {
      setIsCopying(false);
    }
  };

  useEffect(() => {
    if (!selectedClassId || !selectedSubjectId) {
      setTemplates([]);
      return;
    }
    let cancelled = false;
    setLoadingTemplates(true);
    void listTemplatesForSubject(selectedClassId, selectedSubjectId).then((rows_) => {
      if (cancelled) return;
      setTemplates(rows_);
      setLoadingTemplates(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedClassId, selectedSubjectId, reloadToken]);

  const weight = totalWeight(templates);
  const isWeightValid = Math.abs(weight - 100) < 0.01;

  const chartData = useMemo(() => {
    const data = templates.map((t) => ({ name: t.name, value: t.weight ?? 0 }));
    if (weight < 100) data.push({ name: 'Unassigned', value: 100 - weight });
    return data;
  }, [templates, weight]);

  return (
    <div className="min-h-full bg-slate-100">
      <div className="px-6 py-6 space-y-5">
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Class</label>
              <select
                value={selectedClassId}
                onChange={(e) => {
                  setSelectedClassId(e.target.value);
                  setSelectedSubjectId('');
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-secondary"
              >
                <option value="">Choose a class</option>
                {myClasses.map((cls) => (
                  <option key={cls.classId} value={cls.classId}>{cls.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                disabled={!selectedClassId}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-secondary disabled:bg-slate-100"
              >
                <option value="">Choose a subject</option>
                {(selectedClass?.subjects ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {!selectedClassId || !selectedSubjectId ? (
          <Card>
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-lg">
              <p className="text-slate-500">Select a class and subject to manage assessments.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <Card title="Weight Distribution">
                <div className="h-64 w-full">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                        {chartData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={entry.name === 'Unassigned' ? '#E0E0E0' : CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 text-center">
                  <h3 className={`text-2xl font-bold ${isWeightValid ? 'text-active' : 'text-pending'}`}>
                    {weight.toFixed(1)}%
                  </h3>
                  <p className="text-sm text-slate-600">Total Weight Assigned</p>
                  {!isWeightValid ? (
                    <p className="text-xs text-pending mt-1 flex items-center justify-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Total weight should be 100%.
                    </p>
                  ) : (
                    <p className="text-xs text-active mt-1 flex items-center justify-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Weight distribution is valid.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card title={`Assessments (${templates.length})`}>
                <div className="flex justify-end gap-2 mb-3">
                  {templates.length > 0 && (
                    <Button variant="secondary" onClick={() => { setCopyTargetSubjectId(''); setIsCopyOpen(true); }}>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy to Subject
                    </Button>
                  )}
                  <Button onClick={() => { setEditingId(null); setBulkRows([emptyBulkRow()]); setBulkErrors({}); setIsDrawerOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Assessment
                  </Button>
                </div>
                {loadingTemplates ? (
                  <div className="flex justify-center py-12"><Spinner size="lg" /></div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
                    <p className="text-slate-500">No assessments found.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {templates.map((template) => (
                      <div key={template.id} className="flex items-start justify-between p-3 rounded-md border border-slate-300">
                        <div>
                          <h4 className="font-semibold text-slate-800">{template.name}</h4>
                          <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                            <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> {template.totalMarks} marks</span>
                            {template.weight != null && <span className="font-medium text-primary">{template.weight}%</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="secondary" size="sm" onClick={() => handleEdit(template)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => void handleDelete(template.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>

      <Drawer
        isOpen={isDrawerOpen}
        onClose={resetForm}
        title={editingId ? 'Edit Assessment' : 'Add Assessments'}
        size={editingId ? 'md' : 'lg'}
        footer={
          editingId ? (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>Cancel</Button>
              <Button type="submit" form="assessment-template-form" disabled={saving}>
                {saving ? 'Saving...' : 'Update Assessment'}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={resetForm} disabled={bulkSaving}>Cancel</Button>
              <Button type="button" onClick={() => void handleBulkSubmit()} disabled={bulkSaving || bulkRows.length === 0}>
                {bulkSaving ? 'Creating...' : `Create ${bulkRows.length} Assessment${bulkRows.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          )
        }
      >
        {editingId ? (
          <form id="assessment-template-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Quiz 1, Midterm Exam"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                {ASSESSMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Total Marks *</label>
              <input
                type="number"
                value={formData.totalMarks}
                onChange={(e) => setFormData({ ...formData, totalMarks: e.target.value })}
                min="0"
                step="0.1"
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Weight (%)</label>
              <input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                min="0"
                max="100"
                step="0.1"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date *</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Total weight across all rows</span>
              <span className={`font-bold ${Math.abs(liveWeight - 100) < 0.01 ? 'text-active' : 'text-pending'}`}>
                {liveWeight.toFixed(1)}%
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 pr-2 font-medium min-w-[140px]">Name *</th>
                    <th className="text-left py-2 pr-2 font-medium min-w-[110px]">Type</th>
                    <th className="text-left py-2 pr-2 font-medium min-w-[80px]">Marks *</th>
                    <th className="text-left py-2 pr-2 font-medium min-w-[70px]">Weight %</th>
                    <th className="text-left py-2 pr-2 font-medium min-w-[130px]">Date *</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((row) => {
                    const errs = bulkErrors[row.id] ?? {};
                    return (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2">
                          <input type="text" value={row.name} onChange={(e) => handleBulkRowChange(row.id, 'name', e.target.value)} placeholder="Quiz 1" className={`w-full px-2 py-1.5 border rounded text-sm ${errs.name ? 'border-red-400' : 'border-slate-300'}`} />
                          {errs.name && <p className="text-xs text-red-600 mt-0.5">{errs.name}</p>}
                        </td>
                        <td className="py-1.5 pr-2">
                          <select value={row.type} onChange={(e) => handleBulkRowChange(row.id, 'type', e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm">
                            {ASSESSMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </td>
                        <td className="py-1.5 pr-2">
                          <input type="number" value={row.totalMarks} onChange={(e) => handleBulkRowChange(row.id, 'totalMarks', e.target.value)} placeholder="100" min="0" step="0.1" className={`w-full px-2 py-1.5 border rounded text-sm ${errs.totalMarks ? 'border-red-400' : 'border-slate-300'}`} />
                          {errs.totalMarks && <p className="text-xs text-red-600 mt-0.5">{errs.totalMarks}</p>}
                        </td>
                        <td className="py-1.5 pr-2">
                          <input type="number" value={row.weight} onChange={(e) => handleBulkRowChange(row.id, 'weight', e.target.value)} placeholder="20" min="0" max="100" step="0.1" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
                        </td>
                        <td className="py-1.5 pr-2">
                          <input type="date" value={row.date} onChange={(e) => handleBulkRowChange(row.id, 'date', e.target.value)} className={`w-full px-2 py-1.5 border rounded text-sm ${errs.date ? 'border-red-400' : 'border-slate-300'}`} />
                          {errs.date && <p className="text-xs text-red-600 mt-0.5">{errs.date}</p>}
                        </td>
                        <td className="py-1.5">
                          <button type="button" onClick={() => handleRemoveBulkRow(row.id)} disabled={bulkRows.length === 1} className="text-red-400 disabled:opacity-30 p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={handleAddBulkRow}>
              <Plus className="w-4 h-4 mr-1" />
              Add Row
            </Button>
          </div>
        )}
      </Drawer>

      {isCopyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">Copy to Subject</h3>
              <button onClick={() => setIsCopyOpen(false)} className="p-1 rounded text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-500">
              All {templates.length} assessment(s) from the current subject will be copied to the subject you select below.
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Target Subject *</label>
              <select
                value={copyTargetSubjectId}
                onChange={(e) => setCopyTargetSubjectId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">— Select a subject —</option>
                {(selectedClass?.subjects ?? [])
                  .filter((s) => s.id !== selectedSubjectId)
                  .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setIsCopyOpen(false)} disabled={isCopying}>Cancel</Button>
              <Button onClick={() => void handleCopyToSubject()} disabled={!copyTargetSubjectId || isCopying}>
                {isCopying ? 'Copying…' : (<><Copy className="w-4 h-4 mr-2" />Copy</>)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
