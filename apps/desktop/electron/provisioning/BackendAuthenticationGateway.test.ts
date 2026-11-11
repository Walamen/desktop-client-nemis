import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@nemis-desktop/shared';
import { BackendAuthenticationGateway } from './BackendAuthenticationGateway';

const backendUser = {
  id: 'user-1',
  email: 'admin@school.edu',
  firstName: 'School',
  lastName: 'Admin',
  role: 'INSTITUTION_ADMIN',
  institutionId: 'school-1',
  institution: { name: 'Central High' },
};

afterEach(() => vi.unstubAllGlobals());

describe('BackendAuthenticationGateway', () => {
  it('authenticates against the existing wrapped login contract and captures cookies', async () => {
    const response = jsonResponse({ success: true, data: { success: true, data: { user: backendUser } } });
    setCookies(response, ['sid=session; HttpOnly', 'refresh_token=refresh; HttpOnly']);
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);

    const result = await new BackendAuthenticationGateway('https://nemis.example').authenticate(
      'admin@school.edu',
      'password',
    );

    expect(result.user.institutionName).toBe('Central High');
    expect(result.sessionSecret).toContain('refresh_token=refresh');
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://nemis.example/auth/login'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refreshes an expired access cookie once before restoring the user', async () => {
    const unauthorized = new Response(null, { status: 401 });
    const refreshed = jsonResponse({ success: true });
    setCookies(refreshed, ['access_token=new-access; HttpOnly', 'refresh_token=new-refresh; HttpOnly']);
    const me = jsonResponse({ success: true, data: { success: true, data: { user: backendUser } } });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(unauthorized)
      .mockResolvedValueOnce(refreshed)
      .mockResolvedValueOnce(me);
    vi.stubGlobal('fetch', fetchMock);

    const result = await new BackendAuthenticationGateway('https://nemis.example').restore(
      JSON.stringify({ cookies: 'sid=session; refresh_token=old-refresh' }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.sessionSecret).toContain('new-refresh');
    expect(result.user.id).toBe('user-1');
  });

  it.each([
    ['MINISTRY_ADMIN', {}, 'NATIONAL', 'national'],
    ['COUNTY_ADMIN', { countyId: 'county-1' }, 'COUNTY', 'county-1'],
    ['DEO', { countyId: 'county-1', districtId: 'district-1' }, 'DISTRICT', 'district-1'],
    ['TEACHER', { institutionId: 'school-1', staffId: 'staff-1' }, 'TEACHER', 'user-1'],
  ])('derives the authorized desktop scope for %s', async (
    role,
    identifiers,
    scopeType,
    scopeId,
  ) => {
    const response = jsonResponse({
      success: true,
      data: { user: { ...backendUser, institutionId: undefined, role, ...identifiers } },
    });
    setCookies(response, ['sid=session; HttpOnly']);
    vi.stubGlobal('fetch', vi.fn(async () => response));

    const result = await new BackendAuthenticationGateway('https://nemis.example').authenticate(
      'user@nemis.gov.lr',
      'password',
    );

    expect(result.user.scope).toMatchObject({ type: scopeType, scopeId });
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
  ])('refuses a signed-in user whose email is %s (desktop sign-in is email-only)', async (_label, email) => {
    const response = jsonResponse({ success: true, data: { user: { ...backendUser, email } } });
    setCookies(response, ['sid=session; HttpOnly']);
    vi.stubGlobal('fetch', vi.fn(async () => response));
    await expect(
      new BackendAuthenticationGateway('https://nemis.example').authenticate('admin@school.edu', 'password'),
    ).rejects.toThrow('did not match the backend contract');
  });

  describe('school office staff', () => {
    const staffUser = {
      ...backendUser,
      role: 'INSTITUTION_STAFF',
      institutionId: 'inst-1',
      modules: ['STUDENTS'],
      title: 'Registrar',
    };

    async function login(user: Record<string, unknown>) {
      const response = jsonResponse({ success: true, data: { user } });
      setCookies(response, ['sid=session; HttpOnly']);
      vi.stubGlobal('fetch', vi.fn(async () => response));
      return new BackendAuthenticationGateway('https://nemis.example').authenticate('a@b.c', 'password');
    }

    it('login of an INSTITUTION_STAFF user carries modules and title', async () => {
      const { user } = await login(staffUser);
      expect(user.modules).toEqual(['STUDENTS']);
      expect(user.title).toBe('Registrar');
      expect(user.scope).toMatchObject({ type: 'INSTITUTION', scopeId: 'inst-1', institutionId: 'inst-1' });
    });

    it('restore via /auth/me carries modules', async () => {
      const me = jsonResponse({ success: true, data: { user: staffUser } });
      vi.stubGlobal('fetch', vi.fn(async () => me));
      const { user } = await new BackendAuthenticationGateway('https://nemis.example').restore(
        JSON.stringify({ cookies: 'sid=session' }),
      );
      expect(user.modules).toEqual(['STUDENTS']);
      expect(user.title).toBe('Registrar');
      expect(user.scope).toMatchObject({ type: 'INSTITUTION', scopeId: 'inst-1', institutionId: 'inst-1' });
    });

    it('unknown module ids are dropped', async () => {
      const { user } = await login({ ...staffUser, modules: ['STUDENTS', 'TIME_TRAVEL'] });
      expect(user.modules).toEqual(['STUDENTS']);
    });

    it.each([
      ['absent', undefined],
      ['a string', 'STUDENTS'],
    ])('missing or malformed modules (%s) become []', async (_label, modules) => {
      const { user } = await login({ ...staffUser, modules });
      expect(user.modules).toEqual([]);
    });

    it('other roles get modules [] and no title', async () => {
      const { user } = await login(backendUser);
      expect(user.modules).toEqual([]);
      expect(user.title).toBeUndefined();
    });

    it('staff account without institutionId is refused', async () => {
      await expect(login({ ...staffUser, institutionId: undefined })).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function setCookies(response: Response, cookies: string[]): void {
  Object.defineProperty(response.headers, 'getSetCookie', { value: () => cookies });
}
