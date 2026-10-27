import type { GradeLevel, RegistryHit, RegistryLookupResult } from '@nemis-desktop/types';
import { human } from '../shared';

export type WizardBranch = 'find' | 'claim' | 'request' | 'enrolled' | 'create';

/** A miss is one outcome — the screen must not tell a wrong ID from a wrong
 * birth date. The server computes claimPath; the client only reads it. */
export function branchForLookup(result: RegistryLookupResult): 'claim' | 'request' | 'enrolled' | 'miss' {
  if (!result.found) return 'miss';
  if (result.claimPath === 'ALREADY_ENROLLED') return 'enrolled';
  return result.claimPath === 'IMMEDIATE' ? 'claim' : 'request';
}

/** The grade the server says the child may enter, or '' when there is none
 * (graduated, or no FINAL card): an empty field must never be presented as a
 * suggestion. */
export function claimGradeDefault(hit: RegistryHit): GradeLevel | '' {
  return hit.eligibleGradeLevel ?? '';
}

/** The server requires an override reason whenever the claimed grade differs
 * from the eligible grade — always, when there is none. */
export function claimNeedsReason(hit: RegistryHit, chosen: GradeLevel | ''): boolean {
  return hit.eligibleGradeLevel === null || chosen !== hit.eligibleGradeLevel;
}

const OUTCOME: Record<'PROMOTED' | 'RETAINED' | 'GRADUATED' | 'WITHDRAWN', string> = {
  PROMOTED: 'Promoted', RETAINED: 'Retained', GRADUATED: 'Graduated', WITHDRAWN: 'Withdrawn',
};

export function describeCompletion(hit: RegistryHit): string | null {
  const c = hit.lastCompletion;
  if (!c) return null;
  const next = c.nextGradeLevel ? ` to ${human(c.nextGradeLevel)}` : '';
  return `${human(c.gradeLevel)} — ${OUTCOME[c.outcome]}${next} (${c.academicYearName})`;
}

/** A NEMIS ID shown before the admin has picked the match. */
export function maskNemisId(nemisId: string): string {
  return `•••• •••• ${nemisId.slice(-4)}`;
}

export interface LookupPreset {
  nemisId: string;
  dateOfBirth: string;
}

/** `?nemisId=&dob=` — the students directory links here to enrol a returning
 * child. Both must be present. */
export function readLookupPreset(search: string): LookupPreset | null {
  const params = new URLSearchParams(search);
  const nemisId = params.get('nemisId')?.trim() ?? '';
  const dateOfBirth = params.get('dob')?.trim() ?? '';
  return nemisId && dateOfBirth ? { nemisId, dateOfBirth } : null;
}
