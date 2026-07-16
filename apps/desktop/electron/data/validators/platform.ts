import type {
  CreateDeviceInput,
  EnqueueSyncOperationInput,
  RecordSyncErrorInput,
  SetSettingInput,
  UpdateDeviceInput,
  UpdateSyncMetadataInput,
} from '../dto/platform';
import { SYNC_OPERATION_TYPES, SYNC_STATUSES } from '../models/platform';
import {
  createValidator,
  isIsoDate,
  isJsonSerializable,
  isNonNegativeInt,
  isString,
  maxLength,
  oneOf,
  required,
} from './core';

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

export const validateUpdateSyncMetadata = createValidator<UpdateSyncMetadataInput>(
  'SyncMetadata',
  {
    lastSyncAt: [isIsoDate()],
    syncStatus: [isString(), oneOf(SYNC_STATUSES)],
    schemaVersion: [isNonNegativeInt()],
    databaseVersion: [isNonNegativeInt()],
  },
);

export const validateEnqueue = createValidator<EnqueueSyncOperationInput>('SyncQueueItem', {
  entityType: [required(), isString(), maxLength(100)],
  entityId: [required(), isString(), maxLength(128)],
  operationType: [required(), isString(), oneOf(SYNC_OPERATION_TYPES)],
  payload: [isJsonSerializable()],
});

export const validateRecordSyncError = createValidator<RecordSyncErrorInput>('SyncError', {
  operationId: [isString(), maxLength(128)],
  message: [required(), isString(), maxLength(2000)],
  stack: [isString(), maxLength(10000)],
  retryCount: [isNonNegativeInt()],
});

export const validatePurge = createValidator<{ olderThan: string }>('SyncQueue.purge', {
  olderThan: [required(), isIsoDate()],
});
