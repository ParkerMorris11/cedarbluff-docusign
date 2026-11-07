import type { FieldDefinition, FieldValue } from '../domain/types';
import { valueToText } from '../domain/validation';

/** Read-only display of a filled-in value. */
export function FieldValueView({ field, value }: { field: FieldDefinition; value: FieldValue | undefined }) {
  const text = valueToText(value);
  if (!text) return <span className="placeholder">{field.label}</span>;
  if (field.type === 'signature') {
    if (typeof value === 'object' && value.kind === 'drawn') return <img src={value.dataUrl} alt="signature" />;
    return <span className="script">{text}</span>;
  }
  return <span>{text}</span>;
}
