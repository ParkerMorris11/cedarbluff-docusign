import type { FieldAssignee, FieldDefinition, FieldValue } from './types';
import { isAutoFilled, validateValue, valueToText } from './validation';

export type ChecklistItem = {
  fieldId: string;
  label: string;
  page: number;
  required: boolean;
  /** Has an acceptable value. An empty optional field is not done, but it isn't outstanding either. */
  done: boolean;
  /** Nothing has been typed yet. */
  empty: boolean;
  /** What is stopping this field from passing validation, if anything. */
  error: string | null;
};

export type Checklist = {
  /** The fields this person types into, in reading order. */
  items: ChecklistItem[];
  /** The fields the system fills in for this person when they submit. */
  autoFilled: FieldDefinition[];
  /** The first item still blocking submission. */
  next: ChecklistItem | undefined;
  /** Items blocking submission. Uses the same validator that gates issue and complete. */
  remaining: number;
};

/** Works out what one party still has to fill in, from the same rules the state machine enforces. */
export function buildChecklist(
  fields: FieldDefinition[],
  values: Record<string, FieldValue>,
  assignee: FieldAssignee,
): Checklist {
  const mine = fields
    .filter((f) => f.assignee === assignee)
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

  const items = mine.filter((f) => !isAutoFilled(f)).map((f): ChecklistItem => {
    const error = validateValue(f, values[f.id]);
    const empty = valueToText(values[f.id]).trim() === '';
    return { fieldId: f.id, label: f.label, page: f.page, required: f.required, done: !error && !empty, empty, error };
  });
  const blocking = items.filter((i) => i.error);

  return { items, autoFilled: mine.filter(isAutoFilled), next: blocking[0], remaining: blocking.length };
}
