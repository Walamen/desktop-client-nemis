import type {
  AuthenticatedSession,
  AuthenticationGateway,
} from '@nemis-desktop/application';
import { AuthenticationUnavailableError } from '@nemis-desktop/application';
import {
  DESKTOP_PORTALS,
  DesktopScopeType,
  isDesktopPortalRole,
  type DesktopPortalRole,
  type DesktopUserScope,
  type ProvisioningUser,
} from '@nemis-desktop/types';
import { ForbiddenError, UnauthorizedError } from '@nemis-desktop/shared';
import { asRecord, unwrapCookies, wrapCookies } from './sessionSecret';

interface BackendUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  countyId?: string | null;
  districtId?: string | null;
  institutionId?: string | null;
  staffId?: string | null;
  institution?: { name?: string } | null;
}

const OFFLINE_LEASE_MS = 7 * 24 * 60 * 60 * 1000;

export class BackendAuthenticationGateway implements AuthenticationGateway {
  constructor(private readonly baseUrl: string) {}

  async authenticate(email: string, password: string): Promise<AuthenticatedSession> {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const secret = extractAuthCookies(response);
    const user = readUser(await response.json());
    return onlineSession(user, secret);
  }

  async restore(sessionSecret: string): Promise<AuthenticatedSession> {
    let cookies = unwrapCookies(sessionSecret);
    let response = await this.request('/auth/me', { headers: { cookie: cookies } }, true);
    if (response.status === 401) {
      const refreshed = await this.request('/auth/refresh', {
        method: 'POST',
        headers: { cookie: cookies },
      });
      cookies = mergeCookies(cookies, extractAuthCookies(refreshed));
      response = await this.request('/auth/me', { headers: { cookie: cookies } });
    }
    const user = readUser(await response.json());
    return onlineSession(user, wrapCookies(cookies));
  }

  async logout(sessionSecret: string): Promise<void> {
    await this.request('/auth/logout', {
      method: 'POST',
      headers: { cookie: unwrapCookies(sessionSecret) },
    });
  }

  private async request(
    path: string,
    init: RequestInit,
    allowUnauthorized = false,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        ...init,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-app-context': 'desktop',
          ...init.headers,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      throw new AuthenticationUnavailableError('The NEMIS server could not be reached.', { cause: error });
    }
    if (response.status === 401) {
      if (allowUnauthorized) return response;
      throw new UnauthorizedError();
    }
    if (response.status === 403) {
      throw new ForbiddenError('This account is not authorized to provision NEMIS Desktop.');
    }
    if (!response.ok) throw new Error(`NEMIS authentication failed with status ${response.status}.`);
    return response;
  }
}

function onlineSession(user: BackendUser, sessionSecret: string): AuthenticatedSession {
  return {
    user: toProvisioningUser(user),
    sessionSecret,
    offlineAccessExpiresAt: new Date(Date.now() + OFFLINE_LEASE_MS).toISOString(),
  };
}

function readUser(payload: unknown): BackendUser {
  const root = asRecord(payload);
  const firstData = asRecord(root.data);
  const nestedData = asRecord(firstData.data);
  const user = asRecord(firstData.user ?? nestedData.user);
  for (const key of ['id', 'email', 'firstName', 'lastName', 'role'] as const) {
    if (typeof user[key] !== 'string' || user[key].length === 0) {
      throw new Error('The authentication response did not match the backend contract.');
    }
  }
  return user as unknown as BackendUser;
}

function toProvisioningUser(user: BackendUser): ProvisioningUser {
  if (!isDesktopPortalRole(user.role)) {
    throw new ForbiddenError('This account role is not supported by NEMIS Desktop.');
  }
  const scope = resolveScope(user.role, user);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    scope,
    institutionId: user.institutionId ?? undefined,
    countyId: user.countyId ?? undefined,
    districtId: user.districtId ?? undefined,
    staffId: user.staffId ?? undefined,
    institutionName: user.institution?.name,
  };
}

function resolveScope(role: DesktopPortalRole, user: BackendUser): DesktopUserScope {
  const scopeType = DESKTOP_PORTALS[role].scopeType;
  if (scopeType === DesktopScopeType.NATIONAL) {
    return { type: scopeType, scopeId: 'national' };
  }
  if (scopeType === DesktopScopeType.COUNTY && user.countyId) {
    return { type: scopeType, scopeId: user.countyId, countyId: user.countyId };
  }
  if (scopeType === DesktopScopeType.DISTRICT && user.districtId) {
    return {
      type: scopeType,
      scopeId: user.districtId,
      countyId: user.countyId ?? undefined,
      districtId: user.districtId,
    };
  }
  if (
    (scopeType === DesktopScopeType.INSTITUTION || scopeType === DesktopScopeType.TEACHER) &&
    user.institutionId
  ) {
    return {
      type: scopeType,
      scopeId: scopeType === DesktopScopeType.TEACHER ? user.id : user.institutionId,
      countyId: user.countyId ?? undefined,
      districtId: user.districtId ?? undefined,
      institutionId: user.institutionId,
      staffId: user.staffId ?? undefined,
    };
  }
  throw new ForbiddenError(`This ${role} account has no active ${scopeType.toLowerCase()} assignment.`);
}

function extractAuthCookies(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headers.getSetCookie?.() ?? [];
  const values = setCookies
    .map((entry) => entry.split(';', 1)[0])
    .filter((entry): entry is string => Boolean(entry && /=/.test(entry)));
  if (values.length === 0) {
    throw new Error('The authentication server did not issue a session.');
  }
  return wrapCookies(values.join('; '));
}

function mergeCookies(current: string, updateSecret: string): string {
  const jar = new Map<string, string>();
  for (const entry of `${current}; ${unwrapCookies(updateSecret)}`.split(';')) {
    const [name, ...rest] = entry.trim().split('=');
    if (name && rest.length > 0) jar.set(name, rest.join('='));
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}
