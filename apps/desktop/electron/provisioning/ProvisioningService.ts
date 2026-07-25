import type { AuthenticateUser, Logout, RestoreSession } from '@nemis-desktop/application';
import type { DeviceIdentity, ProvisioningStatus } from '@nemis-desktop/types';
import type { BackendProvisioningGateway } from './BackendProvisioningGateway';
import type { ProvisioningImporter } from './ProvisioningImporter';

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
  ) {
    this.status = anonymousStatus(device);
  }

  async getStatus(): Promise<ProvisioningStatus> {
    if (!this.restored) {
      this.restored = true;
      const session = await this.restoreSession.execute();
      if (session) {
        const storedCompletion = this.importer.getCompletion();
        const completion =
          storedCompletion?.institutionId === session.user.institutionId
            ? storedCompletion
            : null;
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
    this.restored = true;
    const storedCompletion = this.importer.getCompletion();
    const completion =
      storedCompletion?.institutionId === session.user.institutionId
        ? storedCompletion
        : null;
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
    await this.logoutUser.execute();
    this.restored = true;
    this.status = anonymousStatus(this.status.device);
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

      this.advance('downloading', 35, 'Downloading the verified school snapshot…');
      const snapshot = await this.gateway.downloadSnapshot(registered.id);

      this.advance('initializing', 65, 'Initializing the encrypted offline database…');
      this.importer.import(snapshot, {
        institutionId: user.institutionId,
        userId: user.id,
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
      this.status = {
        ...this.status,
        stage: this.status.stage,
        message: friendlyFailure(error),
      };
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
