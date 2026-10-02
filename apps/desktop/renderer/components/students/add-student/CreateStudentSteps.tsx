'use client';
import type { GradeLevel as GradeLevelValue } from '@nemis-desktop/types';
import { Button, Input } from '@nemis-desktop/ui';
import { human } from '../shared';

export interface GuardianDraft {
  firstName: string;
  lastName: string;
  relationship: string;
  phoneNumber: string;
  email: string;
  isPrimary: boolean;
}

export function GuardianStep({
  guardians,
  updateGuardian,
  addGuardian,
  removeGuardian,
}: {
  guardians: GuardianDraft[];
  updateGuardian: (index: number, field: keyof GuardianDraft, value: string | boolean) => void;
  addGuardian: () => void;
  removeGuardian: (index: number) => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Guardian Information</h2>
      {guardians.map((g, index) => (
        <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-900">
              Guardian {index + 1} {g.isPrimary && <span className="text-xs text-sky-700">(Primary)</span>}
            </h3>
            {guardians.length > 1 && (
              <button type="button" className="text-red-600 text-sm" onClick={() => removeGuardian(index)}>
                Remove
              </button>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Guardian first name"
              value={g.firstName}
              onChange={(e) => updateGuardian(index, 'firstName', e.target.value)}
            />
            <Input
              label="Guardian last name"
              value={g.lastName}
              onChange={(e) => updateGuardian(index, 'lastName', e.target.value)}
            />
            <Input
              label="Relationship"
              value={g.relationship}
              onChange={(e) => updateGuardian(index, 'relationship', e.target.value)}
            />
            <Input
              label="Guardian phone"
              value={g.phoneNumber}
              onChange={(e) => updateGuardian(index, 'phoneNumber', e.target.value)}
            />
            <Input
              label="Guardian email"
              type="email"
              value={g.email}
              onChange={(e) => updateGuardian(index, 'email', e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={g.isPrimary}
              onChange={(e) => updateGuardian(index, 'isPrimary', e.target.checked)}
            />
            Primary contact
          </label>
        </div>
      ))}
      <Button type="button" variant="secondary" fullWidth onClick={addGuardian}>
        Add another guardian
      </Button>
    </div>
  );
}

export function ReviewStep({
  firstName,
  middleName,
  lastName,
  dob,
  grade,
  className,
  termName,
  guardians,
  profileMissing,
}: {
  firstName: string;
  middleName: string;
  lastName: string;
  dob: string;
  grade: GradeLevelValue | '';
  className?: string;
  termName?: string;
  guardians: GuardianDraft[];
  profileMissing: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Review & Submit</h2>
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">Student Information</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-gray-600">Name</dt>
            <dd className="font-medium">
              {firstName} {middleName} {lastName}
            </dd>
          </div>
          <div>
            <dt className="text-gray-600">Date of birth</dt>
            <dd className="font-medium">{dob}</dd>
          </div>
          <div>
            <dt className="text-gray-600">Grade</dt>
            <dd className="font-medium">{grade ? human(grade) : 'Not selected'}</dd>
          </div>
          {className !== undefined && (
            <div>
              <dt className="text-gray-600">Class</dt>
              <dd className="font-medium">{className}</dd>
            </div>
          )}
          {termName !== undefined && (
            <div>
              <dt className="text-gray-600">Term</dt>
              <dd className="font-medium">{termName}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-3">Guardian Information</h3>
        {guardians.filter((g) => g.firstName && g.lastName && g.phoneNumber).length === 0 && (
          <p className="text-sm text-gray-600">No guardians added.</p>
        )}
        {guardians
          .filter((g) => g.firstName && g.lastName && g.phoneNumber)
          .map((g, i) => (
            <p key={i} className="text-sm text-gray-700">
              {g.firstName} {g.lastName} — {g.relationship} {g.isPrimary && '(Primary)'}
            </p>
          ))}
      </div>
      {profileMissing && (
        <p className="text-sm text-red-700">
          A school profile must be provisioned before students can be created.
        </p>
      )}
    </div>
  );
}
