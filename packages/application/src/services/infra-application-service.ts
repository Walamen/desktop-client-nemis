import type { ApplicationResponse } from '../core/response';
import type {
  DeviceOutput,
  RegisterDeviceDto,
  SettingOutput,
  UpdateSettingsDto,
} from '../dto/infra/infra-dto';
import type { RegisterDeviceUseCase } from '../use-cases/infra/register-device';
import type { UpdateSettingsUseCase } from '../use-cases/infra/update-settings';

export interface InfraApplicationServiceDeps {
  registerDevice: RegisterDeviceUseCase;
  updateSettings: UpdateSettingsUseCase;
}

export class InfraApplicationService {
  constructor(private readonly deps: InfraApplicationServiceDeps) {}
  registerDevice(dto: RegisterDeviceDto): Promise<ApplicationResponse<DeviceOutput>> {
    return this.deps.registerDevice.execute(dto);
  }
  updateSettings(dto: UpdateSettingsDto): Promise<ApplicationResponse<SettingOutput>> {
    return this.deps.updateSettings.execute(dto);
  }
}
