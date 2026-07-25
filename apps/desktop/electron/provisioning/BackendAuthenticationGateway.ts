import type {
  AuthenticatedSession,
  AuthenticationGateway,
} from '@nemis-desktop/application';
import { AuthenticationUnavailableError } from '@nemis-desktop/application';
import type { ProvisioningUser } from '@nemis-desktop/types';
import { ForbiddenError, UnauthorizedError } from '@nemis-desktop/shared';

interface BackendUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  institutionId?: string | null;
  institution?: { name?: string } | null;
}

export class BackendAuthenticationGateway implements AuthenticationGateway {
  constructor(private readonly baseUrl: string) {}

  async authenticate(email: string, password: string): Promise<AuthenticatedSession> {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const secret = extractAuthCookies(response);
    const user = readUser(await response.json());
    return { user: toProvisioningUser(user), sessionSecret: secret };
  }

  async restore(sessionSecret: string): Promise<AuthenticatedSession> {
    let cookies = parseSecret(sessionSecret);
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
    return { user: toProvisioningUser(user), sessionSecret: JSON.stringify({ cookies }) };
  }

  async logout(sessionSecret: string): Promise<void> {
    await this.request('/auth/logout', {
      method: 'POST',
      headers: { cookie: parseSecret(sessionSecret) },
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

function readUser(payload: unknown): BackendUser {
  const root = asObject(payload);
  const firstData = asObject(root.data);
  const nestedData = asObject(firstData.data);
  const user = asObject(firstData.user ?? nestedData.user);
  for (const key of ['id', 'email', 'firstName', 'lastName', 'role'] as const) {
    if (typeof user[key] !== 'string' || user[key].length === 0) {
      throw new Error('The authentication response did not match the backend contract.');
    }
  }
  return user as unknown as BackendUser;
}

function toProvisioningUser(user: BackendUser): ProvisioningUser {
  if (!user.institutionId) {
    throw new ForbiddenError('This account is not assigned to a school.');
  }
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    institutionId: user.institutionId,
    institutionName: user.institution?.name,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
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
  return JSON.stringify({ cookies: values.join('; ') });
}

function parseSecret(secret: string): string {
  const parsed = JSON.parse(secret) as { cookies?: unknown };
  if (typeof parsed.cookies !== 'string' || parsed.cookies.length === 0) {
    throw new Error('The protected session is invalid.');
  }
  return parsed.cookies;
}

function mergeCookies(current: string, updateSecret: string): string {
  const jar = new Map<string, string>();
  for (const entry of `${current}; ${parseSecret(updateSecret)}`.split(';')) {
    const [name, ...rest] = entry.trim().split('=');
    if (name && rest.length > 0) jar.set(name, rest.join('='));
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}
