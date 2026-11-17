'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Megaphone,
  Search,
} from 'lucide-react';
import { Card, Spinner } from '@nemis-desktop/ui';
import {
  bannerLine,
  filterAlerts,
  filterPerformance,
  greetingFor,
  pageOf,
  type PerformanceFilter,
} from '@nemis-desktop/presentation';
import { useDeoDashboardViewModel } from '@/lib/presentation/hooks/deo';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import { YearClosuresPanel } from '@/components/year-closures/YearClosuresPanel';
import EnrollmentTrendChart from './charts/EnrollmentTrendChart';
import AttendanceTrendChart from './charts/AttendanceTrendChart';
import GenderDistributionChart from './charts/GenderDistributionChart';
import { DEOBanner } from './DEOBanner';
import { AlertsAndActions } from './AlertsAndActions';
import { SchoolsAtGlance } from './SchoolsAtGlance';

const SEVERITY_TONE: Readonly<Record<string, { row: string; chip: string }>> = {
  CRITICAL: { row: 'border-red-200 bg-red-50', chip: 'bg-red-200 text-red-800' },
  HIGH: { row: 'border-orange-200 bg-orange-50', chip: 'bg-orange-200 text-orange-800' },
  MEDIUM: { row: 'border-yellow-200 bg-yellow-50', chip: 'bg-yellow-200 text-yellow-800' },
};
const LOW_TONE = { row: 'border-blue-200 bg-blue-50', chip: 'bg-blue-200 text-blue-800' };

const PERFORMANCE_CHIP: Readonly<Record<string, string>> = {
  Good: 'bg-green-100 text-green-800',
  Warning: 'bg-yellow-100 text-yellow-800',
  Critical: 'bg-red-100 text-red-800',
};

function KpiCard({ label, value, subtitle }: { label: string; value: number | string; subtitle: string }) {
  return (
    <div data-kpi>
      <Card>
        <p className="text-sm font-semibold text-gray-400 uppercase mb-1">{label}</p>
        <p className="text-3xl text-slate-700 font-bold mb-1">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-xs text-gray-500 font-semibold">{subtitle}</p>
      </Card>
    </div>
  );
}

function Pager({ page, totalPages, total, noun, onPage }: {
  page: number;
  totalPages: number;
  total?: number;
  noun?: string;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2">
      <p className="text-sm text-gray-500">
        Page {page} of {totalPages}
        {total !== undefined && noun ? ` (${total} ${noun})` : ''}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="p-2 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function NoDistrictCard() {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-300 p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No District Assignment</h2>
          <p className="text-gray-600 mb-4">
            You have not been assigned to a district yet. Your DEO account is active, but you need a district
            assignment to access the dashboard.
          </p>
          <div className="bg-blue-50 border border-blue-200 p-4 text-left mb-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">What to do next:</p>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Contact your County Administrator</li>
              <li>Request assignment to a district</li>
              <li>Once assigned, you&apos;ll have full dashboard access</li>
            </ul>
          </div>
          <p className="text-xs text-gray-500">
            DEOs can be assigned, reassigned, or transferred between districts as needed by County Administrators.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The DEO dashboard, ported from portal-web app/government/deo/page.tsx.
 * Everything is read from this device; Mark Reviewed is written here and
 * synced later. Layout reference: docs/superpowers/specs/
 * 2026-11-14-deo-portal-web-design-reference.md §4.1. */
export function DeoDashboardPage() {
  const dashboard = useDeoDashboardViewModel();
  const currentUser = useCurrentUserViewModel();
  const summary = useViewModel(dashboard.store, (s) => s.summary);
  const resolvingAlertId = useViewModel(dashboard.store, (s) => s.resolvingAlertId);
  const resolveError = useViewModel(dashboard.store, (s) => s.resolveError);
  const userState = useViewModel(currentUser.store, (s) => s.user);

  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolStatus, setSchoolStatus] = useState<PerformanceFilter>('');
  const [schoolPage, setSchoolPage] = useState(1);
  const [submissionPage, setSubmissionPage] = useState(1);
  const [severity, setSeverity] = useState('');

  useRevalidateOnSync(() => {
    void currentUser.loadCurrentUser();
    void dashboard.loadDashboard();
  }, [currentUser, dashboard]);

  if (summary.status === 'idle' || summary.status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const data = summary.status === 'success' || summary.status === 'refreshing' ? summary.data : null;
  if (data && data.districtId === null) return <NoDistrictCard />;

  const user = userState.status === 'success' || userState.status === 'refreshing' ? userState.data : null;
  const now = new Date();
  const schools = data?.schools ?? [];
  const performance = pageOf(filterPerformance(schools, schoolSearch, schoolStatus), schoolPage);
  const submissions = pageOf(data?.submissions ?? [], submissionPage);
  const incidents = filterAlerts(data?.alerts ?? [], severity);
  const counts = data?.alertSummary;

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
        <DEOBanner
          firstName={user?.firstName}
          lastName={user?.lastName}
          userName={user?.fullName ?? ''}
          greeting={greetingFor(now.getHours())}
          line={bannerLine({
            title: 'District Education Officer',
            district: data?.district?.name,
            county: data?.county?.name,
            date: now,
          })}
        />
      </div>

      <div className="px-6 py-6 space-y-5">
        {summary.status === 'error' ? (
          <div className="bg-red-50 border border-red-300 p-4 text-center">
            <p className="text-red-600 text-sm">Failed to load dashboard data.</p>
            <button
              type="button"
              onClick={() => void dashboard.loadDashboard()}
              className="text-red-700 underline text-sm mt-1"
            >
              Retry
            </button>
          </div>
        ) : null}

        {data ? (
          <>
            {/* 1. KPI grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <KpiCard label="Total Schools" value={data.stats.totalSchools} subtitle="In District" />
              <KpiCard label="Total Students" value={data.stats.totalStudents} subtitle="District enrollment" />
              <KpiCard label="Total Teachers" value={data.stats.totalTeachers} subtitle="Across all schools" />
              <KpiCard
                label="Fee Compliance"
                value={`${data.stats.feeCompliance}%`}
                subtitle="Average across schools"
              />
            </div>

            {/* 2. Alerts & Schools at a Glance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AlertsAndActions alerts={data.alerts} totalCount={data.alertSummary.total} />
              <SchoolsAtGlance schools={schools} />
            </div>

            {/* 3. Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title="Enrollment Trend (6 Months)">
                <EnrollmentTrendChart data={data.chartData.enrollmentTrend} />
              </Card>
              <Card title="Gender Distribution">
                <GenderDistributionChart data={data.chartData.genderDistribution} />
              </Card>
            </div>

            {/* 4. School performance chart (attendance, titled as on the web) */}
            <Card title="School Performance">
              <h3 className="text-base font-semibold text-gray-900 mb-4">School Performance (%)</h3>
              <AttendanceTrendChart data={data.chartData.attendanceTrend} />
            </Card>

            {/* 5. Detailed school performance */}
            <div data-section>
              <Card title="Detailed School Performance">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search schools..."
                        value={schoolSearch}
                        onChange={(e) => {
                          setSchoolSearch(e.target.value);
                          setSchoolPage(1);
                        }}
                        className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                      />
                    </div>
                    <select
                      value={schoolStatus}
                      onChange={(e) => {
                        setSchoolStatus(e.target.value as PerformanceFilter);
                        setSchoolPage(1);
                      }}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    >
                      <option value="">All Status</option>
                      <option value="Good">Good</option>
                      <option value="Warning">Warning</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {['School', 'Enrollment', 'Attendance %', 'Teachers', 'Last Submission', 'Status'].map(
                            (heading) => (
                              <th
                                key={heading}
                                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                              >
                                {heading}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {performance.rows.length > 0 ? (
                          performance.rows.map((school) => (
                            <tr key={school.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{school.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{school.students.toLocaleString()}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {school.attendanceRate === null ? '—' : `${school.attendanceRate}%`}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">{school.teachers}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {school.lastSubmissionAt
                                  ? new Date(school.lastSubmissionAt).toLocaleDateString()
                                  : '—'}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    PERFORMANCE_CHIP[school.performanceStatus] ?? 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {school.performanceStatus}
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                              No schools found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <Pager
                    page={performance.page}
                    totalPages={performance.totalPages}
                    total={performance.total}
                    noun="schools"
                    onPage={setSchoolPage}
                  />
                </div>
              </Card>
            </div>

            {/* 6. Data submission monitoring (school reports) */}
            <div data-section>
              <Card title="Data Submission Monitoring">
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {['School', 'Report', 'Type', 'Date'].map((heading) => (
                            <th
                              key={heading}
                              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {submissions.rows.length > 0 ? (
                          submissions.rows.map((sub) => (
                            <tr key={sub.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{sub.schoolName}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{sub.title}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{sub.type.replace(/_/g, ' ')}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {new Date(sub.submittedAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                              No submissions found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <Pager page={submissions.page} totalPages={submissions.totalPages} onPage={setSubmissionPage} />
                </div>
              </Card>
            </div>

            {/* 7. Incident monitoring */}
            <div className="bg-white rounded-lg border border-slate-300 p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Incident Monitoring</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <select
                    aria-label="Severity"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  >
                    <option value="">All Severities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                  {counts ? (
                    <div className="flex gap-2 text-xs">
                      {counts.critical > 0 && (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                          {counts.critical} Critical
                        </span>
                      )}
                      {counts.high > 0 && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full font-medium">
                          {counts.high} High
                        </span>
                      )}
                      {counts.medium > 0 && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                          {counts.medium} Medium
                        </span>
                      )}
                      {counts.low > 0 && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                          {counts.low} Low
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>

                {resolveError ? (
                  <p role="alert" className="text-sm text-red-700">
                    Could not mark the incident reviewed: {resolveError.userMessage}
                  </p>
                ) : null}

                {incidents.length > 0 ? (
                  <div className="space-y-3">
                    {incidents.map((incident) => {
                      const tone = SEVERITY_TONE[incident.severity.toUpperCase()] ?? LOW_TONE;
                      return (
                        <div
                          key={incident.id}
                          className={`flex items-start justify-between p-4 rounded-lg border ${tone.row}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${tone.chip}`}
                              >
                                {incident.severity}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(incident.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-gray-900">{incident.title}</p>
                            <p className="text-xs text-gray-600 mt-1">{incident.description}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void dashboard.resolveAlert(incident.id)}
                            disabled={resolvingAlertId !== null}
                            className="ml-4 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap disabled:opacity-50"
                          >
                            {resolvingAlertId === incident.id ? 'Saving…' : 'Mark Reviewed'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p className="text-gray-600 text-sm">No open incidents</p>
                  </div>
                )}
              </div>
            </div>

            {/* 8. Quick actions */}
            <div className="bg-white rounded-lg border border-slate-300 p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    href: '/government/deo/communications',
                    icon: Megaphone,
                    title: 'Send Broadcast',
                    caption: 'Message all schools',
                  },
                  {
                    href: '/government/deo/reports/automated',
                    icon: FileText,
                    title: 'Generate Report',
                    caption: 'Create district reports',
                  },
                  {
                    href: '/government/deo/schools',
                    icon: CalendarCheck,
                    title: 'Schedule Visit',
                    caption: 'Plan school inspections',
                  },
                ].map(({ href, icon: Icon, title, caption }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 p-4 border border-gray-300 hover:border-sky-300 hover:bg-sky-50 transition-colors group"
                  >
                    <div className="w-10 h-10 bg-slate-200 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{title}</p>
                      <p className="text-xs text-gray-500">{caption}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {/* Desktop only: closed academic years across the district. */}
        <YearClosuresPanel />
      </div>
    </div>
  );
}
