import {
  applyLayout,
  applyValues,
  canView,
  DomainError,
  transition,
} from '../domain/envelope';
import type { Envelope, FieldDefinition, FieldValue, Recipient, User } from '../domain/types';
import type { EnvelopeRepository } from '../repository/envelopeRepository';
import type { EnvelopeEvent, EventBus } from './eventBus';

/**
 * The only way to read or change envelopes. Every method takes the acting
 * user and re-checks the domain rules, so the UI cannot bypass them.
 * It announces changes on the event bus and knows nothing about who listens.
 */
export class EnvelopeService {
  private readonly repo: EnvelopeRepository;
  private readonly bus: EventBus;
  private readonly now: () => Date;

  constructor(repo: EnvelopeRepository, bus: EventBus, now: () => Date = () => new Date()) {
    this.repo = repo;
    this.bus = bus;
    this.now = now;
  }

  async listForUser(actor: User): Promise<Envelope[]> {
    const all = await this.repo.list();
    return all
      .filter((env) => canView(env, actor))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Same "not found" for missing and forbidden, so ids can't be probed. */
  async getForUser(id: string, actor: User): Promise<Envelope> {
    const env = await this.repo.get(id);
    if (!env || !canView(env, actor)) throw new DomainError('Envelope not found');
    return env;
  }

  async createEnvelope(sourceDocId: string, actor: User, fields: FieldDefinition[] = []): Promise<Envelope> {
    const env: Envelope = {
      id: crypto.randomUUID(),
      sourceDocId,
      senderId: actor.id,
      recipient: null,
      status: 'draft',
      fields,
      values: {},
      createdAt: this.now().toISOString(),
    };
    await this.repo.put(env);
    this.publish('envelope.created', env, actor, { sourceDocId });
    return env;
  }

  async updateLayout(id: string, fields: FieldDefinition[], actor: User): Promise<Envelope> {
    const next = applyLayout(await this.getForUser(id, actor), fields, actor);
    await this.repo.put(next);
    this.publish('layout.updated', next, actor, { fieldCount: fields.length });
    return next;
  }

  async updateValues(id: string, patch: Record<string, FieldValue>, actor: User): Promise<Envelope> {
    const fieldIds = Object.keys(patch);
    const current = await this.getForUser(id, actor);
    if (fieldIds.length === 0) return current;
    const next = applyValues(current, patch, actor);
    await this.repo.put(next);
    this.publish('values.updated', next, actor, { fieldIds });
    return next;
  }

  async issue(id: string, recipient: Recipient, actor: User): Promise<Envelope> {
    const next = transition(await this.getForUser(id, actor), { type: 'issue', recipient }, actor, this.now());
    await this.repo.put(next);
    this.publish('envelope.issued', next, actor, { recipient: next.recipient! });
    return next;
  }

  async complete(id: string, actor: User): Promise<Envelope> {
    const next = transition(await this.getForUser(id, actor), { type: 'complete' }, actor, this.now());
    await this.repo.put(next);
    this.publish('envelope.completed', next, actor, {});
    return next;
  }

  // Emit only after the save succeeded, so listeners never hear about a change that didn't happen.
  private publish<T extends EnvelopeEvent['type']>(
    type: T,
    env: Envelope,
    actor: User,
    data: Extract<EnvelopeEvent, { type: T }>['data'],
  ): void {
    this.bus.emit({ type, envelopeId: env.id, at: this.now().toISOString(), actorId: actor.id, data } as EnvelopeEvent);
  }
}
