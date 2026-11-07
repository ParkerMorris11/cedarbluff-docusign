import type { Envelope } from '../domain/types';
import { readJson, type KeyValueStorage } from './storage';

/**
 * The seam between the app and wherever envelopes are stored.
 * Async on purpose: it has the same shape a real HTTP API would have,
 * so swapping localStorage for a backend touches only this folder.
 */
export interface EnvelopeRepository {
  list(): Promise<Envelope[]>;
  get(id: string): Promise<Envelope | undefined>;
  put(envelope: Envelope): Promise<void>;
}

const KEY = 'minisign.envelopes.v1';

export class LocalStorageEnvelopeRepository implements EnvelopeRepository {
  private readonly storage: KeyValueStorage;
  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  private readAll(): Record<string, Envelope> {
    return readJson<Record<string, Envelope>>(this.storage, KEY, {});
  }

  async list(): Promise<Envelope[]> {
    return Object.values(this.readAll());
  }

  async get(id: string): Promise<Envelope | undefined> {
    return this.readAll()[id];
  }

  async put(envelope: Envelope): Promise<void> {
    const all = this.readAll();
    all[envelope.id] = envelope;
    this.storage.setItem(KEY, JSON.stringify(all));
  }
}
