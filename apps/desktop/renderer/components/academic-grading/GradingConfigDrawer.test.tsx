import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

vi.mock('@/services/nemis-bridge/shared', () => ({
  sharedBridge: {
    listSchoolAdminRecords: vi.fn(async () => ({ items: [], total: 0 })),
    saveSchoolAdminRecord: vi.fn(async () => ({})),
    deleteSchoolAdminRecord: vi.fn(),
  },
}));

import { sharedBridge } from '@/services/nemis-bridge/shared';
import { ToastHost } from '@/components/shell/ToastHost';
import { GradingConfigDrawer } from './GradingConfigDrawer';
import { clearNemis, renderWithLayer, stubNemis } from './setup-test-support';

async function renderConfig(onClose = vi.fn()) {
  stubNemis();
  await renderWithLayer(
    <>
      <GradingConfigDrawer isOpen onClose={onClose} />
      <ToastHost />
    </>,
  );
  await screen.findByRole('button', { name: 'Save Configuration' });
  return onClose;
}

afterEach(() => {
  clearNemis();
  vi.clearAllMocks();
});

describe('GradingConfigDrawer save feedback', () => {
  it('shows the readable reason inline when the save fails, and stays open', async () => {
    const onClose = await renderConfig();
    vi.mocked(sharedBridge.saveSchoolAdminRecord).mockRejectedValueOnce(
      new Error('[VALIDATION_FAILED] The provided data failed validation.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }));
    expect(await screen.findByText('The provided data failed validation.')).toBeInTheDocument();
    expect(screen.queryByText(/\[VALIDATION_FAILED\]/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('falls back to the generic message when there is no readable reason', async () => {
    await renderConfig();
    vi.mocked(sharedBridge.saveSchoolAdminRecord).mockRejectedValueOnce(new Error('[WEIRD] x'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }));
    expect(await screen.findByText('Unable to save configuration.')).toBeInTheDocument();
  });

  it('toasts and closes on success', async () => {
    const onClose = await renderConfig();
    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }));
    expect(await screen.findByText('Grading configuration saved.')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
