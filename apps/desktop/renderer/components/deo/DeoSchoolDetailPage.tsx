'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Building2, Users, GraduationCap, CheckCircle, TrendingUp } from 'lucide-react';
import type { DeoSchoolDetail } from '@nemis-desktop/types';
import { useDeoSchoolDetailViewModel } from '@/lib/presentation/hooks/deo';
import { useQueryParam } from '@/hooks/use-query-param';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { deoGradeLabel } from './deo-grade-label';

const COMPLIANCE_CHIP: Record<string, string> = {
  Compliant: 'bg-emerald-900 text-emerald-300',
  'Needs Review': 'bg-amber-900 text-amber-300',
  Flagged: 'bg-red-900 text-red-300',
};

function formatLevel(level: string): string {
  return level
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Width of a bar as a percentage; never NaN or above 100.
function percentOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
}

function StateMessage({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center justify-center h-64 gap-3">{children}</div>;
}

function Message({ text }: { text: string }) {
  return (
    <StateMessage>
      <p className="text-gray-600">{text}</p>
    </StateMessage>
  );
}

export function DeoSchoolDetailPage() {
  const router = useRouter();
  const id = useQueryParam('id');
  const vm = useDeoSchoolDetailViewModel();
  const detail = useViewModel(vm.store, (s) => s.detail);
  const requestedId = useViewModel(vm.store, (s) => s.requestedId);

  useRevalidateOnSync(() => {
    if (id) void vm.load(id);
  }, [vm, id]);

  if (!id) return <Message text="School not found in your district." />;
  // The view model outlives the page: never show the previously opened school.
  if (requestedId !== id || detail.status === 'idle' || detail.status === 'loading') {
    return <Message text="Loading school…" />;
  }
  if (detail.status === 'error') {
    return (
      <StateMessage>
        <p className="text-gray-600">Could not load this school.</p>
        <button
          onClick={() => void vm.load(id)}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors"
        >
          Retry
        </button>
      </StateMessage>
    );
  }
  const data = detail.status === 'success' || detail.status === 'refreshing' ? detail.data : null;
  if (!data) return <Message text="School not found in your district." />;
  if (data.districtId === null) return <Message text="No district is assigned to your account." />;
  if (data.school === null) {
    return detail.status === 'success' ? (
      <Message text="School not found in your district." />
    ) : (
      <Message text="Loading school…" />
    );
  }
  if (data.school.id !== id) return <Message text="Loading school…" />;

  return <SchoolDetail school={data.school} onBack={() => router.back()} />;
}

function SchoolDetail({ school, onBack }: { school: DeoSchoolDetail; onBack: () => void }) {
  const headerLine = [
    school.levels.map(formatLevel).join(' / '),
    school.address ?? '',
    school.establishedYear != null ? `Est. ${school.establishedYear}` : '',
  ]
    .filter((part) => part.length > 0)
    .join(' · ');
  const attendance = school.attendanceRate != null ? `${school.attendanceRate}%` : null;
  const average = school.academic.averageScore != null ? `${school.academic.averageScore}%` : null;
  const fee = school.feeCollectionRate;
  const maxGradeStudents = Math.max(...school.enrollmentByGrade.map((g) => g.students), 1);
  const reportsSubmitted = school.reportMonths.filter(Boolean).length;

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Schools
          </button>
          <div className="w-px h-4 bg-slate-700" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
              DEO Portal · School Detail
            </p>
            <h1 className="text-xl font-bold text-white">{school.name}</h1>
          </div>
        </div>
        <span
          className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${COMPLIANCE_CHIP[school.complianceStatus] ?? ''}`}
        >
          {school.complianceStatus}
        </span>
      </div>

      <div className="px-6 py-6 space-y-5">
        {/* School Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Building2 className="w-8 h-8 text-slate-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{school.name}</h2>
                  <p className="text-sm text-slate-500 mt-1">{headerLine}</p>
                  <p className="text-sm text-sky-700 font-medium mt-1">
                    Principal: {school.principalName ?? 'Not recorded'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{school.students}</p>
            <p className="text-sm font-medium text-gray-900 mb-1">Total Students</p>
            <p className="text-xs text-sky-600 font-medium">District enrollment</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-pink-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{school.teachers}</p>
            <p className="text-sm font-medium text-gray-900 mb-1">Total Teachers</p>
            <p className="text-xs text-sky-600 font-medium">Active staff</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{attendance ?? 'No data'}</p>
            <p className="text-sm font-medium text-gray-900 mb-1">Attendance</p>
            <p className="text-xs text-sky-600 font-medium">School average</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-cyan-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{average ?? 'No data'}</p>
            <p className="text-sm font-medium text-gray-900 mb-1">Performance Avg</p>
            <p className="text-xs text-sky-600 font-medium">Academic metrics</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Enrollment by Grade */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Enrollment by Grade</h3>
            <div className="space-y-3">
              {school.enrollmentByGrade.length > 0 ? (
                school.enrollmentByGrade.map((item, index) => (
                  <div key={item.gradeLevel ?? `none-${index}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700">
                        {deoGradeLabel(item.gradeLevel)}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{item.students}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-8">
                      <div
                        className="bg-sky-600 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                        style={{ width: `${percentOf(item.students, maxGradeStudents)}%` }}
                      >
                        {item.students}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No enrollment data available</p>
              )}
            </div>
          </div>

          {/* Gender Distribution */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Gender Distribution</h3>
            {school.students > 0 ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Male</span>
                    <span className="text-sm font-semibold text-gray-900">{school.gender.male}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-6">
                    <div
                      className="bg-blue-500 h-6 rounded-full"
                      style={{ width: `${percentOf(school.gender.male, school.students)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Female</span>
                    <span className="text-sm font-semibold text-gray-900">{school.gender.female}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-6">
                    <div
                      className="bg-pink-500 h-6 rounded-full"
                      style={{ width: `${percentOf(school.gender.female, school.students)}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No data</p>
            )}
          </div>
        </div>

        {/* Additional Info Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fee Compliance */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Fee Compliance</h3>
            {fee != null ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className="bg-orange-500 h-4 rounded-full"
                        style={{ width: `${percentOf(fee, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-2xl font-bold text-gray-900">{fee}%</span>
                </div>
                <p className="text-xs text-gray-600 mt-2">Fees collected relative to target</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No fees billed this year</p>
            )}
          </div>

          {/* Reports */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Reports</h3>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {school.reportMonths.map((submitted, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full ${submitted ? 'bg-green-500' : 'bg-gray-300'}`}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-gray-900">
                {reportsSubmitted}/{school.reportMonths.length} submitted
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {reportsSubmitted}/{school.reportMonths.length} months with a submitted report
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
