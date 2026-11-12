import type {
  AuthenticatedSession,
  AuthenticateUser,
  Logout,
  RestoreSession,
} from '@nemis-desktop/application';
import type {
  DeviceIdentity,
  ProvisioningStatus,
  ProvisioningUser,
  RealtimeEvent,
} from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from './BackendProvisioningGateway';
import type { ProvisioningImporter } from './ProvisioningImporter';
import { sameProvisioningUser, sameWorkspaceIdentity } from './sameProvisioningUser';

const REVOKE_MESSAGES = {
  disabled: 'This account is no longer active. Sign in again or contact your School Admin.',
  changed: 'Your role or school assignment changed. Sign in again to open the right workspace.',
} as const;

export class ProvisioningService {
  private restored = false;
  private status: ProvisioningStatus;

  constructor(
    private readonly authenticateUser: AuthenticateUser,
    private readonly restoreSession: RestoreSession,
    private readonly logoutUser: Logout,
    private readonly gateway: BackendProvisioningGateway,
    private readonly importer: ProvisioningImporter,
    device: DeviceIdentity,
    private readonly workspaces?: {
      activate(user: ProvisioningUser): unknown;
      close(): void;
    },
    private readonly emit?: (event: RealtimeEvent) => void,
  ) {
    this.status = anonymousStatus(device);
  }

  /** Applies a user freshly restored from `/auth/me`; revokes if the workspace identity changed. */
  applyRestoredSession(session: AuthenticatedSession): void {
    const current = this.status.user;
    if (this.status.authentication !== 'authenticated' || !current) return;
    if (!sameWorkspaceIdentity(current, session.user)) {
      this.revokeSession('changed');
      return;
    }
    if (sameProvisioningUser(current, session.user)) return;
    this.workspaces?.activate(session.user);
    this.status = { ...this.status, user: session.user };
    this.emit?.({ type: 'session', reason: 'refreshed' });
  }

  /** Ends the signed-in session because the server disabled the account or changed its identity. */
  revokeSession(reason: keyof typeof REVOKE_MESSAGES): void {
    if (this.status.authentication !== 'authenticated') return;
    this.workspaces?.close();
    this.restored = true;
    this.status = {
      ...anonymousStatus(this.status.device),
      authentication: 'expired',
      message: REVOKE_MESSAGES[reason],
    };
    this.emit?.({ type: 'session', reason: 'revoked' });
  }

  async getStatus(): Promise<ProvisioningStatus> {
    if (!this.restored) {
      this.restored = true;
      const session = await this.restoreSession.execute();
      if (session) {
        this.workspaces?.activate(session.user);
        const completion = this.resolveCompletion(session.user);
        this.status = completion
          ? {
              ...this.status,
              authentication: 'authenticated',
              stage: 'ready',
              user: session.user,
              isProvisioned: true,
              completedAt: completion.completedAt,
              progress: 100,
              message: 'Offline database ready.',
            }
          : {
              ...this.status,
              authentication: 'authenticated',
              stage: 'registration',
              user: session.user,
              progress: 10,
            };
      }
    }
    return this.status;
  }

  async login(email: string, password: string): Promise<ProvisioningStatus> {
    const session = await this.authenticateUser.execute(email, password);
    this.workspaces?.activate(session.user);
    this.restored = true;
    const completion = this.resolveCompletion(session.user);
    this.status = {
      ...this.status,
      authentication: 'authenticated',
      stage: completion ? 'ready' : 'registration',
      user: session.user,
      isProvisioned: Boolean(completion),
      completedAt: completion?.completedAt ?? null,
      progress: completion ? 100 : 10,
      message: completion ? 'Offline database ready.' : undefined,
    };
    return this.status;
  }

  async logout(): Promise<ProvisioningStatus> {
    try {
      await this.logoutUser.execute();
    } finally {
      this.workspaces?.close();
      this.restored = true;
      this.status = anonymousStatus(this.status.device);
    }
    return this.status;
  }

  async start(): Promise<ProvisioningStatus> {
    const user = this.status.user;
    if (this.status.authentication !== 'authenticated' || !user) {
      this.status = { ...this.status, authentication: 'expired', stage: 'authentication' };
      return this.status;
    }
    if (this.status.isProvisioned) return this.status;
    try {
      this.advance('registration', 15, 'Registering this device…');
      const registered = await this.gateway.registerDevice(this.status.device);
      const verified = await this.gateway.verifyDevice(registered.id);
      if (verified.status !== 'ACTIVE') throw new Error(`Device is ${verified.status.toLowerCase()}.`);

      this.advance('downloading', 35, 'Downloading your authorized NEMIS workspace…');
      const snapshot = await this.gateway.downloadSnapshot(registered.id);

      this.advance('initializing', 65, 'Initializing the encrypted offline database…');
      this.importer.import(snapshot, {
        userId: user.id,
        role: user.role,
        scopeType: user.scope.type,
        scopeId: user.scope.scopeId,
        institutionId: user.institutionId,
        serverDeviceId: registered.id,
      });

      this.advance('verifying', 85, 'Verifying relationships and database integrity…');
      const completion = this.importer.getCompletion();
      if (!completion) throw new Error('Provisioning completion metadata is missing.');

      this.advance('finalizing', 95, 'Finalizing offline access…');
      this.status = {
        ...this.status,
        stage: 'ready',
        progress: 100,
        isProvisioned: true,
        completedAt: completion.completedAt,
        message: 'This device is ready to work offline.',
      };
      return this.status;
    } catch (error) {
      this.status = { ...this.status, message: friendlyFailure(error) };
      throw error;
    }
  }

  private advance(
    stage: ProvisioningStatus['stage'],
    progress: number,
    message: string,
  ): void {
    this.status = { ...this.status, stage, progress, message };
  }

  /** Only reuse a stored completion if it was provisioned by this exact user/role/scope. */
  private resolveCompletion(
    user: ProvisioningUser,
  ): ReturnType<ProvisioningImporter['getCompletion']> {
    const stored = this.importer.getCompletion();
    const matches =
      stored?.userId === user.id &&
      stored.role === user.role &&
      stored.scopeType === user.scope.type &&
      stored.scopeId === user.scope.scopeId;
    return matches ? stored : null;
  }
}

function anonymousStatus(device: DeviceIdentity): ProvisioningStatus {
  return {
    authentication: 'anonymous',
    stage: 'welcome',
    user: null,
    device,
    isProvisioned: false,
    completedAt: null,
    progress: 0,
  };
}

function friendlyFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/network|reached|fetch/i.test(message)) return 'The connection was interrupted. Reconnect and retry; no partial data was retained.';
  if (/checksum|integrity|dependency|manifest/i.test(message)) return 'Downloaded data failed verification. No partial data was retained.';
  if (/revoked|forbidden|authorized/i.test(message)) return 'This device is not authorized to provision this school.';
  return 'Provisioning could not be completed. No partial data was retained; you can safely retry.';
}
