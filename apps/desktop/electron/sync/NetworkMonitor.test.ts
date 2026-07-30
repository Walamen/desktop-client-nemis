import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkMonitor } from './NetworkMonitor';

vi.mock('electron', () => ({
  powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
}));

describe('NetworkMonitor', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts online by default and stays online while probes succeed', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const onOnline = vi.fn();
    const monitor = new NetworkMonitor('https://api.example.test', onOnline);
    monitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(monitor.isOnline()).toBe(true);
    expect(onOnline).not.toHaveBeenCalled();
    monitor.stop();
  });

  it('treats a 401/403 response as reachable (network is up, auth is a separate concern)', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const monitor = new NetworkMonitor('https://api.example.test', vi.fn());
    monitor.start();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(monitor.isOnline()).toBe(true);
    monitor.stop();
  });

  it('flips offline after two consecutive failed probes, and back online after two consecutive successes, firing onOnline exactly on the up-flip', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const onOnline = vi.fn();
    const monitor = new NetworkMonitor('https://api.example.test', onOnline);
    monitor.start();

    // start() fires an immediate probe (probe 1) in addition to the interval;
    // flush it without advancing the clock so the interval-driven probes below
    // land on clean 10s boundaries.
    await vi.advanceTimersByTimeAsync(0); // probe 1: fail (not enough yet)
    expect(monitor.isOnline()).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000); // probe 2: fail -> flips offline
    expect(monitor.isOnline()).toBe(false);

    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await vi.advanceTimersByTimeAsync(10_000); // probe 3: success (not enough yet)
    expect(monitor.isOnline()).toBe(false);
    expect(onOnline).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000); // probe 4: success -> flips online
    expect(monitor.isOnline()).toBe(true);
    expect(onOnline).toHaveBeenCalledTimes(1);

    monitor.stop();
  });

  it('stop() clears the probe interval so no further fetches occur', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const monitor = new NetworkMonitor('https://api.example.test', vi.fn());
    monitor.start();
    monitor.stop();
    fetchMock.mockClear();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
