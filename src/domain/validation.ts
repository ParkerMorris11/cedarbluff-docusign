import type { FieldAssignee, FieldDefinition, FieldValue } from './types';

export type FieldError = { fieldId: string; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fields the system fills in itself at issue/complete time. Users never type into them. */
export function isAutoFilled(field: FieldDefinition): boolean {
  return field.type === 'signerName' || (field.type === 'date' && !!field.autoFillDate);
}

export function valueToText(value: FieldValue | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return value.kind === 'typed' ? value.text : value.dataUrl;
}

/** Returns an error message, or null if the value is acceptable for this field. */
export function validateValue(field: FieldDefinition, value: FieldValue | undefined): string | null {
  const text = valueToText(value).trim();
  if (text === '') return field.required ? `${field.label} is required` : null;

  switch (field.type) {
    case 'email':
      return EMAIL_RE.test(text) ? null : `${field.label} must be a valid email`;
    case 'phone':
      return text.replace(/\D/g, '').length >= 10 ? null : `${field.label} must have at least 10 digits`;
    case 'date':
      return Number.isNaN(Date.parse(text)) ? `${field.label} must be a valid date` : null;
    case 'text':
    case 'signature':
    case 'signerName':
      return null;
  }
}

/**
 * Validates every field owned by `assignee`. Auto-filled fields are skipped:
 * they are filled by the state machine at the moment of signing, so they
 * cannot be missing. Used by the UI (inline errors) and the domain (gates).
 */
export function validateFields(
  fields: FieldDefinition[],
  values: Record<string, FieldValue>,
  assignee: FieldAssignee,
): FieldError[] {
  const errors: FieldError[] = [];
  for (const field of fields) {
    if (field.assignee !== assignee || isAutoFilled(field)) continue;
    const error = validateValue(field, values[field.id]);
    if (error) errors.push({ fieldId: field.id, error });
  }
  return errors;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
