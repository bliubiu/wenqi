import { type DomainEvent } from './DomainEvent';

export type Unsubscribe = () => void;

export interface EventBus {
  publish(event: DomainEvent): void;
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: (event: T) => void
  ): Unsubscribe;
}
