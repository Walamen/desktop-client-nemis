"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Spinner, Drawer, showConfirm, Avatar, Card, ErrorState } from "@nemis-desktop/ui";
import { LayoutGrid, List, Building2, AlertTriangle } from "lucide-react";
import { useCountyDistrictsViewModel } from "@/lib/presentation/hooks/county";
import { useConnectivityStore } from "@/lib/presentation/hooks/shared";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { parseIpcError } from "@/lib/errors/parseIpcError";
import { countyBridge } from "@/services/nemis-bridge/county";

// Desktop: online-command failures arrive as `[CODE] message` IPC errors.
function getErrorMessage(error: unknown, fallback: string) {
  return parseIpcError(error)?.message || fallback;
}

export default function DistrictsManagementPage() {
  const router = useRouter();
  const vm = useCountyDistrictsViewModel();
  const summary = useViewModel(vm.store, (s) => s.summary);
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);

  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const [selectedDistrict, setSelectedDistrict] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [selectedDeoUserId, setSelectedDeoUserId] = useState<string>("");
  const [deoError, setDeoError] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [assigningDeo, setAssigningDeo] = useState(false);
  const [removingDeo, setRemovingDeo] = useState(false);

  useRevalidateOnSync(() => {
    void vm.load();
  }, [vm]);

  // `refreshing` keeps the page on screen during a reload.
  const data =
    summary.status === "success" || summary.status === "refreshing" ? summary.data : null;
  const county = data?.county ?? null;
  const districts = useMemo(() => data?.districts ?? [], [data]);
  const deoUsers = useMemo(() => data?.deoUsers ?? [], [data]);
  const districtOfficersData = selectedDistrict
    ? { officers: data?.officersByDistrict[selectedDistrict.id] ?? [] }
    : undefined;
  const districtsLoading = summary.status === "loading";
  const deoUsersLoading = districtsLoading;
  const refetchDeoUsers = () => void vm.load();

  // Show all DEOs in the dropdown, not just district-related ones
  const availableDeoOptions = useMemo(() => {
    return deoUsers.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      isActive: u.isActive,
      districtName: u.districtId
        ? districts.find((d) => d.id === u.districtId)?.name
        : null,
    }));
  }, [deoUsers, districts]);

  const totalSchools = districts.reduce(
    (sum, d) => sum + (d._count?.institutions || 0),
    0,
  );
  const assignedCount = districts.filter(
    (d) => d._count?.users && d._count.users > 0,
  ).length;
  const unassignedCount = districts.filter(
    (d) => !d._count?.users || d._count.users === 0,
  ).length;
  const maxSchools = Math.max(
    ...districts.map((d) => d._count?.institutions || 0),
    1,
  );

  if (summary.status === "idle" || summary.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (summary.status === "error") {
    return (
      <div className="p-8">
        <ErrorState message={summary.error.userMessage} onRetry={() => void vm.load()} />
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        {/* Header Band */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
              {county?.name || "County"}
            </p>
            <h1 className="text-xl font-bold text-white">
              District Management
            </h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase tracking-widest">
              Districts
            </p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">
              {districts.length} total
            </p>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          {/* Summary stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Total Districts
              </p>
              <p className="text-4xl font-bold text-slate-700 mt-2">
                {districts.length}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Administrative units
              </p>
            </Card>

            <Link href="/government/county/users">
              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Active DEOs
                </p>
                <p className="text-4xl font-bold text-active mt-2">
                  {assignedCount}
                </p>
                <p className="text-xs text-slate-400 mt-1">Assigned officers</p>
              </Card>
            </Link>

            <Link href="/government/county/schools">
              <Card>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Total Schools
                </p>
                <p className="text-4xl font-bold text-slate-700 mt-2">
                  {totalSchools}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Across all districts
                </p>
              </Card>
            </Link>

            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Unassigned
              </p>
              <p
                className={`text-4xl font-bold mt-2 ${unassignedCount > 0 ? "text-amber-500" : "text-slate-900"}`}
              >
                {unassignedCount}
              </p>
              <p className="text-xs text-slate-400 mt-1">Need DEO assignment</p>
            </Card>
          </div>

          {/* Districts Overview — Grid / Table */}
          <div className="bg-white border rounded-lg border-slate-300 overflow-hidden">
            {/* Section header with view switcher */}
            <div className="px-5 py-4 border-b border-slate-100 bg-secondary/20 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-600">
                Districts Overview
              </p>
              <div className="flex items-center gap-1 bg-slate-100  p-0.5">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5  transition-colors ${
                    viewMode === "grid"
                      ? "bg-slate-900 text-white"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Grid view"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`p-1.5 transition-colors ${
                    viewMode === "table"
                      ? "bg-slate-900 text-white"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                  title="Table view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            {districts.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-400">
                No districts registered in this county yet.
              </div>
            ) : viewMode === "grid" ? (
              /* ── Grid View ─────────────────────────────────────────── */
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {districts.map((district) => {
                  const hasDEO =
                    district._count?.users && district._count.users > 0;
                  const schoolCount = district._count?.institutions || 0;
                  const deoUser = district.users?.[0]?.user;
                  const schoolPct =
                    maxSchools > 0 ? (schoolCount / maxSchools) * 100 : 0;

                  return (
                    <Card key={district.id}>
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 text-sm leading-tight truncate">
                              {district.name}
                            </p>
                            <span className="text-xs font-bold text-primary-200 bg-primary-50 border py-0.5 px-2">
                              {district.code}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* DEO status */}
                      <div className="flex flex-col gap-2 px-3 py-2.5  ">
                        {hasDEO ? (
                          <>
                            {deoUser ? (
                              <Avatar
                                src={deoUser.imageUrl}
                                firstName={deoUser.firstName}
                                lastName={deoUser.lastName}
                                role="deo"
                                size={64}
                                className="ring-2 ring-emerald-200"
                              />
                            ) : (
                              <Avatar role="deo" size={64} alt="DEO" className="ring-2 ring-emerald-200" />
                            )}

                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-700 leading-tight truncate">
                                {deoUser
                                  ? `${deoUser.firstName} ${deoUser.lastName}`
                                  : `${district._count?.users ?? 0} DEO assigned`}
                              </p>
                              {deoUser?.email && (
                                <p className="text-[10px] text-slate-700 truncate">
                                  {deoUser.email}
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <Avatar role="deo" size={64} alt="No DEO" className="ring-2 ring-amber-200" />
                            <p className="text-xs font-semibold text-amber-600">
                              No DEO assigned
                            </p>
                          </>
                        )}
                      </div>

                      {/* Schools bar */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-slate-400 font-medium">
                            Schools
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            {schoolCount}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full  overflow-hidden">
                          <div
                            className="h-full bg-secondary/30 transition-all"
                            style={{ width: `${schoolPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Card actions */}
                      <div className="flex items-center gap-2 pt-1 mt-8">
                        <button
                          onClick={() =>
                            router.push(
                              `/government/county/districts/details?id=${district.id}`,
                            )
                          }
                          className="flex-1 px-3 py-2 text-xs font-bold text-slate-500 rounded-button border border-slate-300  hover:bg-secondary/70 hover:text-slate-100 transition-colors"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => {
                            setDeoError("");
                            setSelectedDeoUserId("");
                            setSelectedDistrict({
                              id: district.id,
                              name: district.name,
                            });
                            refetchDeoUsers();
                          }}
                          className="flex-1 px-3 py-2 text-xs font-bold text-white bg-secondary/70 rounded-button  hover:bg-sky-800 transition-colors"
                        >
                          {hasDEO ? "Reassign DEO" : "Assign DEO"}
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              /* ── Table View ────────────────────────────────────────── */
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                        District
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Code
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Schools
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                        DEO Assigned
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Status
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {districts.map((district) => {
                      const hasDEO =
                        district._count?.users && district._count.users > 0;
                      const schoolCount = district._count?.institutions || 0;
                      const deoUser = district.users?.[0]?.user;

                      return (
                        <tr key={district.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-bold text-slate-500">
                              {district.name}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-bold border border-200 text-slate-500 bg-slate-100 px-2 py-0.5 ">
                              {district.code}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-500">
                            {schoolCount}{" "}
                            {schoolCount === 1 ? "school" : "schools"}
                          </td>
                          <td className="px-4 py-3">
                            {hasDEO ? (
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-active shrink-0" />
                                <span className="text-sm text-slate-500 font-bold">
                                  {deoUser
                                    ? `${deoUser.firstName} ${deoUser.lastName}`
                                    : `${district._count?.users ?? 0} DEO${(district._count?.users ?? 0) > 1 ? "s" : ""}`}
                                </span>
                                {deoUser?.email && (
                                  <span className="text-xs text-slate-400">
                                    ({deoUser.email})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0" />
                                <span className="text-sm font-medium text-slate-400">
                                  No DEO
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs font-semibold rounded-full px-2 py-0.5  ${
                                district.isActive
                                  ? "text-slate-100 bg-active"
                                  : "text-slate-400 bg-slate-100"
                              }`}
                            >
                              {district.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() =>
                                  router.push(
                                    `/government/county/districts/details?id=${district.id}`,
                                  )
                                }
                                className="px-3 py-1.5 text-xs font-bold text-slate-600 border border-slate-300 rounded-button hover:bg-secondary/70 hover:text-slate-100 transition-colors"
                              >
                                View Details
                              </button>
                              <button
                                onClick={() => {
                                  setDeoError("");
                                  setSelectedDeoUserId("");
                                  setSelectedDistrict({
                                    id: district.id,
                                    name: district.name,
                                  });
                                  refetchDeoUsers();
                                }}
                                className="px-3 py-1.5 text-xs font-bold text-slate-100 bg-secondary/80 rounded-button hover:bg-secondary transition-colors"
                              >
                                {hasDEO ? "Reassign DEO" : "Assign DEO"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Performance + DEO status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Districts by school count */}
            <div className="bg-white border border-slate-300 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                Districts by School Count
              </p>
              <div className="space-y-4">
                {[...districts]
                  .sort(
                    (a, b) =>
                      (b._count?.institutions || 0) -
                      (a._count?.institutions || 0),
                  )
                  .slice(0, 5)
                  .map((district) => {
                    const schoolCount = district._count?.institutions || 0;
                    const pct =
                      maxSchools > 0 ? (schoolCount / maxSchools) * 100 : 0;
                    return (
                      <div key={district.id}>
                        <div className="flex justify-between mb-1.5">
                          <span className="text-sm font-bold text-slate-500">
                            {district.name}
                          </span>
                          <span className="text-sm font-semibold text-slate-500">
                            {schoolCount} schools
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100  overflow-hidden">
                          <div
                            className="h-full  bg-secondary/30 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* DEO assignment status */}
            <div className="bg-white border border-slate-300 rounded-lg p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
                DEO Assignment Status
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-4 bg-active  px-4 py-4">
                  <div className="w-10 h-10 bg-active  flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-slate-100"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-100">
                      Assigned Districts
                    </p>
                    <p className="text-2xl font-bold text-slate-100 mt-0.5">
                      {assignedCount}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-pending  px-4 py-4">
                  <div className="w-10 h-10 bg-pending   flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-slate-100"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-100">
                      Unassigned Districts
                    </p>
                    <p className="text-2xl font-bold text-slate-100 mt-0.5">
                      {unassignedCount}
                    </p>
                  </div>
                </div>

                <div className="mt-2 h-1.5 bg-slate-100  overflow-hidden">
                  <div
                    className="h-full rounded-full bg-secondary/40 transition-all"
                    style={{
                      width: `${districts.length > 0 ? (assignedCount / districts.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-slate-400 text-right">
                  {districts.length > 0
                    ? Math.round((assignedCount / districts.length) * 100)
                    : 0}
                  % coverage
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg border border-slate-300 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
              Quick Actions
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() =>
                  router.push("/government/county/users/create?role=DEO")
                }
                className="px-4 py-3  border border-slate-300  hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-100 flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4 font-bold text-slate-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">
                    Create DEO Account
                  </p>
                  <p className="text-xs text-slate-400">
                    Add new District Education Officer
                  </p>
                </div>
              </button>

              <button
                onClick={() =>
                  router.push("/government/county/reports/generate")
                }
                className="px-4 py-3  border border-slate-300  hover:bg-slate-200 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-slate-100  flex items-center justify-center shrink-0">
                  <svg
                    className="w-4 h-4 text-slate-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">
                    District Reports
                  </p>
                  <p className="text-xs text-slate-400">
                    View district performance
                  </p>
                </div>
              </button>

              <button
                onClick={async () => {
                  setIsRefreshing(true);
                  await vm.load();
                  setIsRefreshing(false);
                }}
                disabled={districtsLoading || isRefreshing}
                className="px-4 py-3 border border-slate-300  hover:bg-slate-200 transition-colors text-left flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="w-8 h-8 bg-slate-100  flex items-center justify-center shrink-0">
                  <svg
                    className={`w-4 h-4 text-slate-600 ${isRefreshing || districtsLoading ? "animate-spin" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">
                    {isRefreshing || districtsLoading
                      ? "Refreshing..."
                      : "Refresh Data"}
                  </p>
                  <p className="text-xs text-slate-400">
                    Update district information
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Manage DEO Drawer */}
        <Drawer
          isOpen={!!selectedDistrict}
          onClose={() => {
            setSelectedDistrict(null);
            setSelectedDeoUserId("");
            setDeoError("");
          }}
          title={
            selectedDistrict
              ? `Manage DEO — ${selectedDistrict.name}`
              : "Manage DEO"
          }
          size="lg"
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSelectedDistrict(null);
                  setSelectedDeoUserId("");
                  setDeoError("");
                }}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={assigningDeo}
                disabled={
                  !online ||
                  !selectedDeoUserId ||
                  assigningDeo ||
                  (selectedDistrict &&
                    !districts.find((d) => d.id === selectedDistrict.id)
                      ?.isActive) ||
                  false
                }
                onClick={async () => {
                  setDeoError("");
                  if (!selectedDeoUserId) {
                    setDeoError("Please select a DEO");
                    return;
                  }
                  const activeOfficers = districtOfficersData?.officers ?? [];
                  const replacingExisting = activeOfficers.some(
                    (officer) => officer.userId !== selectedDeoUserId,
                  );

                  if (replacingExisting) {
                    const currentNames = activeOfficers
                      .map((officer) => officer.name)
                      .join(", ");
                    const confirmed = await showConfirm(
                      `This district already has ${currentNames} assigned as DEO. Do you want to replace the current DEO with the selected DEO?`,
                      "Replace Current DEO",
                      "Yes, replace",
                      "Cancel",
                    );

                    if (!confirmed) {
                      return;
                    }
                  }

                  setAssigningDeo(true);
                  try {
                    await countyBridge.assignDeo({
                      districtId: selectedDistrict!.id,
                      userId: selectedDeoUserId,
                      replaceExisting: replacingExisting,
                    });
                    await vm.load();
                    setSelectedDeoUserId("");
                  } catch (e) {
                    setDeoError(
                      getErrorMessage(
                        e,
                        "Failed to assign DEO. Please try again.",
                      ),
                    );
                  } finally {
                    setAssigningDeo(false);
                  }
                }}
              >
                {(districtOfficersData?.officers?.length ?? 0) > 0
                  ? "Reassign DEO"
                  : "Assign DEO"}
              </Button>
            </>
          }
        >
          <div className="space-y-6">
            {/* District Status Badge */}
            {selectedDistrict && (
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                    districts.find((d) => d.id === selectedDistrict.id)
                      ?.isActive
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      districts.find((d) => d.id === selectedDistrict.id)
                        ?.isActive
                        ? "bg-emerald-500"
                        : "bg-slate-400"
                    }`}
                  />
                  {districts.find((d) => d.id === selectedDistrict.id)?.isActive
                    ? "Active District"
                    : "Inactive District"}
                </span>
              </div>
            )}

            {/* District Status Warning */}
            {selectedDistrict &&
              !districts.find((d) => d.id === selectedDistrict.id)
                ?.isActive && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-900">
                      Inactive District
                    </p>
                    <p className="text-sm text-amber-700">
                      This district has been administratively suspended. No new
                      DEO assignments are possible. Historical data is preserved
                      for audit purposes.
                    </p>
                  </div>
                </div>
              )}

            {deoError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-600">{deoError}</p>
              </div>
            )}

            {!online && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  DEO changes need an internet connection.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  All County DEOs
                </h3>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void vm.load()}
                  disabled={deoUsersLoading || !online}
                >
                  Refresh
                </Button>
              </div>

              {deoUsersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Spinner size="md" />
                </div>
              ) : deoUsers.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200">
                  <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-600">
                    No DEO Users Found
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Create DEO accounts to assign them to districts
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {deoUsers.map((deoUser) => {
                    const assignedDistrict = districts.find(
                      (d) => d.id === deoUser.districtId,
                    );
                    const isAssignedToCurrentDistrict =
                      deoUser.districtId === selectedDistrict?.id;

                    return (
                      <div
                        key={deoUser.id}
                        className={`flex items-start gap-3 p-4 border rounded-xl bg-white transition-colors ${
                          isAssignedToCurrentDistrict
                            ? "border-sky-300 bg-sky-50"
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <Avatar
                          src={deoUser.imageUrl}
                          firstName={deoUser.firstName}
                          lastName={deoUser.lastName}
                          role="deo"
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">
                                {deoUser.firstName} {deoUser.lastName}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {deoUser.email}
                              </p>
                              {deoUser.phoneNumber && (
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {deoUser.phoneNumber}
                                </p>
                              )}
                            </div>
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium shrink-0 ${
                                deoUser.isActive
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  deoUser.isActive
                                    ? "bg-emerald-500"
                                    : "bg-amber-500"
                                }`}
                              />
                              {deoUser.isActive
                                ? "Activated"
                                : "Pending Activation"}
                            </span>
                          </div>

                          {/* District Assignment Info */}
                          <div className="mt-2">
                            {assignedDistrict ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">
                                  Assigned to:
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${
                                    isAssignedToCurrentDistrict
                                      ? "bg-sky-100 text-sky-700"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {assignedDistrict.name}
                                  {isAssignedToCurrentDistrict &&
                                    " (This District)"}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-amber-600 font-medium">
                                Not assigned to any district
                              </span>
                            )}
                          </div>

                          {deoUser.lastLoginAt && (
                            <div className="text-xs text-slate-400 mt-2">
                              Last login{" "}
                              {new Date(deoUser.lastLoginAt).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                },
                              )}
                            </div>
                          )}

                          {/* Actions for current district */}
                          {isAssignedToCurrentDistrict && (
                            <div className="flex items-center gap-2 mt-3">
                              <Button
                                variant="secondary"
                                size="sm"
                                loading={removingDeo}
                                disabled={!online}
                                onClick={async () => {
                                  const confirmed = await showConfirm(
                                    `Are you sure you want to remove ${deoUser.firstName} ${deoUser.lastName} as DEO for ${selectedDistrict?.name}? This will deactivate their assignment.`,
                                    "Remove DEO",
                                    "Yes, remove",
                                    "Cancel",
                                  );
                                  if (!confirmed) return;

                                  setDeoError("");
                                  setRemovingDeo(true);
                                  try {
                                    await countyBridge.removeDeo({
                                      districtId: selectedDistrict!.id,
                                      userId: deoUser.id,
                                    });
                                    await vm.load();
                                  } catch (e) {
                                    setDeoError(
                                      getErrorMessage(
                                        e,
                                        "Failed to remove DEO. Please try again.",
                                      ),
                                    );
                                  } finally {
                                    setRemovingDeo(false);
                                  }
                                }}
                              >
                                Remove from District
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Assign/Reassign DEO Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {(districtOfficersData?.officers?.length ?? 0) > 0
                    ? "Reassign DEO"
                    : "Assign New DEO"}
                </h3>
                {(districtOfficersData?.officers?.length ?? 0) > 0 && (
                  <span className="text-xs text-slate-500">
                    Replace current DEO
                  </span>
                )}
              </div>

              {selectedDistrict &&
              !districts.find((d) => d.id === selectedDistrict.id)?.isActive ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-sm text-slate-600">
                    DEO assignment is disabled for inactive districts.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Select DEO <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedDeoUserId}
                    onChange={(e) => setSelectedDeoUserId(e.target.value)}
                    disabled={deoUsersLoading || !online}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {deoUsersLoading ? "Loading DEOs..." : "Select a DEO"}
                    </option>
                    {availableDeoOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                        {u.districtName
                          ? ` - Assigned to ${u.districtName}`
                          : " - Unassigned"}
                        {u.isActive ? " - Active" : " - Pending Activation"}
                      </option>
                    ))}
                  </select>
                  {availableDeoOptions.length === 0 && !deoUsersLoading && (
                    <p className="text-xs text-slate-500 mt-2">
                      No available DEO users found. Create a DEO account first.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Drawer>
      </div>
    </>
  );
}
