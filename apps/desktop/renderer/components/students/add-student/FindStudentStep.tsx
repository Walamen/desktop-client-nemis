'use client';
import { useState } from 'react';
import type { RegistryHit } from '@nemis-desktop/types';
import { Button, Input } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { registryBridge, parseIpcError } from '@/services/nemis-bridge/school-admin/registry-bridge';
import { branchForLookup } from './wizard-logic';

export type FindOutcome =
  | { kind: 'hit'; hit: RegistryHit; dateOfBirth: string }
  | { kind: 'new'; assertedNoNemisId: boolean; dateOfBirth: string };

/** Step 1. Online, a national lookup; offline (spec D1) only the first-time
 * enrollee assertion can proceed. A miss is reported uniformly. */
export function FindStudentStep({ onDone }: { onDone: (outcome: FindOutcome) => void }) {
  const connectivity = useConnectivityStore();
  const isOnline = useViewModel(connectivity.store, (s) => s.isOnline);
  const [nemisId, setNemisId] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [asserted, setAsserted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [missed, setMissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    setMissed(false);
    setError(null);
    try {
      const result = await registryBridge.lookupStudent({ nemisId, dateOfBirth });
      if (branchForLookup(result) === 'miss' || !result.found) setMissed(true);
      else onDone({ kind: 'hit', hit: result, dateOfBirth });
    } catch (cause) {
      const parsed = parseIpcError(cause);
      setError(
        parsed && (parsed.code === 'RATE_LIMITED' || parsed.code === 'REMOTE_REJECTED' || parsed.code === 'OFFLINE')
          ? parsed.message
          : 'The lookup could not be completed. Please try again.',
      );
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Find Student</h2>
      {!isOnline && (
        <p className="text-sm text-amber-700">
          Searching for a transferring student needs a connection. You can still enrol a first-time student.
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <Input
          label="NEMIS ID"
          value={nemisId}
          disabled={!isOnline || asserted}
          onChange={(e) => {
            setNemisId(e.target.value);
            setMissed(false);
          }}
        />
        <Input
          label="Date of birth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => {
            setDateOfBirth(e.target.value);
            setMissed(false);
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={asserted}
          onChange={(e) => {
            setAsserted(e.target.checked);
            setMissed(false);
          }}
        />
        This child has no NEMIS ID (first-time enrollee)
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {missed && (
        <div className="text-sm text-slate-700 space-y-2">
          <p>No matching student.</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onDone({ kind: 'new', assertedNoNemisId: false, dateOfBirth })}
          >
            Continue as a new student
          </Button>
        </div>
      )}
      <div className="flex justify-end">
        {asserted ? (
          <Button type="button" onClick={() => onDone({ kind: 'new', assertedNoNemisId: true, dateOfBirth })}>
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            disabled={!isOnline || searching || !nemisId.trim() || !dateOfBirth}
            onClick={() => void search()}
          >
            {searching ? 'Searching…' : 'Search'}
          </Button>
        )}
      </div>
    </div>
  );
}
