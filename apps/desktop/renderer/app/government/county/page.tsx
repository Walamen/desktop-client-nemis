'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Spinner, Alert, Card, Avatar } from '@nemis-desktop/ui';
import { School, FileText, Users, RefreshCw } from 'lucide-react';
import { useCountyDashboardViewModel } from '@/lib/presentation/hooks/county';
import { useCurrentUserViewModel } from '@/lib/presentation/hooks/shared';
import { useViewModel } from '@/hooks/use-view-model';
import { useRevalidateOnSync } from '@/hooks/use-revalidate-on-sync';
import EnrollmentByDistrictChart from '@/components/county/charts/EnrollmentByDistrictChart';
import EnrollmentTrendChart from '@/components/county/charts/EnrollmentTrendChart';
import DropoutTrendChart from '@/components/county/charts/DropoutTrendChart';
import DistrictScorecardCard from '@/components/county/charts/DistrictScorecardCard';
import EnrollmentBySchoolTypeCard from '@/components/county/charts/EnrollmentBySchoolTypeCard';

export default function CountyDashboard() {
  const router = useRouter();
  const dashboard = useCountyDashboardViewModel();
  const currentUser = useCurrentUserViewModel();
  const summary = useViewModel(dashboard.store, (s) => s.summary);
  const userState = useViewModel(currentUser.store, (s) => s.user);

  useRevalidateOnSync(() => {
    void currentUser.loadCurrentUser();
    void dashboard.loadDashboard();
  }, [currentUser, dashboard]);

  const today = new Date();
  const hour = today.getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const user =
    userState.status === 'success' || userState.status === 'refreshing' ? userState.data : null;
  const fullName = user?.fullName ?? '';
  const firstName = user?.firstName;
  const lastName = user?.lastName;

  // `refreshing` keeps the dashboard on screen during a reload, like RTK
  // Query's isFetching on the web.
  const data = summary.status === 'success' || summary.status === 'refreshing' ? summary.data : null;
  const county = data?.county ?? null;
  const districts = data?.districts ?? [];
  const stats = data?.stats;
  const chartData = data?.chartData;
  const studentStats = data ? { byLevel: data.byLevel } : undefined;
  const error = summary.status === 'error' ? 'Failed to load county data' : null;

  const refreshData = () => {
    void dashboard.loadDashboard();
  };

  if (summary.status === 'idle' || summary.status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 font-['Sora']">
      {/* Header Band */}
      <div className="bg-slate-900 text-white px-6 py-5 flex items-center gap-4">
        <Avatar
          src={null}
          firstName={firstName}
          lastName={lastName}
          role="generic"
          size={64}
          className="border-2 border-slate-600"
          alt="Profile"
        />
        <div>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">
            {greeting},
          </p>
          <h1 className="text-2xl font-bold text-white">{fullName}</h1>
          <p className="text-xs text-slate-400 font-semibold">
            County Education Officer
            {county?.name ? <> &mdash; {county.name}</> : null}{' '}
            &bull; {formattedDate}
          </p>
        </div>
      </div>

      <div className="px-6 py-6 space-y-5">
        {error && (
          <Alert variant="error">
            {error}{' '}
            <button onClick={refreshData} className="ml-2 underline text-sm">
              Retry
            </button>
          </Alert>
        )}

        {/* Primary stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/government/county/schools">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Schools
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {stats?.totalSchools ?? 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Across {districts.length} districts
              </p>
            </Card>
          </Link>

          <Link href="/government/county/students">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Students
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {(stats?.totalStudents ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Enrolled county-wide
              </p>
            </Card>
          </Link>

          <Link href="/government/county/teachers">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Teachers
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {(stats?.totalTeachers ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                All {districts.length} districts
              </p>
            </Card>
          </Link>

          <Link href="/government/county/districts">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Districts
              </p>
              <p className="text-4xl font-bold text-slate-900 mt-2">
                {districts.length}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Administrative units
              </p>
            </Card>
          </Link>
        </div>

        {/* District Scorecard + Enrollment by School Type */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {chartData && stats ? (
            <>
              <DistrictScorecardCard
                compliance={chartData.attendanceCompliance}
                districts={districts}
                enrollmentByDistrict={chartData.enrollmentByDistrict}
                stats={stats}
                countyName={county?.name ?? ''}
              />
              <EnrollmentBySchoolTypeCard
                byLevel={studentStats?.byLevel ?? {}}
                genderDistribution={chartData.genderDistribution}
              />
            </>
          ) : (
            <>
              <div className="bg-white border border-slate-300 p-5 h-48 flex items-center justify-center">
                <p className="text-sm text-slate-400">
                  No scorecard data available
                </p>
              </div>
              <div className="bg-white border border-slate-300 p-5 h-48 flex items-center justify-center">
                <p className="text-sm text-slate-400">
                  No enrollment data available
                </p>
              </div>
            </>
          )}
        </div>

        {/* Analytics Charts */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
            Analytics Overview
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg border-slate-300 p-5 lg:col-span-2">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                Enrollment by District
              </p>
              {chartData ? (
                <EnrollmentByDistrictChart
                  data={chartData.enrollmentByDistrict}
                />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-slate-300 p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                Enrollment Trend
              </p>
              {chartData ? (
                <EnrollmentTrendChart data={chartData.enrollmentTrend} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>

            <div className="bg-white border rounded-lg border-slate-300 p-5">
              <p className="text-sm font-semibold text-slate-700 mb-4">
                Dropout Trend
              </p>
              {chartData ? (
                <DropoutTrendChart data={chartData.dropoutTrend} />
              ) : (
                <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
                  No data available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Schools table + Quick Actions */}
        <div className=" gap-4">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg border border-slate-300 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
              Quick Actions
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                onClick={() => router.push('/government/county/schools/create')}
                className="w-full px-4 py-3  border border-slate-200 hover:border-slate-400 hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-200  flex items-center justify-center shrink-0">
                  <School className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Add New School
                  </p>
                  <p className="text-xs text-slate-400">Register a school</p>
                </div>
              </button>

              <button
                onClick={() =>
                  router.push('/government/county/reports/generate')
                }
                className="w-full px-4 py-3  border border-slate-200 hover:border-slate-400 hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-200  flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Generate Report
                  </p>
                  <p className="text-xs text-slate-400">County statistics</p>
                </div>
              </button>

              <button
                onClick={() => router.push('/government/county/users')}
                className="w-full px-4 py-3  border border-slate-200 hover:border-slate-400 hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-200  flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Manage Users
                  </p>
                  <p className="text-xs text-slate-400">Staff & admins</p>
                </div>
              </button>

              <button
                onClick={refreshData}
                className="w-full px-4 py-3  border border-slate-200 hover:border-slate-400 hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-200  flex items-center justify-center shrink-0">
                  <RefreshCw className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Refresh Data
                  </p>
                  <p className="text-xs text-slate-400">Update statistics</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
