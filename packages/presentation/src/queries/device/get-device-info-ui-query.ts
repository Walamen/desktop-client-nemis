import type { ApplicationResponse, DeviceOutput, InfraApplicationService } from '@nemis-desktop/application';

export class GetDeviceInfoUiQuery {
  constructor(private readonly infra: InfraApplicationService) {}
  execute(): Promise<ApplicationResponse<DeviceOutput | null>> {
    return this.infra.getDeviceInfo();
  }
}
