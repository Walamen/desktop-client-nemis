import { powerMonitor } from 'electron';
import type { ConnectivitySource } from './DesktopSyncWorker';

const PROBE_INTERVAL_MS = 10_000;
const PROBE_TIMEOUT_MS = 5_000;
const CONSECUTIVE_FLIPS_REQUIRED = 2;

/**
 * Reachability probe against the backend, debounced across two consecutive
 * consistent results so a single flaky probe doesn't flap the indicator.
 * Electron's main process has no `navigator.onLine` — powerMonitor's
 * resume/unlock-screen events only trigger an immediate re-probe, they never
 * set state directly (an adapter coming back up doesn't guarantee internet
 * is actually reachable yet).
 */
export class NetworkMonitor implements ConnectivitySource {
  #online = true;
  #consecutive = 0;
  #lastResult: boolean | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #probeUrl: string;
  #onResume = () => void this.#probe();

  constructor(
    apiBaseUrl: string,
    private readonly onOnline: () => void,
  ) {
    this.#probeUrl = new URL('/auth/me', apiBaseUrl).toString();
  }

  isOnline(): boolean {
    return this.#online;
  }

  start(): void {
    this.#timer = setInterval(() => void this.#probe(), PROBE_INTERVAL_MS);
    powerMonitor.on('resume', this.#onResume);
    powerMonitor.on('unlock-screen', this.#onResume);
    void this.#probe();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    powerMonitor.removeListener('resume', this.#onResume);
    powerMonitor.removeListener('unlock-screen', this.#onResume);
  }

  async #probe(): Promise<void> {
    const reachable = await this.#isReachable();
    if (reachable === this.#lastResult) {
      this.#consecutive += 1;
    } else {
      this.#lastResult = reachable;
      this.#consecutive = 1;
    }
    if (this.#consecutive < CONSECUTIVE_FLIPS_REQUIRED || reachable === this.#online) return;
    this.#online = reachable;
    if (reachable) this.onOnline();
  }

  async #isReachable(): Promise<boolean> {
    try {
      // Any HTTP response (even 401/403) proves the network path is up —
      // only a thrown network-level error (timeout/DNS/refused) means offline.
      await fetch(this.#probeUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      return true;
    } catch {
      return false;
    }
  }
}
