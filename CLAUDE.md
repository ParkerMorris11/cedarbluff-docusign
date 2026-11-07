# CLAUDE.md — Mini Document Signing App

> Planning spec written before the 90-minute build (drafted with Perplexity Computer).
> See "Changes agreed after review" at the bottom for what changed before building.

You are building a take-home project for an interview: a simplified DocuSign in React.
The evaluator cares about **decisions, structure, and correctness** — not visual design,
pixel-perfect placement, or test coverage. Do not spend time styling beyond basic
readability. Do not add features not listed here.

**Hard rules:**
- Total build time is time-boxed to ~90 minutes. Prefer boring, working code over
  clever code. If a phase is running long, cut scope per the "cut list" below.
- No real backend, no auth, no email. Fake everything locally.
- Every rule below must be **enforced in code** (domain/service layers), not just
  hidden in the UI. The evaluator will test that locked documents are really locked
  and users only see their own documents.

## Stack

- Vite + React + TypeScript (strict mode).
- Zustand for the current-user store (small, no boilerplate).
- No PDF library. The sample document is already pre-rendered as two page images
  at 150 DPI (1275×1650, aspect ratio 0.7727): `assets/page-1.png`,
  `assets/page-2.png` in the repo root. Copy them into `src/assets/` and commit.
  Rationale: avoids pdf.js worker setup cost; the document model keeps `imageUrl`
  so swapping in pdf.js later requires no changes to anything above the viewer.
  Also copy the original PDF to `sample/master-agreement.pdf` for reference.
- `signature_pad` only if drawn signatures are reached (see cut list); default to
  typed signatures rendered in a script font (Google Fonts, e.g. "Caveat").
- Vitest for domain-layer tests only (a handful).
- No UI component library. Plain CSS (one stylesheet is fine).

## Architecture

Four layers, each depending only on the layer below:

```
src/
  domain/        pure TypeScript: types, state machine, permissions, validation
  service/       envelope service (takes acting user, enforces rules, emits events)
  repository/    EnvelopeRepository interface + localStorage implementation
  store/         Zustand: current user, envelopes cache
  components/    pages, document viewer, field editor, etc.
  assets/        page-1.png, page-2.png
```

- `domain/` must not import React or anything from the other layers.
- `service/` must not import React.
- Components never touch `localStorage` or mutate envelopes directly — always
  through the service.

## Domain model

Three separated concepts (this separation is the single most-graded thing):

```ts
type SourceDocument = {
  id: string;
  title: string;
  pages: { imageUrl: string; width: number; height: number }[];
};

type FieldType = 'text' | 'email' | 'phone' | 'date' | 'signature' | 'signerName';

type FieldAssignee = 'sender' | 'recipient';

type FieldDefinition = {
  id: string;
  page: number;            // 0-based page index
  x: number; y: number;    // fractions of page width/height, 0..1
  w: number; h: number;    // fractions of page width/height
  type: FieldType;
  label: string;
  required: boolean;
  assignee: FieldAssignee;
  autoFillDate?: boolean;  // for date fields: fill with signing date
};

type SignatureValue =
  | { kind: 'typed'; text: string }
  | { kind: 'drawn'; dataUrl: string };

type EnvelopeStatus = 'draft' | 'sent' | 'completed';

type Envelope = {
  id: string;
  sourceDocId: string;
  senderId: string;
  recipient: { name: string; email: string };
  status: EnvelopeStatus;
  fields: FieldDefinition[];          // layout — immutable once status !== 'draft'
  values: Record<string, string | SignatureValue>;  // keyed by field.id,
                                                    // separate from layout
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
};
```

**Do NOT put `value` on `FieldDefinition`.** Values and layout are separate so that
"lock the layout" and "edit values" are separate permissions. If you (the AI)
generate a model with values embedded in fields, refactor it.

Users: seed 3 users in `domain/seed.ts`, e.g. `alex@lonestarfleet.example` (sender,
"Lone Star Fleet Services"), `sam@acmecorp.example`, `dana@globex.example`
(recipients). Match recipients to users by email.

## Field positioning

- Positions are fractions of page dimensions + page index. Never pixels.
- Render each page in a container with `aspect-ratio: pageWidth / pageHeight`;
  fields are `position: absolute` with percentage left/top/width/height. This makes
  fields survive any resize with no JS resize handling.
- Write this decision and the pdf-points trade-off into WRITEUP.md.

## State machine and permissions

Implement in `domain/envelope.ts` as pure functions:

```ts
// draft -> sent -> completed
transition(envelope, action: 'issue' | 'complete', actor: User): Envelope
```

- `issue` (sender only, status must be `draft`): allowed only when every
  sender-assigned required field has a valid value. Sets status `sent`, `sentAt`.
- `complete` (recipient only, status must be `sent`): allowed only when every
  recipient-assigned required field is valid. Before completing, auto-fill the
  recipient's `date` fields with `autoFillDate` and all their `signerName` fields
  from the user's name. Sets status `completed`, `completedAt`.

```ts
canEditField(envelope: Envelope, field: FieldDefinition, user: User): boolean
canEditLayout(envelope: Envelope, user: User): boolean  // draft + sender only
```

Single source of truth for permissions: use these functions in the UI **and**
re-check them in the service on every mutation. UI hiding is not enforcement.

Locking rules:
- Status `sent`: layout frozen; sender values frozen; recipient may edit only
  their own fields.
- Status `completed`: everything frozen.

## Validation

`domain/validation.ts`, one pure validator per type:
- `email`: simple regex, must be non-empty if required.
- `phone`: strip non-digits, require >= 10 digits.
- `text`/`date`: non-empty if required.
- `signature`: non-empty typed text (or drawn dataUrl).
- `signerName`: auto-filled; treat as satisfied if the user has a name.

`validateFields(fields, values, assignee)` returns a list of
`{ fieldId, error }` — used by both the UI (inline errors) and the service
(gate `issue`/`complete`).

## Repository + service

```ts
interface EnvelopeRepository {
  list(): Promise<Envelope[]>;
  get(id: string): Promise<Envelope | undefined>;
  put(env: Envelope): Promise<void>;
}
```

- `localStorage` implementation, keyed under `minisign.envelopes.v1`. Methods are
  async on purpose (looks like a real API; swapping backends later is trivial).
- `service/envelopeService.ts` — every method takes the acting user:
  - `listForUser(userId)` — only envelopes where senderId === userId OR
    recipient.email === user.email.
  - `createEnvelope(senderId)` — new draft with no fields.
  - `updateLayout(id, fields, actor)` — throws unless `canEditLayout`.
  - `updateValues(id, values, actor)` — throws unless every touched field passes
    `canEditField`.
  - `issue(id, recipient, actor)`, `complete(id, actor)`.
- Seed one draft envelope on first run so the app isn't empty.

## Feature: audit trail + event bus

Core services emit domain events; the audit module subscribes. Core code must not
know the audit trail exists.

```ts
type EnvelopeEvent =
  | { type: 'envelope.created'; envelopeId: string; at: string; actor: string }
  | { type: 'envelope.issued'; ... }
  | { type: 'field.updated'; ... }
  | { type: 'envelope.completed'; ... };
```

- Tiny event bus in `service/eventBus.ts` (subscribe/emit, no library).
- `service/audit.ts` subscribes, appends entries to the repository:
  `{ id, envelopeId, at, actor, event, prevHash, hash }` where
  `hash = sha256(prevHash + JSON.stringify(entry))` via Web Crypto (`crypto.subtle`).
- UI: an "Audit trail" panel per envelope (chronological log) plus a "Verify
  integrity" button that recomputes the chain and reports tamper/no-tamper.
- Store audit entries in localStorage under `minisign.audit.v1`.

## Screens (keep them plain)

1. **Document list** (`/`): user's envelopes with status badges; "New envelope".
2. **Builder** (`/envelope/:id/edit`): page viewer + field placement. Toolbar of
   field types; click a page to drop a field at default size; click a field to
   edit label/required/assignee/type in a side panel; delete field; drag to move
   (plain pointer events, no dnd library). Button "Load Master Agreement layout"
   seeds the 17 fields below (this makes the demo reliable).
   Sender fills/signs their own fields here, enters recipient name+email,
   clicks Issue.
3. **Sign view** (`/envelope/:id/sign`): same page viewer; sender values
   read-only; recipient edits their fields; Finish button gated by validation.
4. **Audit panel**: on the envelope detail, per the feature above.

Header: user switcher (the 3 seeded users) using the Zustand store.

### Target layout (seed data for "Load Master Agreement layout")

Coordinates below were measured from the PDF text layer (label rects → fractions
of the 612×792pt page). `x, y, w, h` are fractions; each box sits to the right of
its printed label. Page is 0-based.

Page 0 — all assignee `recipient`, all `required: true` unless noted:

| Label | Type | x | y | w | h |
|---|---|---|---|---|---|
| Customer Legal Name | text | 0.20 | 0.145 | 0.70 | 0.018 |
| Purchasing Agent | text | 0.18 | 0.170 | 0.23 | 0.018 |
| Email | email | 0.455 | 0.170 | 0.45 | 0.018 |
| Address | text | 0.135 | 0.195 | 0.27 | 0.018 |
| City | text | 0.445 | 0.195 | 0.21 | 0.018 |
| State | text | 0.70 | 0.195 | 0.085 | 0.018 |
| Zip | text | 0.815 | 0.195 | 0.09 | 0.018 |
| Phone | phone | 0.13 | 0.220 | 0.28 | 0.018 |
| Fax | phone | 0.445 | 0.220 | 0.45 | 0.018 |

Page 1 — sender group (left column, Lone Star side), required: true:

| Label | Type | x | y | w | h | notes |
|---|---|---|---|---|---|---|
| Signature | signature | 0.14 | 0.494 | 0.21 | 0.02 | |
| Print Name | signerName | 0.15 | 0.537 | 0.20 | 0.018 | |
| Date | date | 0.39 | 0.537 | 0.11 | 0.018 | autoFillDate |
| Title | text | 0.15 | 0.565 | 0.20 | 0.018 | |

Page 1 — recipient group (right column, Customer side), same four rows:

| Label | Type | x | y | w | h | notes |
|---|---|---|---|---|---|---|
| Signature | signature | 0.555 | 0.494 | 0.35 | 0.02 | |
| Print Name | signerName | 0.565 | 0.537 | 0.20 | 0.018 | |
| Date | date | 0.80 | 0.537 | 0.10 | 0.018 | autoFillDate |
| Title | text | 0.565 | 0.565 | 0.33 | 0.018 | |

## Tests (Vitest, domain only, ~6)

- `transition`: draft -> sent (valid), rejects issue when sender fields invalid,
  rejects wrong actor, sent -> completed, rejects complete when recipient fields
  invalid, completed is terminal.
- `canEditField`: recipient can't edit sender fields; nothing editable when
  completed.
- Validation: email/phone/required cases.
- Audit: chain verifies; tampered entry fails verification.

## Build order (time-boxed)

1. (10 min) Scaffold, assets, domain types.
2. (15 min) Domain: state machine, permissions, validators, audit hashing + tests.
3. (10 min) Repository, service, seed, user switcher.
4. (20 min) Builder screen: viewer, placement, side panel, seed layout button.
5. (15 min) Sign view, issue/complete flows, typed signature rendering.
6. (10 min) Audit trail UI + verify button.
7. (10 min) WRITEUP.md + full-flow smoke test (switch users, issue, sign, verify).

## Cut list (in order, if time runs out)

1. Drawn signatures (typed only is fine).
2. Drag-to-move fields (click-to-place + re-place is fine).
3. Field resizing (default size only).
4. Inline validation errors (block the action with a message instead).
5. Tests beyond the transition + canEditField ones.

## WRITEUP.md (must include, in this order)

1. How to run (npm install / npm run dev / npm test).
2. Architecture overview: the four layers, data model, state flow (diagram optional).
3. 3–5 key decisions with trade-offs, including fractional field positioning
   (and the pdf-points trade-off) and why values are separate from layout.
4. The feature: why audit trail + event bus, how it plugs in without the core
   knowing about it.
5. How AI was used, including at least one place where the AI's suggestion was
   rejected or changed (e.g. values embedded in field objects, or any library it
   tried to add that we cut).
6. What's unfinished — be honest.

Also note in the write-up: ~20 minutes of planning (this spec) happened before
the 90-minute time box started.

## Changes agreed after review (before the build started)

1. Zustand holds the current user only. No envelopes cache: screens read envelopes
   through the service, so there is one source of truth.
2. The sender's Print Name and auto-date fields are auto-filled on `issue`
   (the spec only auto-filled the recipient's on `complete`). Auto-filled fields
   are skipped by validation because the state machine fills them.
3. Access is checked on single reads (`getForUser`), not just `listForUser`, so
   typing an envelope URL can't open someone else's document.
4. Audit appends go through a one-at-a-time queue, because async hashing could
   otherwise let two back-to-back events read the same previous hash and fork the chain.
5. `react-router` added for routes.
