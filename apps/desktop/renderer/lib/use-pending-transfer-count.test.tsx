import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PresentationProvider } from '@/lib/presentation/presentation-provider';
import { createRendererPresentation } from '@/lib/presentation/create-renderer-presentation';
import { notifyTransfersChanged } from '@/lib/transfers';
import { usePendingTransferCount } from './use-pending-transfer-count';

const US = 'inst-1';
const school = {
  id: US, code: 'S1', name: 'Test School', type: 'PUBLIC', ownership: 'GOVERNMENT',
  approvalStatus: 'APPROVED', isApproved: true,
};

type Row = Record<string, unknown>;
const row = (over: Row): Row => ({
  studentId: 's', fromInstitutionId: 'inst-2', toInstitutionId: US, status: 'PENDING',
  initiatedBy: 'ORIGIN_SCHOOL', lapsesAt: null, ...over,
});
/** Two pushes to us (decisions), one of our own pushes (not ours to decide). */
const ROWS = [
  row({ id: 'a' }),
  row({ id: 'b' }),
  row({ id: 'c', fromInstitutionId: US, toInstitutionId: 'inst-3' }),
  row({ id: 'd', status: 'APPROVED' }),
];

function stubNemis(list: () => Promise<unknown>) {
  const fn = vi.fn(list);
  (window as unknown as { nemis: unknown }).nemis = {
    school: { getSummary: vi.fn(async () => school) },
    schoolAdmin: { list: fn },
  };
  return fn;
}

afterEach(() => {
  delete (window as unknown as { nemis?: unknown }).nemis;
});

function Probe({ enabled }: { enabled: boolean }) {
  const count = usePendingTransferCount(enabled);
  return <span data-testid="count">{count}</span>;
}

async function renderProbe(enabled: boolean): Promise<ReturnType<typeof render>> {
  const layer = createRendererPresentation();
  await layer.bootstrap.run();
  const wrap = (children: ReactNode) => <PresentationProvider layer={layer}>{children}</PresentationProvider>;
  return render(wrap(<Probe enabled={enabled} />));
}

describe('usePendingTransferCount', () => {
  it('counts pending decisions from local rows', async () => {
    const list = stubNemis(async () => ({ items: ROWS, total: ROWS.length }));
    await renderProbe(true);
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(list).toHaveBeenCalledWith({ collection: 'student_transfers', limit: 250 });
  });

  it('makes no read when disabled', async () => {
    const list = stubNemis(async () => ({ items: ROWS, total: ROWS.length }));
    await renderProbe(false);
    await act(async () => {
      notifyTransfersChanged();
      await Promise.resolve();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(list).not.toHaveBeenCalled();
  });

  it('re-reads when transfers change', async () => {
    let rows: Row[] = [];
    const list = stubNemis(async () => ({ items: rows, total: rows.length }));
    await renderProbe(true);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    rows = ROWS;
    act(() => notifyTransfersChanged());
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('shows zero and does not throw when the local read fails', async () => {
    const list = stubNemis(async () => {
      throw new Error('db locked');
    });
    await renderProbe(true);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('stops listening after unmount', async () => {
    const list = stubNemis(async () => ({ items: ROWS, total: ROWS.length }));
    const view = await renderProbe(true);
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    view.unmount();
    notifyTransfersChanged();
    expect(list).toHaveBeenCalledTimes(1);
  });
});
