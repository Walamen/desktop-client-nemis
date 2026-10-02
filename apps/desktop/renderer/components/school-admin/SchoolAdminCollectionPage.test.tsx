import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-revalidate-on-sync', () => ({
  // Load once on mount; sync-driven reloads are not under test here.
  useRevalidateOnSync: (load: () => void) => {
    useEffect(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));
vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn().mockResolvedValue({
      items: [
        {
          id: 't1', studentId: 'student-1', fromInstitutionId: 'school-2', toInstitutionId: 'school-1',
          status: 'PENDING', reason: 'Relocation', requestedDate: null, reviewedAt: null,
        },
      ],
      total: 1,
    }),
    saveSchoolAdminRecord: vi.fn(),
  },
}));
vi.mock('@/services/nemis-bridge/school-admin/student-bridge', () => ({ studentBridge: {} }));

import { SchoolAdminCollectionPage } from './SchoolAdminModulePages';
import { sharedBridge } from '@/services/nemis-bridge/shared';

describe('SchoolAdminCollectionPage — transfers', () => {
  it('shows a pending transfer with no Approve action, and the web-portal notice', async () => {
    render(
      <SchoolAdminCollectionPage
        title="Inter-school transfers"
        description="Incoming and outgoing student transfer requests involving this institution."
        notice="Review transfers on the web portal."
        sections={[{ collection: 'student_transfers', label: 'Transfers', columns: ['studentId', 'status'] }]}
      />,
    );
    expect(await screen.findByText('PENDING')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByText('Review transfers on the web portal.')).toBeInTheDocument();
    expect(sharedBridge.saveSchoolAdminRecord).not.toHaveBeenCalled();
  });
});
