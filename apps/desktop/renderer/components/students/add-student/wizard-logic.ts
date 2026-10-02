import type { GradeLevel, RegistryHit, RegistryLookupResult } from '@nemis-desktop/types';
import { human } from '../shared';

export type WizardBranch = 'find' | 'claim' | 'request' | 'create';

/** A miss is one outcome — the screen must not tell a wrong ID from a wrong
 * birth date. The server computes claimPath; the client only reads it. */
export function branchForLookup(result: RegistryLookupResult): 'claim' | 'request' | 'miss' {
  if (!result.found) return 'miss';
  return result.claimPath === 'IMMEDIATE' ? 'claim' : 'request';
}

/** The stamp's next grade, or '' when there is none (GRADUATED, or no stamp):
 * an empty field must never be presented as a suggestion. */
export function claimGradeDefault(hit: RegistryHit): GradeLevel | '' {
  return hit.lastCompletion?.nextGradeLevel ?? '';
}

/** The server requires an override reason whenever the claimed grade differs
 * from the stamp's next grade — always, when that is null. */
export function claimNeedsReason(hit: RegistryHit, chosen: GradeLevel | ''): boolean {
  const next = hit.lastCompletion?.nextGradeLevel ?? null;
  return next === null || chosen !== next;
}

const OUTCOME: Record<'PROMOTED' | 'RETAINED' | 'GRADUATED', string> = {
  PROMOTED: 'Promoted', RETAINED: 'Retained', GRADUATED: 'Graduated',
};

export function describeCompletion(hit: RegistryHit): string | null {
  const c = hit.lastCompletion;
  if (!c) return null;
  const next = c.nextGradeLevel ? ` to ${human(c.nextGradeLevel)}` : '';
  return `${human(c.gradeLevel)} — ${OUTCOME[c.outcome]}${next} (${c.academicYearName})`;
}
