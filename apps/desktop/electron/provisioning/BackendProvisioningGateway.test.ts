import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  it('downloadSnapshot includes since as a query param when provided', async () => {
    const data = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, []]));
    const manifest = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, 0]));
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(async () => response({
      contractVersion: 1, snapshotId: 'snapshot-1', generatedAt: '2026-01-01',
      userId: 'user-1', role: 'INSTITUTION_ADMIN', scopeType: 'INSTITUTION',
      scopeId: 'school-1', institutionId: 'school-1', deviceId: 'device-1',
      checksumAlgorithm: 'sha256',
      checksum: 'a'.repeat(64), manifest, data,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const gateway = buildGateway();

    await gateway.downloadSnapshot('device-1', '2026-07-29T00:00:00.000Z');

    const requestedUrl = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(requestedUrl.searchParams.get('deviceId')).toBe('device-1');
    expect(requestedUrl.searchParams.get('since')).toBe('2026-07-29T00:00:00.000Z');
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

  it('createAssignment posts plain JSON when there is no local attachment', async () => {
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => response({ id: 'remote-a1' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await buildGateway().createAssignment({ title: 'Ch5', classId: 'c-1' });
    expect(result.id).toBe('remote-a1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://nemis.example/teacher/assignments');
    expect(init?.method).toBe('POST');
    expect(typeof init?.body).toBe('string');
    expect(JSON.parse(init!.body as string)).toEqual({ title: 'Ch5', classId: 'c-1' });
    expect((init?.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('updateAssignment sends multipart/form-data (no explicit content-type) when a local attachment is present', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nemis-attachment-'));
    const filePath = path.join(dir, 'notes.pdf');
    fs.writeFileSync(filePath, 'pdf-bytes');
    try {
      const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
        async () => response({ id: 'remote-a1', attachmentUrl: 'https://cdn/notes.pdf', attachmentName: 'notes.pdf' }),
      );
      vi.stubGlobal('fetch', fetchMock);
      const result = await buildGateway().updateAssignment('remote-a1', { title: 'Ch5' }, filePath);
      expect(result.attachmentUrl).toBe('https://cdn/notes.pdf');
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toBe('https://nemis.example/teacher/assignments/remote-a1');
      expect(init?.method).toBe('PATCH');
      expect(init?.body).toBeInstanceOf(FormData);
      expect((init?.headers as Record<string, string>)['content-type']).toBeUndefined();
      const form = init!.body as FormData;
      expect(form.get('title')).toBe('Ch5');
      expect((form.get('file') as File).name).toBe('notes.pdf');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gradeSubmission posts to the nested submissions/grade endpoint', async () => {
    const fetchMock = vi.fn<(url: string | URL, init?: RequestInit) => Promise<Response>>(
      async () => response({ id: 'sub-1' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await buildGateway().gradeSubmission('remote-a1', 'stu-1', { grade: 85, feedback: 'Great' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('https://nemis.example/teacher/assignments/remote-a1/submissions/stu-1/grade');
    expect(JSON.parse(init!.body as string)).toEqual({ grade: 85, feedback: 'Great' });
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
