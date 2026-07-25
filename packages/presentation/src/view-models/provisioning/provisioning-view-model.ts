import { createStore } from 'zustand/vanilla';
import type {
  AuthenticateRequest,
  AuthenticationStatus,
  ProvisioningProgress,
  ProvisioningStatus,
} from '@nemis-desktop/types';

export interface ProvisioningClient {
  getStatus(): Promise<ProvisioningStatus>;
  login(request: AuthenticateRequest): Promise<ProvisioningStatus>;
  logout(): Promise<ProvisioningStatus>;
  start(): Promise<ProvisioningStatus>;
}

export interface AuthenticationState {
  readonly status: AuthenticationStatus;
  readonly submitting: boolean;
  readonly error: string | null;
}

export interface ProvisioningState {
  readonly status: ProvisioningStatus | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export class LoginViewModel {
  readonly store = createStore<AuthenticationState>(() => ({
    status: 'anonymous',
    submitting: false,
    error: null,
  }));

  constructor(private readonly client: ProvisioningClient) {}

  async authenticate(request: AuthenticateRequest): Promise<ProvisioningStatus | null> {
    this.store.setState({ submitting: true, error: null });
    try {
      const status = await this.client.login(request);
      this.store.setState({ status: status.authentication, submitting: false });
      return status;
    } catch (error) {
      this.store.setState({
        status: 'anonymous',
        submitting: false,
        error: friendlyAuthenticationError(error),
      });
      return null;
    }
  }
}

export class ProvisioningViewModel {
  readonly store = createStore<ProvisioningState>(() => ({
    status: null,
    loading: false,
    error: null,
  }));

  constructor(private readonly client: ProvisioningClient) {}

  async restore(): Promise<void> {
    await this.run(() => this.client.getStatus());
  }

  async start(): Promise<void> {
    await this.run(() => this.client.start());
  }

  async logout(): Promise<void> {
    await this.run(() => this.client.logout());
  }

  accept(status: ProvisioningStatus): void {
    this.store.setState({ status, loading: false, error: null });
  }

  private async run(operation: () => Promise<ProvisioningStatus>): Promise<void> {
    this.store.setState({ loading: true, error: null });
    try {
      this.store.setState({ status: await operation(), loading: false });
    } catch {
      this.store.setState({
        loading: false,
        error: 'The operation could not be completed. No local data was changed.',
      });
    }
  }
}

export class DownloadProgressViewModel {
  readonly store = createStore<ProvisioningProgress>(() => ({
    stage: 'welcome',
    percent: 0,
    message: 'Waiting to begin',
  }));

  report(progress: ProvisioningProgress): void {
    this.store.setState({
      ...progress,
      percent: Math.max(0, Math.min(100, progress.percent)),
    });
  }
}

function friendlyAuthenticationError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('UNAUTHORIZED')) return 'The email or password is incorrect.';
  if (message.includes('FORBIDDEN')) return 'This account cannot provision a school device.';
  return 'NEMIS could not sign you in. Check your connection and try again.';
}
