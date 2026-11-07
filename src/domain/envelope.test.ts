import { describe, expect, it } from 'vitest';
import { canEditField, canEditLayout, canView, localDate, transition } from './envelope';
import { masterAgreementLayout, USERS } from './seed';
import type { Envelope } from './types';
import { validateValue } from './validation';

const [alex, sam, dana] = USERS;
const now = new Date('2026-11-08T12:00:00Z');

function draft(): Envelope {
  return {
    id: 'e1',
    sourceDocId: 'master-agreement',
    senderId: alex.id,
    recipient: null,
    status: 'draft',
    fields: masterAgreementLayout(),
    values: {},
    createdAt: now.toISOString(),
  };
}

const senderValues = { 'lsfs-signature': { kind: 'typed', text: 'Alex Rivera' }, 'lsfs-title': 'Sales Director' } as const;
const recipientValues = {
  'cust-customer-legal-name': 'Acme Corp',
  'cust-purchasing-agent': 'Sam Chen',
  'cust-email': 'sam@acmecorp.example',
  'cust-address': '1 Main St',
  'cust-city': 'Austin',
  'cust-state': 'TX',
  'cust-zip': '78701',
  'cust-phone': '(512) 555-0100',
  'cust-signature': { kind: 'typed', text: 'Sam Chen' },
  'cust-title': 'CFO',
} as const;

function sent(): Envelope {
  return transition({ ...draft(), values: { ...senderValues } }, { type: 'issue', recipient: { name: 'Sam', email: sam.email } }, alex, now);
}

describe('transition', () => {
  it('issues a valid draft and auto-fills the sender name and date', () => {
    const env = sent();
    expect(env.status).toBe('sent');
    expect(env.values['lsfs-print-name']).toBe('Alex Rivera');
    expect(env.values['lsfs-date']).toBe(localDate(now));
  });

  it('refuses to issue when sender required fields are missing', () => {
    expect(() => transition(draft(), { type: 'issue', recipient: { name: 'Sam', email: sam.email } }, alex, now)).toThrow(/required/);
  });

  it('refuses the wrong actor', () => {
    const env = { ...draft(), values: { ...senderValues } };
    expect(() => transition(env, { type: 'issue', recipient: { name: 'Sam', email: sam.email } }, sam, now)).toThrow(/Only the sender/);
    expect(() => transition(sent(), { type: 'complete' }, dana, now)).toThrow(/Only the recipient/);
  });

  it('completes when recipient fields are valid, and completed is terminal', () => {
    const done = transition({ ...sent(), values: { ...sent().values, ...recipientValues } }, { type: 'complete' }, sam, now);
    expect(done.status).toBe('completed');
    expect(done.values['cust-print-name']).toBe('Sam Chen');
    expect(() => transition(done, { type: 'complete' }, sam, now)).toThrow(/completed/);
  });

  it('refuses to complete with invalid recipient fields', () => {
    const env = { ...sent(), values: { ...sent().values, ...recipientValues, 'cust-email': 'not-an-email' } };
    expect(() => transition(env, { type: 'complete' }, sam, now)).toThrow(/required fields/);
  });
});

describe('signing date', () => {
  it('fills each side with the date that side actually signed', () => {
    const sentOn = new Date(2026, 10, 8, 9, 0); // Nov 8, 9:00 local
    const finishedOn = new Date(2026, 10, 10, 16, 30); // Nov 10, 4:30 pm local
    const issued = transition({ ...draft(), values: { ...senderValues } }, { type: 'issue', recipient: { name: 'Sam', email: sam.email } }, alex, sentOn);
    expect(issued.values['lsfs-date']).toBe('2026-11-08');
    expect(issued.values['cust-date']).toBeUndefined(); // recipient's date waits until they finish
    const done = transition({ ...issued, values: { ...issued.values, ...recipientValues } }, { type: 'complete' }, sam, finishedOn);
    expect(done.values['cust-date']).toBe('2026-11-10');
    expect(done.values['lsfs-date']).toBe('2026-11-08'); // sender's date is not overwritten
  });

  it("uses the signer's local date, even late in the evening", () => {
    expect(localDate(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06');
    expect(localDate(new Date(2026, 0, 2, 0, 5))).toBe('2026-01-02');
  });
});

describe('permissions', () => {
  it('lets each side edit only its own fields, only at its turn', () => {
    const fields = masterAgreementLayout();
    const senderTitle = fields.find((f) => f.id === 'lsfs-title')!;
    const custTitle = fields.find((f) => f.id === 'cust-title')!;
    const env = sent();
    expect(canEditField(env, custTitle, sam)).toBe(true);
    expect(canEditField(env, senderTitle, sam)).toBe(false);
    expect(canEditField(env, senderTitle, alex)).toBe(false); // sender values locked once sent
    expect(canEditLayout(env, alex)).toBe(false);
  });

  it('locks everything once completed', () => {
    const done = transition({ ...sent(), values: { ...sent().values, ...recipientValues } }, { type: 'complete' }, sam, now);
    expect(done.fields.some((f) => canEditField(done, f, sam) || canEditField(done, f, alex))).toBe(false);
  });

  it('hides drafts from recipients and envelopes from strangers', () => {
    expect(canView(sent(), sam)).toBe(true);
    expect(canView(sent(), dana)).toBe(false);
    expect(canView({ ...draft(), recipient: { name: 'Sam', email: sam.email } }, sam)).toBe(false);
  });
});

describe('validation', () => {
  const field = (type: 'email' | 'phone' | 'text', required = true) =>
    ({ id: 'f', page: 0, x: 0, y: 0, w: 0.1, h: 0.1, type, label: 'F', required, assignee: 'recipient' }) as const;
  it('checks email, phone and required', () => {
    expect(validateValue(field('email'), 'a@b.co')).toBeNull();
    expect(validateValue(field('email'), 'nope')).not.toBeNull();
    expect(validateValue(field('phone'), '817-555-0142')).toBeNull();
    expect(validateValue(field('phone'), '555-0142')).not.toBeNull();
    expect(validateValue(field('text'), '  ')).not.toBeNull();
    expect(validateValue(field('text', false), '')).toBeNull();
  });
});
