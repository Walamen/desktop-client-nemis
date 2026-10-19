"use client";

import { useState } from "react";
import { Modal, Button } from "@nemis-desktop/ui";
import type { CountyAssignableRole } from "@nemis-desktop/types";
import { parseIpcError } from "@/lib/errors/parseIpcError";
import { countyBridge } from "@/services/nemis-bridge/county";

interface AssignUserModalProps {
  userId: string;
  userName: string;
  userRole?: string;
  districts: Array<{ id: string; name: string }>;
  institutions: Array<{ id: string; name: string }>;
  isLoadingDistricts: boolean;
  online: boolean;
  onClose: () => void;
  /** `refreshed` is false when the server took the change but the follow-up pull did not run. */
  onSuccess: (refreshed: boolean) => void;
}

type AssignmentType = "district" | "institution";

function defaultAssignmentType(role?: string): AssignmentType {
  return role === "DEO" ? "district" : "institution";
}

function defaultRole(role?: string): CountyAssignableRole | "" {
  if (role === "DEO") return "DEO";
  if (role === "INSTITUTION_ADMIN") return "INSTITUTION_ADMIN";
  return "";
}

const districtRoles: Array<{ value: CountyAssignableRole; label: string }> = [
  { value: "DEO", label: "DEO" },
  { value: "DATA_OFFICER", label: "Data Officer" },
];

const institutionRoles: Array<{ value: CountyAssignableRole; label: string }> = [
  { value: "INSTITUTION_ADMIN", label: "School Admin" },
  { value: "DATA_OFFICER", label: "Data Officer" },
];

/** portal-web county/users AssignUserModal. The district and school lists come
 * from this device; the assignment itself is an online command. */
export function AssignUserModal({
  userId,
  userName,
  userRole,
  districts,
  institutions,
  isLoadingDistricts,
  online,
  onClose,
  onSuccess,
}: AssignUserModalProps) {
  const [assignmentType, setAssignmentType] = useState<AssignmentType>(() => defaultAssignmentType(userRole));
  const [selectedDistrictId, setSelectedDistrictId] = useState("");
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [selectedRole, setSelectedRole] = useState<CountyAssignableRole | "">(() => defaultRole(userRole));
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedRole) {
      setError("Please select a role");
      return;
    }

    if (assignmentType === "district" && !selectedDistrictId) {
      setError("Please select a district");
      return;
    }
    if (assignmentType === "institution" && !selectedInstitutionId) {
      setError("Please select an institution");
      return;
    }

    setIsLoading(true);
    try {
      const result = await countyBridge.assignUser(
        assignmentType === "district"
          ? { userId, role: selectedRole, districtId: selectedDistrictId }
          : { userId, role: selectedRole, institutionId: selectedInstitutionId },
      );
      onSuccess(result.refreshed);
    } catch (err) {
      setError(parseIpcError(err)?.message || "Failed to assign user. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`Assign ${userName}`}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
        {error && (
          <div className="p-4 bg-error/10 border border-error rounded-lg">
            <p className="text-error text-sm">{error}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assignment Type <span className="text-error">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setAssignmentType("district");
                setSelectedInstitutionId("");
                setSelectedRole("");
              }}
              className={`p-4 border-2 rounded-lg text-left transition-colors ${
                assignmentType === "district"
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="font-medium text-gray-900">District</div>
              <div className="text-xs text-gray-600 mt-1">Assign to a district</div>
            </button>
            <button
              type="button"
              onClick={() => {
                setAssignmentType("institution");
                setSelectedDistrictId("");
                setSelectedRole("");
              }}
              className={`p-4 border-2 rounded-lg text-left transition-colors ${
                assignmentType === "institution"
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="font-medium text-gray-900">Institution</div>
              <div className="text-xs text-gray-600 mt-1">Assign to a school</div>
            </button>
          </div>
        </div>

        {assignmentType === "district" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                District <span className="text-error">*</span>
              </label>
              <select
                value={selectedDistrictId}
                onChange={(e) => setSelectedDistrictId(e.target.value)}
                disabled={isLoadingDistricts}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">{isLoadingDistricts ? "Loading districts..." : "Select district"}</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
              {!isLoadingDistricts && districts.length === 0 && (
                <p className="text-sm text-gray-600 mt-1">No districts available in this county</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role <span className="text-error">*</span>
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as CountyAssignableRole)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">Select role</option>
                {districtRoles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {assignmentType === "institution" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Institution <span className="text-error">*</span>
              </label>
              <select
                value={selectedInstitutionId}
                onChange={(e) => setSelectedInstitutionId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">Select institution</option>
                {institutions.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role <span className="text-error">*</span>
              </label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as CountyAssignableRole)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              >
                <option value="">Select role</option>
                {institutionRoles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isLoading} disabled={!online}>
            Assign User
          </Button>
        </div>
      </form>
    </Modal>
  );
}
