import { describe, expect, it } from 'vitest';
import { transition } from './envelope';
import { envelopeProgress } from './progress';
import { masterAgreementLayout, USERS } from './seed';
import type { Envelope } from './types';

const [alex, sam] = USERS;

function draft(overrides: Partial<Envelope> = {}): Envelope {
  return {
    id: 'e1', sourceDocId: 'doc', senderId: alex.id, recipient: null, status: 'draft',
    fields: masterAgreementLayout(), values: {}, createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const senderValues = { 'lsfs-signature': { kind: 'typed', text: 'Alex Rivera' }, 'lsfs-title': 'Director' } as const;
const recipientValues = {
  'cust-customer-legal-name': 'Acme', 'cust-purchasing-agent': 'Sam', 'cust-email': 'sam@acmecorp.example',
  'cust-address': '1 Main', 'cust-city': 'Waco', 'cust-state': 'TX', 'cust-zip': '76701', 'cust-phone': '2545550100',
  'cust-signature': { kind: 'typed', text: 'Sam Chen' }, 'cust-title': 'Buyer',
} as const;

const states = (env: Envelope) => envelopeProgress(env).stages.map((s) => s.state);

describe('envelopeProgress', () => {
  it('starts on placing boxes when a draft has none', () => {
    const p = envelopeProgress(draft({ fields: [] }));
    expect(p.step).toBe(1);
    expect(states(draft({ fields: [] }))).toEqual(['current', 'upcoming', 'upcoming', 'upcoming']);
  });

  it('moves to the sender once boxes exist, and counts their saved boxes', () => {
    const p = envelopeProgress(draft({ values: { 'lsfs-title': 'Director' } }));
    expect(p.step).toBe(2);
    expect(p.stages[1]).toMatchObject({ state: 'current', fill: 0.5, boxes: { done: 1, total: 2 } });
  });

  it('stays on the sender with all boxes filled, because it has not been sent', () => {
    const p = envelopeProgress(draft({ values: senderValues }));
    expect(p.step).toBe(2);
    expect(p.stages[1]).toMatchObject({ state: 'current', fill: 1 });
    expect(p.stages[2].state).toBe('upcoming');
  });

  it('moves to the recipient when sent, and does not count an optional box against them', () => {
    const sent = transition(draft({ values: senderValues }), { type: 'issue', recipient: { name: sam.name, email: sam.email } }, alex);
    const p = envelopeProgress(sent);
    expect(p.step).toBe(3);
    expect(p.stages[1].state).toBe('done');
    expect(p.stages[2]).toMatchObject({ state: 'current', fill: 0, boxes: { done: 0, total: 10 } });
  });

  it('does not count an invalid value as progress', () => {
    const sent = draft({ status: 'sent', recipient: { name: sam.name, email: sam.email }, values: { ...senderValues, 'cust-phone': '123' } });
    expect(envelopeProgress(sent).stages[2].boxes).toEqual({ done: 0, total: 10 });
  });

  it('finishes with every stage done', () => {
    const sent = transition(draft({ values: senderValues }), { type: 'issue', recipient: { name: sam.name, email: sam.email } }, alex);
    const done = transition({ ...sent, values: { ...sent.values, ...recipientValues } }, { type: 'complete' }, sam);
    const p = envelopeProgress(done);
    expect(p.step).toBe(4);
    expect(p.stages.every((s) => s.state === 'done' && s.fill === 1)).toBe(true);
  });
});
