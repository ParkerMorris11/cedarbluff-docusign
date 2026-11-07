import type { Recipient } from '../domain/types';

/** Facts the core announces after a change is saved. Listeners must not change core state. */
export type EnvelopeEvent =
  | { type: 'envelope.created'; envelopeId: string; at: string; actorId: string; data: { sourceDocId: string } }
  | { type: 'layout.updated'; envelopeId: string; at: string; actorId: string; data: { fieldCount: number } }
  | { type: 'values.updated'; envelopeId: string; at: string; actorId: string; data: { fieldIds: string[] } }
  | { type: 'envelope.issued'; envelopeId: string; at: string; actorId: string; data: { recipient: Recipient } }
  | { type: 'envelope.completed'; envelopeId: string; at: string; actorId: string; data: Record<string, never> };

type Listener = (event: EnvelopeEvent) => void;

/** A tiny synchronous publish/subscribe bus. No library needed. */
export class EventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: EnvelopeEvent): void {
    for (const listener of this.listeners) {
      // One broken listener must not break the core action or other listeners.
      try {
        listener(event);
      } catch (err) {
        console.error('Event listener failed', event.type, err);
      }
    }
  }
}
