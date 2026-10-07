'use client';

import { useCallback, useEffect, useState } from 'react';

const storageKey = (role: string) => `nemis.sidebar.collapsed.${role}`;

function readCollapsed(role: string): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(storageKey(role));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch (error) {
    console.warn('[sidebar] collapsed-group state unreadable; showing all groups open', error);
    return new Set();
  }
}

function writeCollapsed(role: string, collapsed: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(storageKey(role), JSON.stringify([...collapsed]));
  } catch (error) {
    console.warn('[sidebar] collapsed-group state not saved', error);
  }
}

/** Which sidebar groups this device has collapsed, for one role. A per-device
 * convenience only: storage failures fall back to "all open" and never break
 * navigation. Reads after mount so the static export never hydrates against
 * storage. */
export function useCollapsedGroups(role: string, enabled: boolean) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (enabled) setCollapsed(readCollapsed(role));
  }, [role, enabled]);

  const toggle = useCallback(
    (label: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(label)) next.delete(label);
        else next.add(label);
        writeCollapsed(role, next);
        return next;
      });
    },
    [role],
  );

  return { collapsed, toggle };
}
