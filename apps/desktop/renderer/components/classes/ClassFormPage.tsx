'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { type GradeLevel as GradeLevelValue } from '@nemis-desktop/types';
import { useViewModel } from '@/hooks/use-view-model';
import { useAcademicFoundationViewModel, useAcademicYearViewModel, useSettingsViewModel } from '@/lib/presentation/hooks';
import { ArrowLeft, Check } from 'lucide-react';
import { formatGrade, GRADE_GROUPS } from './shared';

/** Create Class — mirrors portal-web's create page (grade-level picker with
 * live name preview, section/capacity fields, header band). Desktop groups
 * the real GradeLevel enum into "Early Years" / "Grades 1-12" instead of
 * web's subscription-driven "allowed grades" list, since no such concept
 * exists on this device. */
export function ClassFormPage() {
  const router = useRouter();
  const vm = useAcademicFoundationViewModel();
  const academicYear = useAcademicYearViewModel();
  const settings = useSettingsViewModel();

  const years = useViewModel(vm.store, (s) => s.academicYears);
  const currentYear = useViewModel(academicYear.store, (s) => s.current);
  const profile = useViewModel(settings.store, (s) => s.profile);

  const [selectedGrade, setSelectedGrade] = useState<GradeLevelValue | null>(null);
  const [section, setSection] = useState('');
  const [capacity, setCapacity] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void vm.loadAcademicYears();
    void academicYear.loadCurrent();
    void settings.loadCurrentSchool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!academicYearId && (currentYear.status === 'success' || currentYear.status === 'refreshing')) {
      setAcademicYearId(currentYear.data.id);
    }
  }, [currentYear, academicYearId]);

  const schoolName = profile.status === 'success' || profile.status === 'refreshing' ? profile.data.name : 'School';
  const yearOptions = years.status === 'success' || years.status === 'refreshing' ? years.data : [];

  const previewName = selectedGrade ? (section.trim() ? `${formatGrade(selectedGrade)} ${section.trim()}` : formatGrade(selectedGrade)) : '';

  const handleCancel = () => router.push('/government/school-admin/classes');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedGrade) {
      setError('Please select a grade level.');
      return;
    }
    if (!academicYearId) {
      setError('Please select an academic year.');
      return;
    }
    setSaving(true);
    const result = await vm.createClass({
      academicYearId,
      name: previewName,
      gradeLevel: selectedGrade,
      section: section || undefined,
      capacity: capacity ? Number(capacity) : undefined,
    });
    setSaving(false);
    if (result.ok) router.push('/government/school-admin/classes');
    else setError(result.error.userMessage);
  };

  return (
    <div className="min-h-full bg-slate-100">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">School Admin Portal</p>
          <h1 className="text-xl font-bold mt-0.5">Create Class</h1>
        </div>
        <p className="text-sm font-medium text-slate-300">{schoolName}</p>
      </div>

      <div className="px-6 py-6 space-y-5">
        <div className="mb-2">
          <button onClick={handleCancel} className="flex items-center text-gray-600 hover:text-gray-900 mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Classes
          </button>
          <p className="text-gray-600">
            Create a class to organise students who have already been onboarded. Select a grade level and optionally add a section
            (e.g. &quot;A&quot;, &quot;B&quot;, &quot;Science&quot;). Once created, go to the Unassigned Students tab to assign students to this class.
          </p>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
          <div className="bg-white border border-slate-300 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Academic Year</h2>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Academic Year <span className="text-red-500">*</span>
            </label>
            <select
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-all"
            >
              <option value="">Select Academic Year</option>
              {yearOptions.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.code} {year.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-slate-300 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Grade Level <span className="text-red-500">*</span>
            </h2>
            <p className="text-sm text-gray-600 mb-6">Select the grade level for this class.</p>
            <div className="space-y-8">
              {GRADE_GROUPS.map((group) => (
                <div key={group.label}>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">{group.label}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {group.grades.map((grade) => (
                      <button
                        key={grade}
                        type="button"
                        onClick={() => setSelectedGrade(grade)}
                        className={`relative p-4 rounded-lg border-2 transition-all duration-200 ${
                          selectedGrade === grade ? 'border-slate-900 bg-slate-900/5 shadow-md' : 'border-gray-200 bg-white hover:border-slate-900/50 hover:shadow-sm'
                        }`}
                      >
                        <p className={`text-center font-semibold ${selectedGrade === grade ? 'text-sky-700' : 'text-gray-700'}`}>{formatGrade(grade)}</p>
                        {selectedGrade === grade && (
                          <div className="absolute top-2 right-2">
                            <div className="bg-slate-900 rounded-full p-1">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-300 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Class Details</h2>
            {selectedGrade && (
              <div className="mb-6 p-4 bg-slate-900/5 border border-slate-900/20 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-1">Class Name Preview:</p>
                <p className="text-2xl font-bold text-sky-700">{previewName}</p>
                <p className="text-xs text-gray-600 mt-1">This name is generated automatically from the grade level and section.</p>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Section</label>
                <input
                  value={section}
                  onChange={(e) => setSection(e.target.value.toUpperCase())}
                  placeholder="e.g., A, B, C, Arts, Science"
                  maxLength={20}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Optional — leave blank for a single class at this grade level.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Class Capacity (Optional)</label>
                <input
                  type="number"
                  min="1"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g., 40"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex justify-end gap-4 pt-2">
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !selectedGrade}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? 'Creating Class…' : 'Create Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
