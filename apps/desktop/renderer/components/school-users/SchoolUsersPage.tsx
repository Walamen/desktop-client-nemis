"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus, ShieldCheck, Users, WifiOff } from "lucide-react";
import { ErrorState, Spinner } from "@nemis-desktop/ui";
import { SCHOOL_MODULE_LABELS, type CreateSchoolUserResult, type SchoolOfficeUser } from "@nemis-desktop/types";
import { useSchoolUsersViewModel } from "@/lib/presentation/hooks/school-admin";
import { useConnectivityStore, useNotificationStore } from "@/lib/presentation/hooks/shared";
import { useViewModel } from "@/hooks/use-view-model";
import { parseIpcError } from "@/lib/errors/parseIpcError";
import { schoolUsersBridge } from "@/services/nemis-bridge/school-admin/school-users-bridge";
import { DisableUserModal } from "@/components/county/users/DisableUserModal";
import { SchoolUserDrawer } from "./SchoolUserDrawer";
import { CredentialPanel } from "./CredentialPanel";

const DEVICE_BANNER = "You're offline. These are the accounts saved on this device. Changes need a connection.";
const OFFLINE_NOTE = "Connect to the internet to add or change office accounts.";
const SAVED_TOAST =
  "Saved. A signed-in desktop picks up the change the next time it reconnects, or when the person signs in again.";

const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`;

const lastSignIn = (u: SchoolOfficeUser) =>
  u.lastLoginAt ? `Last sign-in ${new Date(u.lastLoginAt).toLocaleDateString()}` : "Never signed in";

function SchoolUserCard({
  user,
  canChange,
  onEdit,
  onToggleActive,
}: {
  user: SchoolOfficeUser;
  canChange: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const isAdmin = user.role === "INSTITUTION_ADMIN";
  return (
    <article
      aria-label={fullName(user)}
      className="bg-white border rounded-lg border-slate-300 hover:shadow-md transition-shadow p-4 flex flex-col"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{fullName(user)}</p>
          {user.email && <p className="text-xs text-slate-400 mt-0.5 truncate">{user.email}</p>}
          {user.title && <p className="text-xs text-slate-500 mt-0.5">{user.title}</p>}
        </div>
        <span
          className={`shrink-0 text-xs rounded-full font-semibold px-2 py-0.5 ${
            user.isActive ? "text-slate-100 bg-active" : "text-slate-400 bg-slate-100"
          }`}
        >
          {user.isActive ? "Active" : "Disabled"}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600">
          {isAdmin ? "School Admin" : "School Office Staff"}
        </span>
        {isAdmin ? (
          <span className="text-xs text-slate-400">Full access</span>
        ) : (
          user.modules.map((m) => (
            <span key={m} className="text-xs px-2 py-0.5 rounded-full bg-secondary/10 text-slate-700">
              {SCHOOL_MODULE_LABELS[m]}
            </span>
          ))
        )}
      </div>

      <p className="mt-2 text-xs text-slate-400">{lastSignIn(user)}</p>

      {!isAdmin && (
        <div className="mt-auto pt-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            disabled={!canChange}
            onClick={onEdit}
            className="text-xs font-semibold px-2 py-1 rounded-button border border-slate-200 text-slate-100 bg-secondary hover:bg-secondary/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={!canChange}
            onClick={onToggleActive}
            className={`text-xs font-semibold px-2 py-1 rounded-button transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              user.isActive
                ? "text-red-600 border border-red-200 hover:bg-red-50"
                : "text-slate-100 bg-active hover:opacity-90"
            }`}
          >
            {user.isActive ? "Disable" : "Enable"}
          </button>
        </div>
      )}
    </article>
  );
}

type DrawerState = { open: false } | { open: true; user: SchoolOfficeUser | null };

/** School Admin Users & Access: the school's admin and office staff, with
 * online-only create, edit and enable/disable. Offline (or when the server
 * cannot be reached) it shows the accounts stored on this device, read-only. */
export function SchoolUsersPage() {
  const vm = useSchoolUsersViewModel();
  const users = useViewModel(vm.store, (s) => s.users);
  const connectivity = useConnectivityStore();
  const online = useViewModel(connectivity.store, (s) => s.isOnline);
  const notifications = useNotificationStore();

  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [pendingDisable, setPendingDisable] = useState<SchoolOfficeUser | null>(null);
  // Shown once, then dropped from state on Done.
  const [credential, setCredential] = useState<{ name: string; email: string; password: string } | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    void vm.load();
  }, [vm]);

  if (users.status === "idle" || users.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (users.status === "error" || users.status === "empty") {
    return (
      <div className="p-8">
        <ErrorState
          message={users.status === "error" ? users.error.userMessage : "Couldn't load the school's accounts."}
          onRetry={() => void vm.load()}
        />
      </div>
    );
  }

  const result = users.data;
  const fromDevice = result.source === "device";
  const canChange = online && !fromDevice;

  const setActive = async (user: SchoolOfficeUser, isActive: boolean) => {
    setActionError("");
    try {
      await schoolUsersBridge.setActive({ userId: user.id, isActive });
      notifications.success(SAVED_TOAST);
      void vm.load();
    } catch (error) {
      setActionError(parseIpcError(error)?.message || "Couldn't change the account. Please try again.");
    }
  };

  const onCreated = (created: CreateSchoolUserResult) => {
    setDrawer({ open: false });
    const name = fullName(created.user);
    if (created.credential) {
      setCredential({ name, email: created.credential.email, password: created.credential.defaultPassword });
    } else {
      notifications.success(`${name} can now sign in with their existing password.`);
    }
    void vm.load();
  };

  const onUpdated = () => {
    setDrawer({ open: false });
    notifications.success(SAVED_TOAST);
    void vm.load();
  };

  return (
    <>
      <div className="min-h-screen bg-slate-100 font-['Sora']">
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-0.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> School
            </p>
            <h1 className="text-xl font-bold text-white">Users & Access</h1>
          </div>
          <button
            type="button"
            disabled={!canChange}
            onClick={() => {
              setActionError("");
              setDrawer({ open: true, user: null });
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-200 rounded-button text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            Add office user
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          {fromDevice && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">{DEVICE_BANNER}</p>
            </div>
          )}

          {!canChange && <p className="text-sm text-slate-500">{OFFLINE_NOTE}</p>}

          {actionError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-600">{actionError}</p>
            </div>
          )}

          {credential && (
            <CredentialPanel
              name={credential.name}
              email={credential.email}
              password={credential.password}
              onDone={() => setCredential(null)}
            />
          )}

          {result.users.length === 0 ? (
            <div className="bg-white border border-slate-300 p-12 text-center">
              <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No accounts yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {result.users.map((u) => (
                <SchoolUserCard
                  key={u.id}
                  user={u}
                  canChange={canChange}
                  onEdit={() => {
                    setActionError("");
                    setDrawer({ open: true, user: u });
                  }}
                  onToggleActive={() => {
                    if (u.isActive) setPendingDisable(u);
                    else void setActive(u, true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <SchoolUserDrawer
        isOpen={drawer.open}
        user={drawer.open ? drawer.user : null}
        linkableStaff={result.linkableStaff}
        canChange={canChange}
        onClose={() => setDrawer({ open: false })}
        onCreated={onCreated}
        onUpdated={onUpdated}
      />

      {pendingDisable && (
        <DisableUserModal
          userName={fullName(pendingDisable)}
          onClose={() => setPendingDisable(null)}
          onConfirm={async () => {
            await setActive(pendingDisable, false);
            setPendingDisable(null);
          }}
        />
      )}
    </>
  );
}
