import {
  IpcChannels,
  type CreateSchoolUserRequest,
  type SchoolOfficeUser,
  type SchoolUsersResult,
  type SetSchoolUserActiveRequest,
  type UpdateSchoolUserRequest,
} from '@nemis-desktop/types';
import type { ApplicationLayer } from '@nemis-desktop/application';
import type { BackendProvisioningGateway } from '@app/provisioning/BackendProvisioningGateway';
import type { IpcHandle } from '@app/ipc/registrar';
import { logger } from '@app/services/logger';
import {
  assertNoArgs,
  assertSchoolUserCreateArgs,
  assertSchoolUserSetActiveArgs,
  assertSchoolUserUpdateArgs,
} from '@app/security/validateIpc';
import { runOnline } from './online';

export type SchoolUserGateway = Pick<
  BackendProvisioningGateway,
  'listSchoolUsers' | 'createSchoolUser' | 'updateSchoolUser' | 'setSchoolUserActive'
>;

export interface SchoolUserHandlerDeps {
  gateway: SchoolUserGateway;
  isOnline: () => boolean;
  /** Forced pull after a command, so local SQLite catches up with the server. */
  refresh: () => Promise<boolean>;
  /** The signed-in School Admin's school (workspace scope id). */
  institutionId: () => string;
}

/** Users & Access. The list is the server's when it answers; offline, or on any
 * server failure, it is this device's copy (source 'device'). Linkable staff
 * always come from the device. Commands are online only and force a pull. The
 * create result can carry a one-time default password: it is returned to the
 * admin and never logged. */
export function registerSchoolUserHandlers(
  handle: IpcHandle,
  app: ApplicationLayer,
  deps: SchoolUserHandlerDeps,
): void {
  const fromDevice = async (): Promise<SchoolUsersResult> =>
    (await app.institution.listSchoolUsers({ institutionId: deps.institutionId() })).data;

  handle(IpcChannels.SCHOOL_USERS_LIST, assertNoArgs, async (): Promise<SchoolUsersResult> => {
    if (!deps.isOnline()) return fromDevice();
    let users: SchoolOfficeUser[];
    try {
      users = await deps.gateway.listSchoolUsers();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      logger.warn(
        `School users unavailable from the server (${reason}); showing this device's accounts.`,
      );
      return fromDevice();
    }
    const { linkableStaff } = await fromDevice();
    return { source: 'server', users, linkableStaff };
  });

  handle(
    IpcChannels.SCHOOL_USERS_CREATE,
    assertSchoolUserCreateArgs,
    (request: CreateSchoolUserRequest) =>
      runOnline(() => deps.gateway.createSchoolUser(request), deps.refresh),
  );
  handle(
    IpcChannels.SCHOOL_USERS_UPDATE,
    assertSchoolUserUpdateArgs,
    (request: UpdateSchoolUserRequest) =>
      runOnline(() => deps.gateway.updateSchoolUser(request), deps.refresh),
  );
  handle(
    IpcChannels.SCHOOL_USERS_SET_ACTIVE,
    assertSchoolUserSetActiveArgs,
    (request: SetSchoolUserActiveRequest) =>
      runOnline(() => deps.gateway.setSchoolUserActive(request), deps.refresh),
  );
}
