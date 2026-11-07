import { describe, expect, it } from 'vitest';
import { USERS } from '../domain/seed';
import { LocalStorageEnvelopeRepository } from '../repository/envelopeRepository';
import { memoryStorage } from '../repository/storage';
import { EnvelopeService } from './envelopeService';
import { EventBus } from './eventBus';

const [alex, sam, dana] = USERS;

describe('EnvelopeService access', () => {
  it('only shows and returns envelopes the user sent or received', async () => {
    const service = new EnvelopeService(new LocalStorageEnvelopeRepository(memoryStorage()), new EventBus());
    const env = await service.createEnvelope('master-agreement', alex);
    expect(await service.listForUser(alex)).toHaveLength(1);
    expect(await service.listForUser(dana)).toHaveLength(0);
    await expect(service.getForUser(env.id, dana)).rejects.toThrow(/not found/);
    await expect(service.updateValues(env.id, {}, sam)).rejects.toThrow(/not found/);
  });
});
