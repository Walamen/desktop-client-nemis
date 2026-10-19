"use client";

import { Phone } from "lucide-react";
import type { CountyUserListItem } from "@nemis-desktop/types";
import { SchoolPhoto } from "@/components/county/schools/SchoolPhoto";

export const USER_ROLE_LABELS: Record<CountyUserListItem["role"], string> = {
  DEO: "DEO",
  INSTITUTION_ADMIN: "School Admin",
};

/** The web's scope line: school, then district, else "County Level". */
export const scopeLine = (u: CountyUserListItem) => u.schoolName ?? u.districtName ?? "County Level";

/** Assign vs Re-assign: the user's link has a district or a school. */
export const isAssigned = (u: CountyUserListItem) => !!(u.districtId || u.institutionId);

/** portal-web county/users UserCard: photo on the left 40%, details right. */
export function UserCard({
  user,
  online,
  fetchingActivation,
  onAssign,
  onToggleStatus,
  onGetActivationToken,
}: {
  user: CountyUserListItem;
  online: boolean;
  fetchingActivation: boolean;
  onAssign: () => void;
  onToggleStatus: () => void;
  onGetActivationToken: () => void;
}) {
  return (
    <div className="bg-white border rounded-lg border-slate-300 hover:shadow-md transition-shadow flex overflow-hidden">
      {/* Image — 40% width, stretches to full card height */}
      <div className="w-2/5 shrink-0 relative bg-slate-100">
        <SchoolPhoto
          fallback="/deo-fallback.jpg"
          src={user.photoUrl || "/deo-fallback.jpg"}
          alt={`${user.firstName} ${user.lastName}`}
          fill
          sizes="(max-width: 1024px) 40vw, 20vw"
          className="object-cover"
        />
      </div>

      {/* Content — remaining 60% */}
      <div className="flex-1 min-w-0 p-4 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{user.email}</p>
          </div>
          <span
            className={`shrink-0 text-xs rounded-full font-semibold px-2 py-0.5 ${
              user.isActive ? "text-slate-100 bg-active" : "text-slate-400 bg-slate-100"
            }`}
          >
            {user.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600">
            {USER_ROLE_LABELS[user.role] || user.role}
          </span>
          <p className="text-xs text-slate-400 truncate">{scopeLine(user)}</p>
        </div>

        {user.phoneNumber && (
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{user.phoneNumber}</span>
          </p>
        )}

        <div className="mt-auto pt-3 border-t border-slate-100 flex justify-end gap-2 ">
          {user.emailVerified === false && (
            <button
              disabled={fetchingActivation || !online}
              onClick={onGetActivationToken}
              className="text-xs font-semibold px-2 py-1 rounded-button border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40"
            >
              Activation URL
            </button>
          )}
          <button
            disabled={!online}
            onClick={onAssign}
            className="text-xs font-semibold px-2 py-1 rounded-button border border-slate-200 text-slate-100 bg-secondary hover:bg-secondary/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAssigned(user) ? "Re-assign" : "Assign"}
          </button>
          <button
            disabled={!online}
            onClick={onToggleStatus}
            className={`text-xs font-semibold px-2 py-1 rounded-button transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              user.isActive
                ? "text-red-600 border border-red-200 hover:bg-red-50"
                : "text-slate-100 bg-active hover:opacity-90"
            }`}
          >
            {user.isActive ? "Disable" : "Enable"}
          </button>
        </div>
      </div>
    </div>
  );
}
