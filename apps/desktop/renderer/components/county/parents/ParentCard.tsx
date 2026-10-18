"use client";

import Link from "next/link";
import { ArrowRight, Mail, Phone } from "lucide-react";
import type { CountyGuardianListItem } from "@nemis-desktop/types";
import { SchoolPhoto } from "@/components/county/schools/SchoolPhoto";

/** portal-web county/parents ParentCard: photo on the left 40%, details right. */
export function ParentCard({ guardian }: { guardian: CountyGuardianListItem }) {
  return (
    <div className="bg-white rounded-lg border border-slate-300 hover:shadow-md transition-shadow flex overflow-hidden">
      {/* Image — 40% width, stretches to full card height */}
      <div className="w-2/5 shrink-0 relative bg-slate-100">
        <SchoolPhoto
          fallback="/parent-fallback.jpg"
          src={guardian.photoUrl || "/parent-fallback.jpg"}
          alt={`${guardian.firstName} ${guardian.lastName}`}
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
              {guardian.firstName} {guardian.lastName}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{guardian.relationship || "—"}</p>
          </div>
          <span className="shrink-0 text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-600">
            {guardian.studentsCount} {guardian.studentsCount === 1 ? "child" : "children"}
          </span>
        </div>

        <div className="mt-3 space-y-1">
          {guardian.phoneNumber && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{guardian.phoneNumber}</span>
            </p>
          )}
          {guardian.email && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{guardian.email}</span>
            </p>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-end">
          <Link
            href={`/government/county/parents/details?id=${encodeURIComponent(guardian.id)}`}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 transition-colors shrink-0"
          >
            View Profile <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
