import type { Envelope, FieldAssignee, FieldDefinition, FieldValue, Recipient, User } from './types';
import { isAutoFilled, isValidEmail, validateFields, type FieldError } from './validation';

// ---------------------------------------------------------------------------
// Roles and access. These are the single source of truth for permissions:
// the UI calls them to decide what to show, and the service calls them again
// before every change. Hiding a button is never the enforcement.
// ---------------------------------------------------------------------------

export function isSender(env: Envelope, user: User): boolean {
  return env.senderId === user.id;
}

export function isRecipient(env: Envelope, user: User): boolean {
  return !!env.recipient && env.recipient.email.toLowerCase() === user.email.toLowerCase();
}

/** Senders see their envelopes. Recipients see them only once sent (never drafts). */
export function canView(env: Envelope, user: User): boolean {
  return isSender(env, user) || (isRecipient(env, user) && env.status !== 'draft');
}

/** Layout (field positions, types, labels) can change only while draft, only by the sender. */
export function canEditLayout(env: Envelope, user: User): boolean {
  return env.status === 'draft' && isSender(env, user);
}

/**
 * Who may type into a field:
 *  - draft: the sender, into sender-assigned fields
 *  - sent: the recipient, into recipient-assigned fields
 *  - completed: nobody
 * Auto-filled fields (signer name, signing date) are never typed into.
 */
export function canEditField(env: Envelope, field: FieldDefinition, user: User): boolean {
  if (isAutoFilled(field)) return false;
  if (env.status === 'draft') return field.assignee === 'sender' && isSender(env, user);
  if (env.status === 'sent') return field.assignee === 'recipient' && isRecipient(env, user);
  return false;
}

// ---------------------------------------------------------------------------
// State machine: draft -> sent -> completed. Pure: returns a new envelope or throws.
// ---------------------------------------------------------------------------

export class DomainError extends Error {
  readonly fieldErrors: FieldError[];
  constructor(message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'DomainError';
    this.fieldErrors = fieldErrors;
  }
}

export type Action =
  | { type: 'issue'; recipient: Recipient }
  | { type: 'complete' };

/** The signer's local calendar date as YYYY-MM-DD (not UTC, which can be a day ahead in the evening). */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Fill signerName and auto-date fields for one side, at the moment that side signs. */
export function autoFill(
  fields: FieldDefinition[],
  values: Record<string, FieldValue>,
  assignee: FieldAssignee,
  signer: User,
  now: Date,
): Record<string, FieldValue> {
  const next = { ...values };
  for (const f of fields) {
    if (f.assignee !== assignee) continue;
    if (f.type === 'signerName') next[f.id] = signer.name;
    if (f.type === 'date' && f.autoFillDate) next[f.id] = localDate(now);
  }
  return next;
}

export function transition(env: Envelope, action: Action, actor: User, now: Date = new Date()): Envelope {
  switch (action.type) {
    case 'issue': {
      if (env.status !== 'draft') throw new DomainError(`Cannot issue an envelope that is ${env.status}`);
      if (!isSender(env, actor)) throw new DomainError('Only the sender can issue this envelope');
      if (env.fields.length === 0) throw new DomainError('Place at least one field before sending');
      const { name, email } = action.recipient;
      if (!name.trim() || !isValidEmail(email)) throw new DomainError('Recipient needs a name and a valid email');
      if (email.trim().toLowerCase() === actor.email.toLowerCase())
        throw new DomainError('You cannot send an envelope to yourself');
      const errors = validateFields(env.fields, env.values, 'sender');
      if (errors.length) throw new DomainError('Fill in your required fields before sending', errors);
      return {
        ...env,
        status: 'sent',
        recipient: { name: name.trim(), email: email.trim().toLowerCase() },
        values: autoFill(env.fields, env.values, 'sender', actor, now),
        sentAt: now.toISOString(),
      };
    }
    case 'complete': {
      if (env.status !== 'sent') throw new DomainError(`Cannot complete an envelope that is ${env.status}`);
      if (!isRecipient(env, actor)) throw new DomainError('Only the recipient can complete this envelope');
      const errors = validateFields(env.fields, env.values, 'recipient');
      if (errors.length) throw new DomainError('Fill in all required fields before finishing', errors);
      return {
        ...env,
        status: 'completed',
        values: autoFill(env.fields, env.values, 'recipient', actor, now),
        completedAt: now.toISOString(),
      };
    }
  }
}

/** Applies a value patch, refusing any field the actor may not edit right now. */
function isFieldValue(v: unknown): v is FieldValue {
  if (typeof v === 'string') return true;
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (o.kind === 'typed' && typeof o.text === 'string') || (o.kind === 'drawn' && typeof o.dataUrl === 'string');
}

export function applyValues(env: Envelope, patch: Record<string, FieldValue>, actor: User): Envelope {
  const byId = new Map(env.fields.map((f) => [f.id, f]));
  for (const fieldId of Object.keys(patch)) {
    const field = byId.get(fieldId);
    if (!field) throw new DomainError(`Unknown field ${fieldId}`);
    if (!canEditField(env, field, actor)) throw new DomainError(`You cannot edit "${field.label}" right now`);
    if (!isFieldValue(patch[fieldId])) throw new DomainError(`"${field.label}" has an invalid value`);
  }
  return { ...env, values: { ...env.values, ...patch } };
}

/** Replaces the layout. Drops values for fields that no longer exist. */
export function applyLayout(env: Envelope, fields: FieldDefinition[], actor: User): Envelope {
  if (!canEditLayout(env, actor)) throw new DomainError('The layout is locked');
  for (const f of fields) {
    const inside = f.x >= 0 && f.y >= 0 && f.w > 0 && f.h > 0 && f.x + f.w <= 1.0001 && f.y + f.h <= 1.0001;
    if (!inside) throw new DomainError(`Field "${f.label}" is outside the page`);
  }
  // A value survives only if its field still exists with the same type and the same person filling it.
  // Otherwise, e.g. a sender-filled field reassigned to the recipient would arrive pre-filled.
  const before = new Map(env.fields.map((f) => [f.id, f]));
  const keep = new Set(
    fields.filter((f) => before.get(f.id)?.assignee === f.assignee && before.get(f.id)?.type === f.type).map((f) => f.id),
  );
  const values = Object.fromEntries(Object.entries(env.values).filter(([id]) => keep.has(id)));
  return { ...env, fields, values };
}
