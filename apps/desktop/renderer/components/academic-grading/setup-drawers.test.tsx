import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook } from '@testing-library/react';
import { useOpenSession } from './setup-drawers';
import { useEscapeCapture } from './use-escape-capture';

describe('useOpenSession', () => {
  it('starts a new session each time the drawer goes from closed to open', () => {
    const { result, rerender } = renderHook(({ open }) => useOpenSession(open), { initialProps: { open: false } });
    const first = result.current;
    rerender({ open: true });
    const opened = result.current;
    expect(opened).not.toBe(first);
    rerender({ open: true });
    expect(result.current).toBe(opened);
    rerender({ open: false });
    expect(result.current).toBe(opened);
    rerender({ open: true });
    expect(result.current).not.toBe(opened);
  });
});

function Harness({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEscapeCapture(active, onEscape);
  return <input aria-label="field" />;
}

describe('useEscapeCapture', () => {
  it('handles Escape before a bubble-phase document listener sees it', () => {
    const drawerClose = vi.fn();
    document.addEventListener('keydown', drawerClose);
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Harness active onEscape={onEscape} />);
    fireEvent.keyDown(getByLabelText('field'), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(drawerClose).not.toHaveBeenCalled();
    document.removeEventListener('keydown', drawerClose);
  });

  it('ignores other keys', () => {
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Harness active onEscape={onEscape} />);
    fireEvent.keyDown(getByLabelText('field'), { key: 'Enter' });
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('does nothing while inactive, so the drawer still closes', () => {
    const drawerClose = vi.fn();
    document.addEventListener('keydown', drawerClose);
    const onEscape = vi.fn();
    const { getByLabelText } = render(<Harness active={false} onEscape={onEscape} />);
    fireEvent.keyDown(getByLabelText('field'), { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
    expect(drawerClose).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', drawerClose);
  });

  it('stops listening after unmount', () => {
    const onEscape = vi.fn();
    const { unmount } = render(<Harness active onEscape={onEscape} />);
    unmount();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onEscape).not.toHaveBeenCalled();
  });
});
