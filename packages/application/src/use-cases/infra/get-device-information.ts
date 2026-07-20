import type { QueryHandler } from '../../core/query';
import { ok, type ApplicationResponse } from '../../core/response';
import type { DeviceOutput } from '../../dto/infra/infra-dto';
import type { IDeviceGateway } from '../../interfaces/infra/device-gateway';
import type { IAppLogger } from '../../interfaces/app-logger';
import { invokeUseCase } from '../../pipeline/use-case-invoker';

export interface GetDeviceInformationDeps {
  deviceGateway: IDeviceGateway;
  logger: IAppLogger;
}

export class GetDeviceInformationUseCase implements QueryHandler<
  Record<string, never>,
  ApplicationResponse<DeviceOutput | null>
> {
  constructor(private readonly deps: GetDeviceInformationDeps) {}

  execute(_query: Record<string, never>): Promise<ApplicationResponse<DeviceOutput | null>> {
    return invokeUseCase('GetDeviceInformation', this.deps.logger, async () => {
      return ok(this.deps.deviceGateway.getCurrent());
    });
  }
}
