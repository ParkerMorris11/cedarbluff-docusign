import { describe, expect, it } from 'vitest';
import { USERS } from '../../domain/seed';
import { LocalStorageEnvelopeRepository } from '../../repository/envelopeRepository';
import { memoryStorage } from '../../repository/storage';
import { EnvelopeService } from '../../service/envelopeService';
import { EventBus } from '../../service/eventBus';
import { AuditLog } from './auditLog';
import { makeEntry, verifyChain, type AuditEntry } from './chain';

async function chainOf(n: number): Promise<AuditEntry[]> {
  const out: AuditEntry[] = [];
  for (let i = 0; i < n; i++) {
    out.push(await makeEntry(out[i - 1], { envelopeId: 'e1', at: `t${i}`, actorId: 'u', type: 'x', data: { i } }));
  }
  return out;
}

describe('audit chain', () => {
  it('verifies an untouched chain', async () => {
    expect(await verifyChain(await chainOf(5))).toEqual({ ok: true, count: 5 });
  });

  it('detects edited content', async () => {
    const chain = await chainOf(5);
    chain[2] = { ...chain[2], at: 'edited' };
    expect(await verifyChain(chain)).toMatchObject({ ok: false, brokenAtSeq: 2 });
  });

  it('detects an edit even when the edited entry has its own hash recomputed', async () => {
    const chain = await chainOf(5);
    chain[2] = await makeEntry(chain[1], { envelopeId: 'e1', at: 'edited', actorId: 'u', type: 'x', data: { i: 2 } });
    expect(await verifyChain(chain)).toMatchObject({ ok: false, brokenAtSeq: 3 });
  });

  it('detects a removed middle entry, but not removed newest entries (known limit, see WRITEUP)', async () => {
    const chain = await chainOf(5);
    expect(await verifyChain([...chain.slice(0, 2), ...chain.slice(3)])).toMatchObject({ ok: false });
    // Without an anchor stored elsewhere, a shorter chain still looks valid.
    expect(await verifyChain(chain.slice(0, 3))).toEqual({ ok: true, count: 3 });
  });

  it('records every service event in order through the bus, without forking', async () => {
    const storage = memoryStorage();
    const repo = new LocalStorageEnvelopeRepository(storage);
    const bus = new EventBus();
    const audit = new AuditLog(storage, repo, bus);
    const service = new EnvelopeService(repo, bus);
    const [alex] = USERS;
    const env = await service.createEnvelope('master-agreement', alex);
    // Fire several changes back to back without waiting for the audit writes.
    await Promise.all([1, 2, 3].map((n) => service.updateLayout(env.id, [], alex).then(() => n)));
    const entries = await audit.listFor(env.id, alex);
    expect(entries.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(await audit.verify(env.id, alex)).toEqual({ ok: true, count: 4 });
  });
});
