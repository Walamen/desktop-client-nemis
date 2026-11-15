"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import type { DeoSchoolRow } from "@nemis-desktop/types";
import { formatLevels } from "@nemis-desktop/presentation";

interface SchoolsAtGlanceProps {
  schools: DeoSchoolRow[];
  isLoading?: boolean;
}

export function SchoolsAtGlance({ schools, isLoading }: SchoolsAtGlanceProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "Compliant":
        return "text-slate-100 bg-active";
      case "Needs Review":
        return "text-orange-600 bg-orange-50";
      case "Flagged":
        return "text-red-600 bg-red-50";
      default:
        return "text-slate-100 bg-active";
    }
  };

  const getAttendanceColor = (attendance: number | null) => {
    if (attendance === null) return "text-gray-400";
    if (attendance >= 90) return "text-green-600";
    if (attendance >= 75) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <div data-section className="bg-white rounded-lg  border border-gray-300 overflow-hidden font-['Sora']">
      <div className="bg-secondary/20 flex items-center justify-between p-6 border-b border-gray-300">
        <h3 className="text-lg font-bold text-slate-700">Schools at a Glance</h3>
        <Link
          href="/government/deo/schools"
          className="text-sm font-semibold text-secondary hover:text-primary transition-colors"
        >
          View All →
        </Link>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
        {isLoading ? (
          <div className="p-4 animate-pulse space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100" />
            ))}
          </div>
        ) : schools.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No schools found</p>
          </div>
        ) : (
          <table className="w-full min-w-[640px] table-auto">
            <thead className="bg-gray-50 border-b border-gray-300 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-[40%]">
                  School
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                  Students
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                  Attend.
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {schools.map((school) => (
                <tr
                  key={school.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-6 py-4 max-w-[280px]">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 break-words">
                        {school.name}
                      </div>
                      <div className="text-xs text-gray-500 whitespace-nowrap">
                        {formatLevels(school.levels)}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    {school.students.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`text-sm font-semibold ${getAttendanceColor(school.attendanceRate)}`}
                    >
                      {school.attendanceRate === null
                        ? "—"
                        : `${school.attendanceRate}%`}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-3 py-1 text-xs font-semibold  ${getStatusColor(school.complianceStatus)}`}
                    >
                      {school.complianceStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
