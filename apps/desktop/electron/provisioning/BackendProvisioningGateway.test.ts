import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthenticatedSession,
  AuthenticationGateway,
  SessionRepository,
} from '@nemis-desktop/application';
import { AuthenticationUnavailableError } from '@nemis-desktop/application';
import { PROVISIONING_COLLECTIONS } from '@nemis-desktop/types';
import { BackendProvisioningGateway } from './BackendProvisioningGateway';

const session: AuthenticatedSession = {
  user: {
    id: 'user-1', email: 'admin@school.edu', firstName: 'School', lastName: 'Admin',
    role: 'INSTITUTION_ADMIN',
    scope: { type: 'INSTITUTION', scopeId: 'school-1', institutionId: 'school-1' },
    institutionId: 'school-1',
  },
  sessionSecret: JSON.stringify({ cookies: 'sid=session; access_token=access' }),
};

afterEach(() => vi.unstubAllGlobals());

describe('BackendProvisioningGateway', () => {
  it('registers through the protected backend contract without exposing cookies', async () => {
    const fetchMock = vi.fn(async () => response({
      id: 'device-1', installationId: '11111111-1111-4111-8111-111111111111',
      fingerprint: 'a'.repeat(64), userId: 'user-1', role: 'INSTITUTION_ADMIN',
      scopeType: 'INSTITUTION', scopeId: 'school-1', institutionId: 'school-1', status: 'ACTIVE',
      registeredAt: '2026-01-01', lastSeenAt: '2026-01-01',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const gateway = buildGateway();
    const result = await gateway.registerDevice({
      id: '11111111-1111-4111-8111-111111111111', fingerprint: 'a'.repeat(64),
      name: 'PC', platform: 'win32', osVersion: '11', appVersion: '1.0.0',
    });
    expect(result.id).toBe('device-1');
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://nemis.example/desktop/devices'),
      expect.objectContaining({
        headers: expect.objectContaining({ cookie: 'sid=session; access_token=access' }),
      }),
    );
  });

  it('rejects a snapshot whose manifest does not match its collections', async () => {
    const data = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, []]));
    const manifest = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, 0]));
    manifest.students = 1;
    vi.stubGlobal('fetch', vi.fn(async () => response({
      contractVersion: 1, snapshotId: 'snapshot-1', generatedAt: '2026-01-01',
      userId: 'user-1', role: 'INSTITUTION_ADMIN', scopeType: 'INSTITUTION',
      scopeId: 'school-1', institutionId: 'school-1', deviceId: 'device-1',
      checksumAlgorithm: 'sha256',
      checksum: 'a'.repeat(64), manifest, data,
    })));
    await expect(buildGateway().downloadSnapshot('device-1')).rejects.toThrow(/manifest/i);
  });

  it('preserves the protected session when revalidation is temporarily offline', async () => {
    const clear = vi.fn(async () => undefined);
    const authentication: AuthenticationGateway = {
      authenticate: async () => session,
      restore: async () => {
        throw new AuthenticationUnavailableError('offline');
      },
      logout: async () => undefined,
    };
    const sessions: SessionRepository = {
      load: async () => session,
      save: async () => undefined,
      clear,
    };
    const gateway = new BackendProvisioningGateway(
      'https://nemis.example',
      authentication,
      sessions,
    );

    await expect(gateway.verifyDevice('device-1')).rejects.toThrow(/offline/i);
    expect(clear).not.toHaveBeenCalled();
  });
});

function buildGateway(): BackendProvisioningGateway {
  const authentication: AuthenticationGateway = {
    authenticate: async () => session,
    restore: async () => session,
    logout: async () => undefined,
  };
  const sessions: SessionRepository = {
    load: async () => session,
    save: async () => undefined,
    clear: async () => undefined,
  };
  return new BackendProvisioningGateway('https://nemis.example', authentication, sessions);
}

function response(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
