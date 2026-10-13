'use client';

import { Drawer } from '@nemis-desktop/ui';
import { GradingPeriodsPanel } from './GradingPeriodsPanel';
import type { SetupDrawerProps } from './setup-drawers';

/** Assessment periods, managed from a drawer on the Academic Grading page.
 * The panel's create/edit form is already inline, so no form view is needed. */
export function AssessmentPeriodsDrawer({ isOpen, onClose, onNavigate }: SetupDrawerProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Assessment Periods" size="xl">
      <GradingPeriodsPanel onNavigate={onNavigate} />
    </Drawer>
  );
}
