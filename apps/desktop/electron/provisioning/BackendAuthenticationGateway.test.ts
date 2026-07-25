import { afterEach, describe, expect, it, vi } from 'vitest';
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
