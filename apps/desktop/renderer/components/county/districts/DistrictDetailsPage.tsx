"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, Button, Spinner, EmptyState, Alert } from "@nemis-desktop/ui";
import { useCountyDistrictDetailViewModel } from "@/lib/presentation/hooks/county";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import {
  getInstitutionPrincipalName,
  getInstitutionStatistics,
} from "@/lib/institutionMetadata";

function formatLabel(value?: string | null) {
  if (!value) return "N/A";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function displayValue(value: unknown, fallback = "N/A") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export function DistrictDetailsPage() {
  const districtId = useSearchParams().get("id") ?? "";
  const vm = useCountyDistrictDetailViewModel();
  const detail = useViewModel(vm.store, (s) => s.detail);

  useRevalidateOnSync(() => {
    if (districtId) void vm.load(districtId);
  }, [vm, districtId]);

  const data =
    detail.status === "success" || detail.status === "refreshing" ? detail.data : null;
  const county = data?.county ?? null;
  const district = data?.district ?? null;
  const stats = data?.stats;
  const officersData = data ? { officers: data.officers } : undefined;
  const schools = data?.schools ?? [];
  const districtError = !districtId || detail.status === "error" || detail.status === "empty";
  const loading = !!districtId && (detail.status === "idle" || detail.status === "loading");

  const deoUser = officersData?.officers?.[0];
  const districtSchools =
    schools.length > 0 ? schools : district?.institutions || [];

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <Spinner size="lg" />
            <p className="mt-4 text-gray-600">Loading district details...</p>
          </div>
        </div>
      </>
    );
  }

  if (districtError || !district) {
    return (
      <>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-h2 font-heading text-neutral-dark">
              District Details
            </h1>
            <Link href="/government/county/districts">
              <Button variant="secondary">Back to Districts</Button>
            </Link>
          </div>
          <Alert variant="error">
            Failed to load district details. Please try again.
          </Alert>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-6 px-6 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-h2 font-heading text-slate-700 mb-2">
              {district.name}
            </h1>
            <p className="text-body text-gray-600">
              {county?.name ? `${county.name} County` : "County"} ·{" "}
              {district.code}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/government/county/districts">
              <Button variant="secondary">Back to Districts</Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="hover:shadow-lg transition-shadow">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">DEO</p>
              <p className="text-lg font-semibold text-neutral-dark">
                {deoUser?.name ?? "Unassigned"}
              </p>
              {deoUser?.email && (
                <p className="text-xs text-gray-600 mt-1">{deoUser.email}</p>
              )}
            </div>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Schools</p>
              <p className="text-3xl font-bold text-secondary">
                {stats?.totalSchools ?? districtSchools.length}
              </p>
              <p className="text-xs text-gray-500 mt-1">Active institutions</p>
            </div>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Students</p>
              <p className="text-3xl font-bold text-primary">
                {stats?.totalStudents ?? 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Active students</p>
            </div>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-1">Teachers</p>
              <p className="text-3xl font-bold text-success">
                {stats?.totalTeachers ?? 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">Active teachers</p>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Schools">
            {districtSchools.length === 0 ? (
              <EmptyState
                title="No schools found"
                description="No schools were found in this district."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Principal
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Level
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ownership
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Students
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Teachers
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Location
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {districtSchools.map((s) => {
                      const schoolStats = getInstitutionStatistics(s.metadata);
                      const principalName =
                        s.principalName ||
                        getInstitutionPrincipalName(s.metadata);
                      const studentCount =
                        schoolStats.studentCount ??
                        schoolStats.maxCapacity ??
                        undefined;
                      const teacherCount =
                        schoolStats.teacherCount ??
                        schoolStats.staffCount ??
                        undefined;
                      const contact =
                        s.contactPhone ||
                        s.contactPersonPhone ||
                        (typeof s.metadata?.phone === "string"
                          ? s.metadata.phone
                          : undefined);

                      return (
                        <tr key={s.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            <div>
                              <p className="font-medium">{s.name}</p>
                              {s.address && (
                                <p className="text-xs text-gray-500">
                                  {s.address}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {principalName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {formatLabel(s.level)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {formatLabel(s.ownership)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {displayValue(studentCount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {displayValue(teacherCount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {s.communityTown || s.address || "N/A"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {contact || "N/A"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {s.emisCode || s.officialSchoolCode || s.code}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded-full ${
                                s.isActive
                                  ? "bg-success/10 text-success"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {s.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Analytics">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">
                  Student/Teacher Ratio
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {stats?.studentTeacherRatio ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">DEO Count</span>
                <span className="text-sm font-semibold text-gray-900">
                  {stats?.deoCount ?? officersData?.officers?.length ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">Students</span>
                <span className="text-sm font-semibold text-gray-900">
                  {stats?.totalStudents ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700">Teachers</span>
                <span className="text-sm font-semibold text-gray-900">
                  {stats?.totalTeachers ?? 0}
                </span>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Students">
            <div className="text-sm text-gray-600">
              Total: {stats?.totalStudents ?? 0}
            </div>
          </Card>

          <Card title="Teachers">
            <div className="text-sm text-gray-600">
              Total: {stats?.totalTeachers ?? 0}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
