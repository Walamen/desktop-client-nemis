import { describe, expect, it } from 'vitest';
import { UpdateSettingsUseCase } from './update-settings';
import { InMemorySettingsGateway } from '../../testing/infra/in-memory-settings-gateway';
import { CollectingEventPublisher, FixedClock, RecordingLogger } from '../../testing';
import { ApplicationValidationException } from '../../exceptions';

function build() {
  const gateway = new InMemorySettingsGateway();
  const events = new CollectingEventPublisher();
  const useCase = new UpdateSettingsUseCase({
    settingsGateway: gateway,
    clock: new FixedClock('2026-07-18T00:00:00.000Z'),
    events,
    logger: new RecordingLogger(),
  });
  return { gateway, events, useCase };
}

describe('UpdateSettingsUseCase', () => {
  it('writes the setting and emits SettingsUpdated', async () => {
    const { gateway, events, useCase } = build();
    const res = await useCase.execute({ key: 'theme', value: 'dark' });
    expect(res.data).toMatchObject({ key: 'theme', value: 'dark' });
    expect(gateway.get('theme')).toBe('dark');
    expect(events.published[0]).toMatchObject({ name: 'SettingsUpdated', key: 'theme' });
  });

  it('rejects a blank key', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ key: '', value: 1 })).rejects.toBeInstanceOf(
      ApplicationValidationException,
    );
  });
});
