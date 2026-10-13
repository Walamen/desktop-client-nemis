import { useState } from 'react';
import type { SetupDrawerTarget } from '@/lib/academic-setup';

/** The drawers on the Academic Grading page. 'setup' is the grading
 * configuration drawer; the rest are reachable by `?open=` deep links. */
export type SetupDrawer = 'setup' | SetupDrawerTarget;

/** Switch the page to another drawer (closing the current one). `yearId`
 * pre-selects the year when switching to Terms. */
export type SetupNavigate = (drawer: SetupDrawer, opts?: { yearId?: string }) => void;

export interface SetupDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: SetupNavigate;
}

/** A number that changes every time `isOpen` goes from false to true. Used as
 * the `key` of a drawer's body so each open starts fresh on the list view —
 * framer-motion's AnimatePresence would otherwise keep the old body (and a
 * half-filled form) if the drawer is reopened while its exit animation runs. */
export function useOpenSession(isOpen: boolean): number {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setSession((s) => s + 1);
  }
  return session;
}
