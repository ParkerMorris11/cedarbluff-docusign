import { canView } from '../../domain/envelope';
import type { User } from '../../domain/types';
import type { EnvelopeRepository } from '../../repository/envelopeRepository';
import { readJson, type KeyValueStorage } from '../../repository/storage';
import type { EventBus } from '../../service/eventBus';
import { documentFingerprint, makeEntry, recordedFingerprint, verifyChain, type AuditEntry, type VerifyResult } from './chain';

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
    // Seal what the document looked like into the entry, so Verify can also tell if the document
    // itself was edited afterwards. The service saves before it emits, so this is the saved state.
    const env = await this.envelopes.get(event.envelopeId);
    const data = { ...(event.data as object), ...(env ? { docHash: await documentFingerprint(env) } : {}) };
    const entry = await makeEntry(chain[chain.length - 1], { ...event, data });
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

  /**
   * Checks the chain itself, then checks the document against the newest entry's fingerprint.
   * The second check catches a value or status edited directly in storage.
   */
  async verify(envelopeId: string, actor: User): Promise<VerifyResult> {
    const entries = await this.listFor(envelopeId, actor);
    const chain = await verifyChain(entries);
    if (!chain.ok || entries.length === 0) return chain;
    const last = entries[entries.length - 1];
    const recorded = recordedFingerprint(last);
    const env = await this.envelopes.get(envelopeId);
    if (recorded && env && recorded !== (await documentFingerprint(env))) {
      return { ok: false, brokenAtSeq: last.seq, reason: 'The document no longer matches what this entry recorded' };
    }
    return chain;
  }
}
