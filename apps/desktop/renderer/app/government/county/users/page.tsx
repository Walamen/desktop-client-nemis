"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner, Modal, Avatar, Card, ErrorState } from "@nemis-desktop/ui";
import type { CountyUserListItem, CountyUserRole, CountyUsersQuery } from "@nemis-desktop/types";
import { useCountyUserOptionsViewModel, useCountyUsersViewModel } from "@/lib/presentation/hooks/county";
import { useConnectivityStore } from "@/lib/presentation/hooks/shared";
import { useViewModel } from "@/hooks/use-view-model";
import { useRevalidateOnSync } from "@/hooks/use-revalidate-on-sync";
import { parseIpcError } from "@/lib/errors/parseIpcError";
import { countyBridge } from "@/services/nemis-bridge/county";
import { UserCard, USER_ROLE_LABELS, isAssigned, scopeLine } from "@/components/county/users/UserCard";
import { AssignUserModal } from "@/components/county/users/AssignUserModal";
import { DisableUserModal } from "@/components/county/users/DisableUserModal";
import { ActivationLinkDisplay } from "@/components/county/users/ActivationLinkDisplay";
import {
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Plus,
  Upload,
  AlertTriangle,
} from "lucide-react";

const ROLE_OPTIONS: Array<{ value: "ALL" | CountyUserRole; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "DEO", label: "DEO" },
  { value: "INSTITUTION_ADMIN", label: "School Admin" },
];

const PAGE_SIZE = 12;

// Same wording as the districts page: the server took the change, the
// follow-up pull did not run, so local data catches up on the next sync.
const SYNC_NOTE = "Saved — this will appear once this device syncs.";

// Desktop: online-command failures arrive as `[CODE] message` IPC errors.
function getErrorMessage(error: unknown, fallback: string) {
  return parseIpcError(error)?.message || fallback;
}

const fullName = (u: CountyUserListItem) => `${u.firstName} ${u.lastName}`;

/** Port of portal-web county/users (docs/superpowers/specs/2026-10-19-county-users-design.md §2).
 * The list and stats come from this device (filtered and paged in SQL); every
 * user change is an online command followed by a pull. */
export default function UserManagementPage() {
  const router = useRouter();
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);

  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [selectedRole, setSelectedRole] = useState<"ALL" | CountyUserRole>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [assignTarget, setAssignTarget] = useState<{ id: string; name: string; role: string } | null>(null);
  // The activation URL lives only here, while its dialog is open.
  const [activationData, setActivationData] = useState<{
    activationUrl: string;
    email: string;
    name: string;
  } | null>(null);
  const [fetchingActivation, setFetchingActivation] = useState(false);
  const [pendingDisable, setPendingDisable] = useState<{ id: string; name: string } | null>(null);
  const [actionError, setActionError] = useState("");
  const [syncNote, setSyncNote] = useState("");

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedRole]);

  const vm = useCountyUsersViewModel();
  const summary = useViewModel(vm.store, (s) => s.summary);
  const optionsVm = useCountyUserOptionsViewModel();
  const options = useViewModel(optionsVm.store, (s) => s.options);

  const query: CountyUsersQuery = {
    ...(searchQuery ? { search: searchQuery } : {}),
    ...(selectedRole !== "ALL" ? { role: selectedRole } : {}),
    page: currentPage,
    limit: PAGE_SIZE,
  };
  useRevalidateOnSync(() => {
    void vm.load(query);
  }, [vm, JSON.stringify(query)]);
  useRevalidateOnSync(() => {
    void optionsVm.load();
  }, [optionsVm]);

  const result = summary.status === "success" || summary.status === "refreshing" ? summary.data : null;
  const county = result?.county ?? null;
  const stats = result?.stats;
  const paginated = result?.data ?? [];
  const filteredCount = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));

  const optionData = options.status === "success" || options.status === "refreshing" ? options.data : null;
  const districts = optionData?.districts ?? [];
  const schools = optionData?.schools ?? [];

  const afterCommand = (refreshed: boolean) => {
    setSyncNote(refreshed ? "" : SYNC_NOTE);
    void vm.load(vm.store.getState().query);
  };

  const handleToggleUserStatus = async (u: CountyUserListItem) => {
    setActionError("");
    if (u.isActive) {
      // Disabling requires confirmation — open the modal instead of acting immediately
      setPendingDisable({ id: u.id, name: fullName(u) });
      return;
    }

    // Enabling is safe to do immediately — no confirmation needed
    try {
      const res = await countyBridge.setUserActive({ userId: u.id, isActive: true });
      afterCommand(res.refreshed);
    } catch (error) {
      setActionError(getErrorMessage(error, "Failed to enable user. Please try again."));
    }
  };

  const handleConfirmDisable = async () => {
    if (!pendingDisable) return;
    try {
      const res = await countyBridge.setUserActive({ userId: pendingDisable.id, isActive: false });
      afterCommand(res.refreshed);
    } catch (error) {
      setActionError(getErrorMessage(error, "Failed to disable user. Please try again."));
    }
    setPendingDisable(null);
  };

  const handleGetActivationToken = async (u: CountyUserListItem) => {
    setActionError("");
    setFetchingActivation(true);
    try {
      const res = await countyBridge.getActivationLink(u.id);
      setActivationData({ activationUrl: res.data.activationUrl, email: u.email || "", name: fullName(u) });
    } catch (error) {
      setActionError(getErrorMessage(error, "No active activation token found. The token may have expired."));
    } finally {
      setFetchingActivation(false);
    }
  };

  const openAssign = (u: CountyUserListItem) => {
    setActionError("");
    setAssignTarget({ id: u.id, name: fullName(u), role: u.role });
  };

  // Only the very first load shows the spinner; refreshes keep the page.
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
        <ErrorState message={summary.error.userMessage} onRetry={() => void vm.load(query)} />
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
            <h1 className="text-xl font-bold text-white">User Management</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={!online}
              onClick={() => router.push("/government/county/users/create/bulk")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-button font-semibold border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload className="w-3.5 h-3.5" />
              Bulk Create
            </button>
            <button
              disabled={!online}
              onClick={() => router.push("/government/county/users/create")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-200 rounded-button text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              Create User
            </button>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          {!online && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">User changes need an internet connection.</p>
            </div>
          )}

          {actionError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-600">{actionError}</p>
            </div>
          )}

          {syncNote && (
            <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
              <p className="text-sm text-sky-700">{syncNote}</p>
            </div>
          )}

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Total Users</p>
              <p className="text-4xl font-bold text-slate-900 mt-2">{(stats?.totalUsers || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">DEOs and School Admins</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Active Users</p>
              <p className="text-4xl font-bold text-active mt-2">{(stats?.activeUsers || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Last 30 days</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Pending Activation</p>
              <p className="text-4xl font-bold text-pending mt-2">
                {(stats?.pendingActivation || 0).toLocaleString()}
              </p>
              <p className="text-xs text-slate-400 mt-1">Not verified</p>
            </Card>
            <Card>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">School Admins</p>
              <p className="text-4xl font-bold text-slate-900 mt-2">{(stats?.schoolAdmins || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">Institutions</p>
            </Card>
          </div>

          {/* Sidebar + content */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Filter Sidebar */}
            <div className="w-full lg:w-56 shrink-0 sticky self-start top-6">
              <div className="bg-white border border-slate-300 p-5 space-y-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
                </p>

                {/* Search */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Name or email…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 focus:ring-1 focus:ring-secondary outline-none text-slate-700 placeholder:text-slate-300"
                    />
                  </div>
                </div>

                {/* Role */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    Role
                  </label>
                  <div className="space-y-1">
                    {ROLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedRole(opt.value)}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                          selectedRole === opt.value
                            ? "bg-secondary text-white font-medium"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-800">{filteredCount}</span> users found
                </p>
                <div className="flex items-center gap-1 bg-white border border-slate-200 p-0.5">
                  <button
                    aria-label="Card view"
                    onClick={() => setViewMode("cards")}
                    className={`p-1.5 transition-colors ${
                      viewMode === "cards" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    aria-label="Table view"
                    onClick={() => setViewMode("table")}
                    className={`p-1.5 transition-colors ${
                      viewMode === "table" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Empty state */}
              {paginated.length === 0 ? (
                <div className="bg-white border border-slate-300 p-12 text-center">
                  <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">No users found matching your criteria.</p>
                </div>
              ) : viewMode === "cards" ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {paginated.map((u) => (
                    <UserCard
                      key={u.id}
                      user={u}
                      online={online}
                      fetchingActivation={fetchingActivation}
                      onAssign={() => openAssign(u)}
                      onToggleStatus={() => void handleToggleUserStatus(u)}
                      onGetActivationToken={() => void handleGetActivationToken(u)}
                    />
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-slate-300 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/20 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          User
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Role
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Last Login
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Status
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginated.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar
                                src={u.photoUrl}
                                firstName={u.firstName}
                                lastName={u.lastName}
                                role="deo"
                                size="sm"
                              />
                              <div>
                                <p className="font-bold text-slate-700">
                                  {u.firstName} {u.lastName}
                                </p>
                                <p className="text-xs text-slate-400">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600">
                              {USER_ROLE_LABELS[u.role] || u.role}
                            </span>
                            <p className="text-xs text-slate-400 mt-0.5">{scopeLine(u)}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs rounded-full font-semibold px-2 py-0.5 ${
                                u.isActive ? "text-slate-100 bg-active" : "text-slate-400 bg-slate-100"
                              }`}
                            >
                              {u.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              {u.emailVerified === false && (
                                <button
                                  disabled={fetchingActivation || !online}
                                  onClick={() => void handleGetActivationToken(u)}
                                  className="text-xs font-semibold px-2 rounded-button py-1 border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
                                >
                                  Activation URL
                                </button>
                              )}
                              <button
                                disabled={!online}
                                onClick={() => openAssign(u)}
                                className="text-xs font-medium px-2 py-1 rounded-button border border-slate-300 text-slate-100 bg-secondary hover:bg-secondary/70 hover:text transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isAssigned(u) ? "Re-assign" : "Assign"}
                              </button>
                              <button
                                disabled={!online}
                                onClick={() => void handleToggleUserStatus(u)}
                                className={`text-xs font-semibold px-2 rounded-button py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                  u.isActive
                                    ? "text-red-600 border border-red-200 hover:bg-red-50"
                                    : "text-slate-100 bg-active hover:opacity-90"
                                }`}
                              >
                                {u.isActive ? "Disable" : "Enable"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-slate-400">
                    Page {currentPage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      aria-label="Previous page"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 7) page = i + 1;
                      else if (currentPage <= 4) page = i + 1;
                      else if (currentPage >= totalPages - 3) page = totalPages - 6 + i;
                      else page = currentPage - 3 + i;
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${
                            currentPage === page ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                    <button
                      aria-label="Next page"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {pendingDisable && (
        <DisableUserModal
          userName={pendingDisable.name}
          onClose={() => setPendingDisable(null)}
          onConfirm={handleConfirmDisable}
        />
      )}

      {activationData && (
        <Modal isOpen={true} onClose={() => setActivationData(null)} title="Activation Link">
          <ActivationLinkDisplay
            activationUrl={activationData.activationUrl}
            email={activationData.email}
            userName={activationData.name}
            onClose={() => setActivationData(null)}
          />
        </Modal>
      )}

      {assignTarget && (
        <AssignUserModal
          userId={assignTarget.id}
          userName={assignTarget.name}
          userRole={assignTarget.role}
          districts={districts}
          institutions={schools.map((s) => ({ id: s.id, name: s.name }))}
          isLoadingDistricts={options.status === "idle" || options.status === "loading"}
          online={online}
          onClose={() => setAssignTarget(null)}
          onSuccess={(refreshed) => {
            setAssignTarget(null);
            afterCommand(refreshed);
          }}
        />
      )}
    </>
  );
}
