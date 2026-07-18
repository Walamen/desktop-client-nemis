import type { ApplicationEvent, IEventPublisher } from '../interfaces/event-publisher';

export class NoopEventPublisher implements IEventPublisher {
  publish(_event: ApplicationEvent): void {
    // intentionally empty — no bus this phase
  }
}
