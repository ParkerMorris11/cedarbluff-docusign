import { describe, expect, it } from 'vitest';
import { buildChecklist } from './checklist';
import { masterAgreementLayout } from './seed';
import { validateFields } from './validation';

const fields = masterAgreementLayout();

describe('buildChecklist', () => {
  it('lists only what each party types, and separates what is filled in for them', () => {
    const sender = buildChecklist(fields, {}, 'sender');
    expect(sender.items.map((i) => i.label)).toEqual(['Signature', 'Title']);
    expect(sender.autoFilled.map((f) => f.label).sort()).toEqual(['Date', 'Print Name']);

    const recipient = buildChecklist(fields, {}, 'recipient');
    expect(recipient.items).toHaveLength(11);
    expect(recipient.autoFilled.map((f) => f.label).sort()).toEqual(['Date', 'Print Name']);
  });

  it('does not count an empty optional field as outstanding', () => {
    const { items, remaining } = buildChecklist(fields, {}, 'recipient');
    const fax = items.find((i) => i.label === 'Fax');
    expect(fax).toMatchObject({ required: false, done: false, error: null });
    expect(remaining).toBe(10);
  });

  it('points at the first blocking field in reading order', () => {
    const empty = buildChecklist(fields, {}, 'recipient');
    expect(empty.next?.label).toBe('Customer Legal Name');

    const later = buildChecklist(fields, { 'cust-customer-legal-name': 'Acme' }, 'recipient');
    expect(later.next?.label).toBe('Purchasing Agent');
  });

  it('keeps a filled-in but invalid field outstanding', () => {
    const { items, remaining } = buildChecklist(fields, { 'cust-phone': '123' }, 'recipient');
    const phone = items.find((i) => i.label === 'Phone');
    expect(phone).toMatchObject({ done: false, empty: false });
    expect(phone?.error).toMatch(/10 digits/);
    expect(remaining).toBe(10);
  });

  it('blocks exactly the fields the submit gate blocks', () => {
    const values = { 'cust-email': 'nope', 'cust-fax': '1', 'cust-city': 'Waco' };
    const { items } = buildChecklist(fields, values, 'recipient');
    const blocking = items.filter((i) => i.error).map((i) => i.fieldId).sort();
    const gated = validateFields(fields, values, 'recipient').map((e) => e.fieldId).sort();
    expect(blocking).toEqual(gated);
  });

  it('does not reorder the caller\'s fields', () => {
    const before = fields.map((f) => f.id);
    buildChecklist(fields, {}, 'recipient');
    expect(fields.map((f) => f.id)).toEqual(before);
  });
});
