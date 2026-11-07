import { canView } from '../../domain/envelope';
import type { User } from '../../domain/types';
import type { EnvelopeRepository } from '../../repository/envelopeRepository';
import { readJson, type KeyValueStorage } from '../../repository/storage';
import type { EventBus } from '../../service/eventBus';
import { makeEntry, verifyChain, type AuditEntry, type VerifyResult } from './chain';

const KEY = 'minisign.audit.v1';

/**
 * The audit trail feature. It plugs in by subscribing to the event bus.
 * The core service never imports this file.
 */
export class AuditLog {
  private readonly storage: KeyValueStorage;
  private readonly envelopes: EnvelopeRepository;
  // Appends run one at a time. Hashing is async, so without this queue two
  // events fired back to back could both read the same "previous" entry and fork the chain.
  private queue: Promise<void> = Promise.resolve();

  constructor(storage: KeyValueStorage, envelopes: EnvelopeRepository, bus: EventBus) {
    this.storage = storage;
    this.envelopes = envelopes;
    bus.subscribe((event) => {
      this.queue = this.queue
        .then(() => this.append(event))
        .catch((err) => console.error('Audit append failed', err));
    });
  }

  /** Resolves once every event received so far has been written. */
  flushed(): Promise<void> {
    return this.queue;
  }

  private readAll(): Record<string, AuditEntry[]> {
    return readJson<Record<string, AuditEntry[]>>(this.storage, KEY, {});
  }

  private async append(event: { envelopeId: string; at: string; actorId: string; type: string; data: unknown }) {
    const all = this.readAll();
    const chain = all[event.envelopeId] ?? [];
    const entry = await makeEntry(chain[chain.length - 1], event);
    all[event.envelopeId] = [...chain, entry];
    this.storage.setItem(KEY, JSON.stringify(all));
  }

  /** Same access rule as the envelope itself: you only see the trail of envelopes you can see. */
  async listFor(envelopeId: string, actor: User): Promise<AuditEntry[]> {
    const env = await this.envelopes.get(envelopeId);
    if (!env || !canView(env, actor)) return [];
    await this.flushed();
    return this.readAll()[envelopeId] ?? [];
  }

  async verify(envelopeId: string, actor: User): Promise<VerifyResult> {
    return verifyChain(await this.listFor(envelopeId, actor));
  }
}
