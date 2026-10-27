'use client';
import { useEffect, useRef, useState } from 'react';
import type { RegistryHit, RegistryNameMatch } from '@nemis-desktop/types';
import { Button, Input } from '@nemis-desktop/ui';
import { useViewModel } from '@/hooks/use-view-model';
import { useConnectivityStore } from '@/lib/presentation/hooks/shared';
import { registryBridge, parseIpcError } from '@/services/nemis-bridge/school-admin/registry-bridge';
import { branchForLookup, maskNemisId, type LookupPreset } from './wizard-logic';

export type FindOutcome =
  | { kind: 'hit'; hit: RegistryHit; dateOfBirth: string }
  | { kind: 'new'; assertedNoNemisId: boolean; dateOfBirth: string };

type Mode = 'id' | 'name';

function lookupErrorMessage(cause: unknown): string {
  const parsed = parseIpcError(cause);
  return parsed && (parsed.code === 'RATE_LIMITED' || parsed.code === 'REMOTE_REJECTED' || parsed.code === 'OFFLINE')
    ? parsed.message
    : 'The lookup could not be completed. Please try again.';
}

/** Step 1. Online, a national lookup by NEMIS ID or by name; offline (spec D1)
 * only the first-time enrollee assertion can proceed. A miss is reported
 * uniformly. `preset` (from `?nemisId=&dob=`) runs the ID lookup once. */
export function FindStudentStep({
  onDone,
  preset = null,
}: {
  onDone: (outcome: FindOutcome) => void;
  preset?: LookupPreset | null;
}) {
  const connectivity = useConnectivityStore();
  const isOnline = useViewModel(connectivity.store, (s) => s.isOnline);
  const [mode, setMode] = useState<Mode>('id');
  const [nemisId, setNemisId] = useState(preset?.nemisId ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(preset?.dateOfBirth ?? '');
  const [asserted, setAsserted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [missed, setMissed] = useState(false);
  const [matches, setMatches] = useState<{ items: RegistryNameMatch[]; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const presetRan = useRef<LookupPreset | null>(null);

  const clearResults = () => {
    setMissed(false);
    setMatches(null);
  };

  const lookupById = async (id: string, dob: string) => {
    setSearching(true);
    clearResults();
    setError(null);
    try {
      const result = await registryBridge.lookupStudent({ nemisId: id, dateOfBirth: dob });
      if (branchForLookup(result) === 'miss' || !result.found) setMissed(true);
      else onDone({ kind: 'hit', hit: result, dateOfBirth: dob });
    } catch (cause) {
      setError(lookupErrorMessage(cause));
    } finally {
      setSearching(false);
    }
  };

  const lookupByName = async () => {
    setSearching(true);
    clearResults();
    setError(null);
    try {
      const result = await registryBridge.lookupStudentByName({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth,
      });
      if (!result.found) setMissed(true);
      else setMatches({ items: result.matches, truncated: result.truncated });
    } catch (cause) {
      setError(lookupErrorMessage(cause));
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (!preset || !isOnline || presetRan.current === preset) return;
    presetRan.current = preset;
    setNemisId(preset.nemisId);
    setDateOfBirth(preset.dateOfBirth);
    void lookupById(preset.nemisId, preset.dateOfBirth);
    // lookupById only closes over setters and the stable onDone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, isOnline]);

  const switchMode = (next: Mode) => {
    setMode(next);
    clearResults();
    setError(null);
  };

  const canSearch =
    mode === 'id'
      ? Boolean(nemisId.trim() && dateOfBirth)
      : Boolean(firstName.trim() && lastName.trim() && dateOfBirth);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Find Student</h2>
      {!isOnline && (
        <p className="text-sm text-amber-700">
          Searching for a transferring student needs a connection. You can still enrol a first-time student.
        </p>
      )}
      <div className="flex gap-2">
        {(
          [
            ['id', 'Search by NEMIS ID'],
            ['name', 'Search by name'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            variant={mode === value ? 'primary' : 'secondary'}
            aria-pressed={mode === value}
            disabled={asserted}
            onClick={() => switchMode(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {mode === 'id' ? (
          <Input
            label="NEMIS ID"
            value={nemisId}
            disabled={!isOnline || asserted}
            onChange={(e) => {
              setNemisId(e.target.value);
              clearResults();
            }}
          />
        ) : (
          <>
            <Input
              label="First name"
              value={firstName}
              disabled={!isOnline || asserted}
              onChange={(e) => {
                setFirstName(e.target.value);
                clearResults();
              }}
            />
            <Input
              label="Last name"
              value={lastName}
              disabled={!isOnline || asserted}
              onChange={(e) => {
                setLastName(e.target.value);
                clearResults();
              }}
            />
          </>
        )}
        <Input
          label="Date of birth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => {
            setDateOfBirth(e.target.value);
            clearResults();
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={asserted}
          onChange={(e) => {
            setAsserted(e.target.checked);
            clearResults();
          }}
        />
        This child has no NEMIS ID (first-time enrollee)
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {matches && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Students matching this name and date of birth</h3>
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {matches.items.map((m) => (
              <li key={m.nemisId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>{`${m.firstName} ${m.lastName} — ${m.schoolName} — NEMIS ID ${maskNemisId(m.nemisId)}`}</span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={searching}
                  onClick={() => void lookupById(m.nemisId, dateOfBirth)}
                >
                  Choose
                </Button>
              </li>
            ))}
          </ul>
          {matches.truncated && (
            <p className="text-xs text-slate-600">
              More students match than are shown. Check the spelling or search by NEMIS ID.
            </p>
          )}
        </div>
      )}
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
            disabled={!isOnline || searching || !canSearch}
            onClick={() => void (mode === 'id' ? lookupById(nemisId, dateOfBirth) : lookupByName())}
          >
            {searching ? 'Searching…' : 'Search'}
          </Button>
        )}
      </div>
    </div>
  );
}
