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
import { ForbiddenError, OfflineError, RateLimitedError, RemoteRejectedError } from '@nemis-desktop/shared';
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

  it('tolerates a snapshot missing a collection entirely, treating it as empty rather than failing the whole sync', async () => {
    // Simulates a desktop build shipping ahead of a backend deploy: the
    // backend's response simply doesn't know about a newly-added collection
    // (here, 'districts') yet, so the key is absent from both `data` and
    // `manifest` — not present-but-empty. This must not hard-fail sync for
    // every role, only for County/DEO/Ministry roles that actually need it.
    const collections = PROVISIONING_COLLECTIONS.filter((key) => key !== 'districts');
    const data = Object.fromEntries(collections.map((key) => [key, []]));
    const manifest = Object.fromEntries(collections.map((key) => [key, 0]));
    vi.stubGlobal('fetch', vi.fn(async () => response({
      contractVersion: 1, snapshotId: 'snapshot-1', generatedAt: '2026-01-01',
      userId: 'user-1', role: 'INSTITUTION_ADMIN', scopeType: 'INSTITUTION',
      scopeId: 'school-1', institutionId: 'school-1', deviceId: 'device-1',
      checksumAlgorithm: 'sha256',
      checksum: 'a'.repeat(64), manifest, data,
    })));
    const snapshot = await buildGateway().downloadSnapshot('device-1');
    expect(snapshot.data.districts).toEqual([]);
    expect(snapshot.manifest.districts).toBe(0);
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

  describe('departed-cohort opt-in', () => {
    const errorResponse = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const emptySnapshot = () => {
      const data = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, []]));
      const manifest = Object.fromEntries(PROVISIONING_COLLECTIONS.map((key) => [key, 0]));
      return {
        contractVersion: 1, snapshotId: 'snapshot-1', generatedAt: '2026-01-01',
        userId: 'user-1', role: 'INSTITUTION_ADMIN', scopeType: 'INSTITUTION',
        scopeId: 'school-1', institutionId: 'school-1', deviceId: 'device-1',
        checksumAlgorithm: 'sha256', checksum: 'a'.repeat(64), manifest, data,
      };
    };
    const includeOf = (fetchMock: { mock: { calls: unknown[][] } }, call: number) =>
      new URL(String(fetchMock.mock.calls[call]![0])).searchParams.get('include');

    it('sends include=departedCohort', async () => {
      const fetchMock = vi.fn(async () => response(emptySnapshot()));
      vi.stubGlobal('fetch', fetchMock);
      await buildGateway().downloadSnapshot('device-1', '2026-07-29T00:00:00.000Z');
      expect(includeOf(fetchMock, 0)).toBe('departedCohort');
    });

    it('on a 400 retries once without the flag and stops sending it', async () => {
      const fetchMock = vi.fn(async (url: string | URL) =>
        new URL(String(url)).searchParams.has('include')
          ? errorResponse(400, { message: 'property include should not exist' })
          : response(emptySnapshot()));
      vi.stubGlobal('fetch', fetchMock);
      const gateway = buildGateway();
      await expect(gateway.downloadSnapshot('device-1')).resolves.toMatchObject({ snapshotId: 'snapshot-1' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(includeOf(fetchMock, 0)).toBe('departedCohort');
      expect(includeOf(fetchMock, 1)).toBeNull();
      await gateway.downloadSnapshot('device-1');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(includeOf(fetchMock, 2)).toBeNull();
    });

    it('does not retry other errors, and keeps sending the flag after them', async () => {
      const fetchMock = vi.fn(async () => errorResponse(500, { message: 'boom' }));
      vi.stubGlobal('fetch', fetchMock);
      const gateway = buildGateway();
      await expect(gateway.downloadSnapshot('device-1')).rejects.toThrow(/status 500/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock.mockImplementationOnce(async () => errorResponse(409, { message: 'conflict' }));
      await expect(gateway.downloadSnapshot('device-1')).rejects.toBeInstanceOf(RemoteRejectedError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(includeOf(fetchMock, 1)).toBe('departedCohort');
    });

    it('a 400 on the retry without the flag is surfaced, not retried again', async () => {
      const fetchMock = vi.fn(async () => errorResponse(400, { message: 'bad' }));
      vi.stubGlobal('fetch', fetchMock);
      await expect(buildGateway().downloadSnapshot('device-1')).rejects.toBeInstanceOf(RemoteRejectedError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
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

  it('attaches the numeric HTTP status to a non-2xx error without changing its message', async () => {
    // Locks in the correction that lets FeeReversalSyncService branch on 409
    // ("already reversed") vs 404 ("payment unknown to the server"): without
    // this, authorized() would throw a plain Error with no status property,
    // and those branches would silently become dead code in production while
    // every service test (which fabricates { status } on its mocks) kept
    // passing.
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(buildGateway().gradeSubmission('remote-a1', 'stu-1', { grade: 85 })).rejects.toMatchObject({
      status: 404,
      message: 'Provisioning request failed with status 404.',
    });
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

  describe('online commands', () => {
    function errorResponse(status: number, body: unknown): Response {
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }

    it('requestRelease returns the lapse date the server set', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ id: 't-9', status: 'PENDING', lapsesAt: '2026-10-16T09:00:00.000Z' })));
      expect(await buildGateway().requestRelease({
        nemisId: '482915736045', dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7' as never, reason: 'Moving',
      })).toEqual({ id: 't-9', lapsesAt: '2026-10-16T09:00:00.000Z' });
    });

    it('a network failure is an OfflineError with the text the sync worker matches', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
      const error = await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(OfflineError);
      expect((error as Error).message).toBe('The NEMIS server could not be reached.');
    });

    it('a 4xx keeps the transport message and status, and carries the server message separately', async () => {
      vi.stubGlobal('fetch', vi.fn(async () =>
        errorResponse(409, { success: false, errorCode: 'CONFLICT', message: 'This request was withdrawn while the transfer was being completed.' })));
      const error = await buildGateway().cancelTransfer('t-1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RemoteRejectedError);
      expect((error as RemoteRejectedError).status).toBe(409);
      expect((error as Error).message).toBe('Provisioning request failed with status 409.');
      expect((error as RemoteRejectedError).remoteMessage).toBe('This request was withdrawn while the transfer was being completed.');
    });

    it('array message: surfaces the first validation message', async () => {
      vi.stubGlobal('fetch', vi.fn(async () =>
        errorResponse(400, { message: ['classId should not be empty', 'termId should not be empty'] })));
      const error = await buildGateway()
        .requestRelease({ nemisId: '482915736045', dateOfBirth: '2012-01-01', classId: '', termId: '', gradeLevel: 'GRADE_7' as never, reason: 'x' })
        .catch((e: unknown) => e);
      expect((error as RemoteRejectedError).remoteMessage).toBe('classId should not be empty');
    });

    it('a 4xx with a non-JSON body still classifies, with no server message', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 404 })));
      const error = await buildGateway().cancelTransfer('t-1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RemoteRejectedError);
      expect((error as RemoteRejectedError).remoteMessage).toBeUndefined();
    });

    it('a 429 is a RateLimitedError', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => errorResponse(429, { message: 'Too many failed lookups. Try again in an hour.' })));
      const error = await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).remoteMessage).toBe('Too many failed lookups. Try again in an hour.');
    });

    it('a 403 on lookup carrying the lookup budget message is a RateLimitedError', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => errorResponse(403, { success: false, errorCode: 'FORBIDDEN', message: 'Too many lookups. Please try again later.' })));
      const error = await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RateLimitedError);
      expect((error as RateLimitedError).remoteMessage).toBe('Too many lookups. Please try again later.');
    });

    it('any other 403 on an online command is a RemoteRejectedError with the server message', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => errorResponse(403, { success: false, errorCode: 'FORBIDDEN', message: 'This student has not been released by their school.' })));
      const error = await buildGateway().claimStudent({
        nemisId: '482915736045', dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7' as never,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RemoteRejectedError);
      expect((error as RemoteRejectedError).status).toBe(403);
      expect((error as RemoteRejectedError).remoteMessage).toBe('This student has not been released by their school.');
    });

    it('a 403 on a non-online call stays ForbiddenError (provisioning relies on it)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => errorResponse(403, { message: 'nope' })));
      const error = await buildGateway().downloadSnapshot('device-1').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as Error).message).toBe('This device is not authorized.');
    });

    it('a lookup hit with gender OTHER and a GRADUATED completion is returned intact', async () => {
      const hit = {
        found: true, nemisId: '482915736045', firstName: 'Musu', lastName: 'Kollie', gender: 'OTHER',
        lastCompletion: { gradeLevel: 'GRADE_12', outcome: 'GRADUATED', nextGradeLevel: null, academicYearName: '2025/2026' },
        claimPath: 'REQUIRES_APPROVAL',
      };
      vi.stubGlobal('fetch', vi.fn(async () => response(hit)));
      expect(await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' })).toEqual(hit);
    });

    it('a 5xx stays a plain Error carrying status (unchanged behaviour)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => errorResponse(500, { message: 'boom' })));
      const error = await buildGateway().cancelTransfer('t-1').catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(RemoteRejectedError);
      expect((error as { status?: number }).status).toBe(500);
    });

    it('a lookup miss returns exactly { found: false }, dropping anything else', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ found: false, debug: 'should not leak' })));
      expect(await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' }))
        .toEqual({ found: false });
    });

    it('a lookup hit is built field by field and posts only nemisId + dateOfBirth', async () => {
      const fetchMock = vi.fn(async () => response({
        found: true, nemisId: '482915736045', firstName: 'Musu', lastName: 'Kollie', gender: 'FEMALE',
        lastCompletion: { gradeLevel: 'GRADE_6', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_7', academicYearName: '2025/2026' },
        claimPath: 'IMMEDIATE', institutionId: 'should-not-leak',
      }));
      vi.stubGlobal('fetch', fetchMock);
      const result = await buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' });
      expect(result).toEqual({
        found: true, nemisId: '482915736045', firstName: 'Musu', lastName: 'Kollie', gender: 'FEMALE',
        lastCompletion: { gradeLevel: 'GRADE_6', outcome: 'PROMOTED', nextGradeLevel: 'GRADE_7', academicYearName: '2025/2026' },
        claimPath: 'IMMEDIATE',
      });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url).toEqual(new URL('https://nemis.example/student-registry/lookup'));
      expect(init.method).toBe('POST');
      expect(JSON.parse(String(init.body))).toEqual({ nemisId: '482915736045', dateOfBirth: '2012-01-01' });
    });

    it('a malformed hit is rejected rather than half-trusted', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ found: true, nemisId: 7 })));
      await expect(buildGateway().lookupStudent({ nemisId: '482915736045', dateOfBirth: '2012-01-01' }))
        .rejects.toThrow('Malformed registry lookup response.');
    });

    it('claim returns the moved student id', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ id: 'student-9', institutionId: 'school-1', gradeLevel: 'GRADE_7' })));
      expect(await buildGateway().claimStudent({
        nemisId: '482915736045', dateOfBirth: '2012-01-01', classId: 'c', termId: 't', gradeLevel: 'GRADE_7' as never,
      })).toEqual({ studentId: 'student-9' });
    });

    it('review PATCHes the id path with a body that excludes id', async () => {
      const fetchMock = vi.fn(async () => response({ id: 't-1', status: 'APPROVED' }));
      vi.stubGlobal('fetch', fetchMock);
      expect(await buildGateway().reviewTransfer({ id: 't-1', status: 'APPROVED', classId: 'c', termId: 't' }))
        .toEqual({ id: 't-1' });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url).toEqual(new URL('https://nemis.example/student-transfers/t-1/review'));
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(String(init.body))).toEqual({ status: 'APPROVED', classId: 'c', termId: 't' });
    });

    it('cancel DELETEs and returns the id it was given', async () => {
      const fetchMock = vi.fn(async () => response({ message: 'cancelled' }));
      vi.stubGlobal('fetch', fetchMock);
      expect(await buildGateway().cancelTransfer('t 1')).toEqual({ id: 't 1' });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url).toEqual(new URL('https://nemis.example/student-transfers/t%201'));
      expect(init.method).toBe('DELETE');
    });

    it('searchSchools GETs the destination-schools endpoint and keeps only id/name/code', async () => {
      const fetchMock = vi.fn(async () => response([
        { id: 'i1', name: 'Central High', code: 'CH', countyId: 'should-not-leak' },
        { id: 7, name: 'bad row' },
      ]));
      vi.stubGlobal('fetch', fetchMock);
      expect(await buildGateway().searchSchools('cent')).toEqual([{ id: 'i1', name: 'Central High', code: 'CH' }]);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
      expect(url.pathname).toBe('/student-transfers/destination-schools');
      expect([...url.searchParams.keys()]).toEqual(['search']);
      expect(url.searchParams.get('search')).toBe('cent');
      expect(init.method ?? 'GET').toBe('GET');
    });

    it('searchSchools encodes the query as a single search param', async () => {
      const fetchMock = vi.fn(async () => response([]));
      vi.stubGlobal('fetch', fetchMock);
      await buildGateway().searchSchools('a&b=c');
      const [url] = fetchMock.mock.calls[0] as unknown as [URL];
      expect(url.searchParams.get('search')).toBe('a&b=c');
      expect([...url.searchParams.keys()]).toEqual(['search']);
    });

    it('searchSchools accepts a paginated { data: [...] } envelope too', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => response({ data: [{ id: 'i1', name: 'Central High', code: 'CH' }], meta: {} })));
      expect(await buildGateway().searchSchools('cent')).toEqual([{ id: 'i1', name: 'Central High', code: 'CH' }]);
    });

    // An unreadable body is a server fault, not "no schools match".
    it.each([{ message: 'unexpected' }, { data: 'nope' }, 'text', null])(
      'searchSchools refuses a malformed body (%j) instead of returning no matches',
      async (body) => {
        vi.stubGlobal('fetch', vi.fn(async () => response(body)));
        await expect(buildGateway().searchSchools('cent')).rejects.toThrow('Malformed server response.');
      },
    );
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
