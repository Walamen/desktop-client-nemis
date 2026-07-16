import type { CreateDeviceInput, SetSettingInput, UpdateDeviceInput } from '../dto/platform';
import { createValidator, isJsonSerializable, isString, maxLength, required } from './core';

/** Persistence validators for the platform entities — one per repository input DTO. */

export const validateCreateDevice = createValidator<CreateDeviceInput>('Device', {
  deviceName: [required(), isString(), maxLength(200)],
  platform: [required(), isString(), maxLength(50)],
  osVersion: [required(), isString(), maxLength(100)],
  appVersion: [required(), isString(), maxLength(50)],
});

export const validateUpdateDevice = createValidator<UpdateDeviceInput>('Device', {
  deviceName: [isString(), maxLength(200)],
  osVersion: [isString(), maxLength(100)],
  appVersion: [isString(), maxLength(50)],
});

export const validateSetSetting = createValidator<SetSettingInput>('AppSetting', {
  key: [required(), isString(), maxLength(128)],
  value: [isJsonSerializable()],
});
