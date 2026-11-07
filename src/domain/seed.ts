import type { FieldDefinition, User } from './types';

export const USERS: User[] = [
  { id: 'u-alex', name: 'Alex Rivera', email: 'alex@lonestarfleet.example', company: 'Lone Star Fleet Services' },
  { id: 'u-sam', name: 'Sam Chen', email: 'sam@acmecorp.example', company: 'Acme Corp' },
  { id: 'u-dana', name: 'Dana Brooks', email: 'dana@globex.example', company: 'Globex' },
];

export const MASTER_AGREEMENT_ID = 'master-agreement';

type Row = [label: string, type: FieldDefinition['type'], x: number, y: number, w: number, h: number];

function rows(page: number, assignee: FieldDefinition['assignee'], prefix: string, list: Row[]): FieldDefinition[] {
  return list.map(([label, type, x, y, w, h]) => ({
    id: `${prefix}-${label.toLowerCase().replace(/\s+/g, '-')}`,
    page,
    x, y, w, h,
    type,
    label,
    required: label !== 'Fax',
    assignee,
    ...(type === 'date' ? { autoFillDate: true } : {}),
  }));
}

/**
 * The standard Master Agreement layout (17 fields). Positions are fractions of
 * the page, measured from the PDF text layer and checked against the page images.
 */
export function masterAgreementLayout(): FieldDefinition[] {
  return [
    ...rows(0, 'recipient', 'cust', [
      ['Customer Legal Name', 'text', 0.2, 0.15, 0.7, 0.018],
      ['Purchasing Agent', 'text', 0.18, 0.175, 0.23, 0.018],
      ['Email', 'email', 0.455, 0.175, 0.45, 0.018],
      ['Address', 'text', 0.135, 0.2, 0.27, 0.018],
      ['City', 'text', 0.445, 0.2, 0.21, 0.018],
      ['State', 'text', 0.7, 0.2, 0.085, 0.018],
      ['Zip', 'text', 0.815, 0.2, 0.09, 0.018],
      ['Phone', 'phone', 0.13, 0.225, 0.28, 0.018],
      ['Fax', 'phone', 0.445, 0.225, 0.45, 0.018],
    ]),
    ...rows(1, 'sender', 'lsfs', [
      ['Signature', 'signature', 0.14, 0.505, 0.33, 0.028],
      ['Print Name', 'signerName', 0.15, 0.542, 0.2, 0.018],
      ['Date', 'date', 0.39, 0.542, 0.11, 0.018],
      ['Title', 'text', 0.175, 0.57, 0.3, 0.018],
    ]),
    ...rows(1, 'recipient', 'cust', [
      ['Signature', 'signature', 0.555, 0.505, 0.35, 0.028],
      ['Print Name', 'signerName', 0.565, 0.542, 0.2, 0.018],
      ['Date', 'date', 0.8, 0.542, 0.1, 0.018],
      ['Title', 'text', 0.585, 0.57, 0.31, 0.018],
    ]),
  ];
}
