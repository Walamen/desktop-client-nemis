import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/presentation/hooks/shared', () => ({ useNotificationStore: () => notifications }));

import { describeSaveError, formatSaveFailure, useSaveFeedback } from './save-feedback';

afterEach(() => vi.clearAllMocks());

describe('describeSaveError', () => {
  it('uses the IPC message without its code', () => {
    expect(describeSaveError(new Error('[VALIDATION_FAILED] Dates overlap'))).toBe('Dates overlap');
  });
  it('uses a plain error message', () => {
    expect(describeSaveError(new Error('Disk full'))).toBe('Disk full');
  });
  it('hides an unrecognised bracketed message', () => {
    expect(describeSaveError(new Error('[WEIRD] boom'))).toBe('');
  });
  it('has nothing to say about a non-Error', () => {
    expect(describeSaveError('nope')).toBe('');
    expect(describeSaveError(undefined)).toBe('');
  });
});

describe('formatSaveFailure', () => {
  it('appends the readable detail', () => {
    expect(formatSaveFailure("Couldn't open the window.", new Error('[CONFLICT] Window dates overlap'))).toBe(
      "Couldn't open the window. Window dates overlap",
    );
  });
  it('is just the failure sentence when there is no detail', () => {
    expect(formatSaveFailure("Couldn't open the window.", new Error('[WEIRD] x'))).toBe("Couldn't open the window.");
  });
});

describe('useSaveFeedback', () => {
  const messages = { success: 'Window opened.', failure: "Couldn't open the window." };

  it('toasts success and returns the value', async () => {
    const { result } = renderHook(() => useSaveFeedback());
    await expect(result.current(async () => 42, messages)).resolves.toEqual({ ok: true, value: 42 });
    expect(notifications.success).toHaveBeenCalledWith('Window opened.');
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('toasts the failure with the readable detail and does not throw', async () => {
    const { result } = renderHook(() => useSaveFeedback());
    const outcome = await result.current(async () => {
      throw new Error('[VALIDATION_FAILED] Window dates overlap');
    }, messages);
    expect(outcome).toEqual({ ok: false });
    expect(notifications.error).toHaveBeenCalledWith("Couldn't open the window. Window dates overlap");
    expect(notifications.success).not.toHaveBeenCalled();
  });

  it('toasts only the failure sentence when there is no readable detail', async () => {
    const { result } = renderHook(() => useSaveFeedback());
    await result.current(() => Promise.reject('nope'), messages);
    expect(notifications.error).toHaveBeenCalledWith("Couldn't open the window.");
  });
});
