// Pure domain types. No React, no storage, no imports from other layers.

export type User = {
  id: string;
  name: string;
  email: string;
  company: string;
};

/** The source document: what is being signed. Never changes. */
export type SourceDocument = {
  id: string;
  title: string;
  pages: { imageUrl: string; width: number; height: number }[];
};

export type FieldType = 'text' | 'email' | 'phone' | 'date' | 'signature' | 'signerName';

export type FieldAssignee = 'sender' | 'recipient';

/**
 * The layout: where a field sits and what it expects.
 * Position is page index + fractions (0..1) of the page size, never pixels,
 * so the same numbers work at any rendered size.
 * Note: there is deliberately no `value` here. Values live on the envelope.
 */
export type FieldDefinition = {
  id: string;
  page: number; // 0-based page index
  x: number; // left edge, fraction of page width
  y: number; // top edge, fraction of page height
  w: number; // width, fraction of page width
  h: number; // height, fraction of page height
  type: FieldType;
  label: string;
  required: boolean;
  assignee: FieldAssignee;
  autoFillDate?: boolean; // date fields only: filled with the signing date
};

export type SignatureValue =
  | { kind: 'typed'; text: string }
  | { kind: 'drawn'; dataUrl: string };

export type FieldValue = string | SignatureValue;

export type EnvelopeStatus = 'draft' | 'sent' | 'completed';

export type Recipient = { name: string; email: string };

/** One copy of a source document being sent to one recipient. */
export type Envelope = {
  id: string;
  sourceDocId: string;
  senderId: string;
  recipient: Recipient | null; // chosen at issue time
  status: EnvelopeStatus;
  fields: FieldDefinition[]; // layout, frozen once status !== 'draft'
  values: Record<string, FieldValue>; // keyed by field.id, separate from layout
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
};
