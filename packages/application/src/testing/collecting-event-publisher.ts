import type { ApplicationEvent, IEventPublisher } from '../interfaces/event-publisher';

export class CollectingEventPublisher implements IEventPublisher {
  readonly published: ApplicationEvent[] = [];
  publish(event: ApplicationEvent): void {
    this.published.push(event);
  }
}
