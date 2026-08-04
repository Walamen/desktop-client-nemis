'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Hash, Plus } from 'lucide-react';
import { Card, Button, Spinner } from '@nemis-desktop/ui';
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
                <div className="flex justify-end mb-3">
                  <Button onClick={() => setReloadToken((t) => t + 1)} variant="secondary">
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
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
