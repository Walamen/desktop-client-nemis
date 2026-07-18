import { describe, expect, it } from 'vitest';
import { RegisterDeviceUseCase } from './register-device';
import { InMemoryDeviceGateway } from '../../testing/infra/in-memory-device-gateway';
import { CollectingEventPublisher, FixedClock, RecordingLogger } from '../../testing';
import { ApplicationValidationException } from '../../exceptions';

function build() {
  const gateway = new InMemoryDeviceGateway();
  const events = new CollectingEventPublisher();
  const useCase = new RegisterDeviceUseCase({
    deviceGateway: gateway,
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    events,
    logger: new RecordingLogger(),
  });
  return { gateway, events, useCase };
}

const dto = { deviceName: 'lab-01', platform: 'win32', osVersion: '10.0', appVersion: '1.0.0' };

describe('RegisterDeviceUseCase', () => {
  it('registers the device and emits DeviceRegistered', async () => {
    const { gateway, events, useCase } = build();
    const res = await useCase.execute(dto);
    expect(res.data.id).toBe('dev-1');
    expect(gateway.registered).toHaveLength(1);
    expect(events.published[0]).toMatchObject({ name: 'DeviceRegistered', deviceId: 'dev-1' });
  });

  it('rejects missing device fields', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...dto, deviceName: '' })).rejects.toBeInstanceOf(
      ApplicationValidationException,
    );
  });
});
