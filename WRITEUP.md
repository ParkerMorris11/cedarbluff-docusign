# MiniSign write-up

A small DocuSign-style app. A sender places fields on the Master Agreement, fills and signs their own fields, and issues it. The recipient fills and signs theirs, and the document locks. My Part 2 feature is a tamper-evident audit trail fed by an event bus.

Build time: about 85 minutes, inside the 90-minute limit.

## 1. How to run

Tested with Node 22.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 32 Vitest tests: domain, service, audit
npm run build   # type-check + production build
```

Quick demo: as Alex Rivera, open the seeded draft, click **Load Master Agreement layout**, then fill and send to `sam@acmecorp.example`. Switch the header to Sam Chen, fill the customer fields, and click **Finish and sign**. Switch to Dana Brooks: she sees nothing, and the envelope URL says "not found." Data lives in `localStorage`. Clear site data to reset.

Libraries: React Router (one URL per screen), Zustand (current user only), Vitest (tests). No PDF, UI kit, or drag-and-drop library. The pages are two pre-rendered PNGs, which the README allows and which avoided pdf.js setup.

## 2. Architecture

```text
src/
  domain/          pure rules: types, state machine, permissions, validation
  service/         EnvelopeService (takes the acting user) + EventBus
  repository/      EnvelopeRepository interface + localStorage implementation
  features/audit/  the Part 2 feature, subscribed to the bus
  store/           Zustand: current user only
  app/             composition root that wires it together
  components/      screens
```

Each layer depends only on the ones below it. Components never touch storage.

**Data model** (`domain/types.ts`) separates three things:

| Concept | Contents | Can change |
| --- | --- | --- |
| Source document | Page images and sizes | Never |
| Field layout | Page, x/y/w/h fractions, type, label, required, assignee | Draft only, sender only |
| Values | Keyed by field ID | Sender while draft, recipient while sent, nobody once completed |

Status moves `draft → sent → completed` only through `transition(envelope, action, actor)`, which throws on the wrong state, the wrong person, or invalid required fields.

**State:** the repository is the one source of envelope data. Zustand holds only who you are acting as. The checklist and progress bar are calculated from the envelope, never stored.

## 3. Key decisions

### 1. Store field positions as page fractions

![Fractions, not pixels: field positions stay aligned at different page sizes.](docs/decisions/1-positions.svg)

- **Chose:** each field stores a page index plus `x`, `y`, `w`, `h` as fractions from 0 to 1. The page keeps its aspect ratio, and fields are placed with CSS percentages.
- **Why:** fields stay in the right place at any window size, with no resize code.
- **Traded off:** a PDF export would need to convert fractions to PDF points. The page sizes are stored so that conversion is possible.

### 2. Keep the field layout separate from the values

![Three separate pieces: source document, field layout, and entered values.](docs/decisions/2-layout-vs-values.svg)

- **Chose:** three separate pieces. The source document (page images), the layout (`FieldDefinition[]`), and the values (keyed by field ID).
- **Why:** "lock the layout" and "edit your own boxes" become separate rules that are easy to enforce and test. A layout could also become a template without stripping anyone's answers.
- **Traded off:** when a field is deleted, retyped, or reassigned, its old value must be dropped by hand. `applyLayout` does that.

### 3. Check permissions in the service, not only the UI

![The door and the lock: UI controls and service permission checks.](docs/decisions/3-permissions.svg)

- **Chose:** the same domain functions (`canView`, `canEditLayout`, `canEditField`) decide what the screen shows, and the service checks them again on every call, including single reads.
- **Why:** hiding a button is not enforcement. A pasted envelope URL says "not found," and a locked document stays locked.
- **Traded off:** it all runs in the browser, so someone with DevTools can still edit storage. A real backend would enforce the same rules on the server.

### 4. Put localStorage behind an async repository

![One helper for saving: screens call the service, which uses an async repository.](docs/decisions/4-repository.svg)

- **Chose:** an `EnvelopeRepository` interface (`list`, `get`, `put`) that returns promises, with a localStorage implementation.
- **Why:** a server-backed repository could replace it at the composition root without changing the screens.
- **Traded off:** extra abstraction for a small demo. Data stays in one browser, so the two users are simulated with a user switcher.

### 5. Zustand holds only the current user

![One source of truth: Zustand holds the current user, while envelopes are loaded through the service and repository.](docs/decisions/5-one-source-of-truth.svg)

- **Chose:** the repository is the only source of envelope data. Zustand stores who you are acting as and nothing else.
- **Why:** no second envelope cache to keep in sync after a save or a user switch.
- **Traded off:** screens reload from the service after each change, and two open tabs can show stale data until they reload.

## 4. Feature: audit trail on an event bus

![Tamper-evident audit trail: service events feed an audit subscriber, and hashes link consecutive entries.](docs/decisions/6-audit-trail.svg)

**What it does.** Every change (created, layout updated, values updated, issued, completed) is logged with who and when. Each entry stores the previous entry's hash and its own: `sha256(prevHash + entry)`. Each entry also seals a fingerprint of the saved document. **Verify integrity** re-checks the chain and compares the newest fingerprint with the document, so an edited entry or an edited signed value is caught.

**Why.** In a signing app, status says where a document is. The audit trail says how it got there. It also tests the architecture: can a feature plug in without the core knowing about it?

**How it plugs in.** `EnvelopeService` emits events on a small `EventBus` after each successful save. `AuditLog` subscribes in the composition root. The service never imports audit code, so notifications would just be another subscriber. Appends are queued one at a time, because async hashing could otherwise fork the chain.

**Limit.** It is tamper-evident, not tamper-proof. Someone who controls `localStorage` can rewrite every hash, or delete the newest entries and roll the document back. Catching that needs the latest hash stored somewhere the user can't write, like a server.

## 5. How I used AI

- **Planning:** Perplexity Computer turned the README into a spec, `SPEC.md`, kept in the repo as `CLAUDE.md`. It includes choices I made myself, such as the audit trail. I reviewed it for gaps with my EGM (Elephant Goldfish Model) skill.
- **Build:** Claude Code wrote the code from that spec.
- **Review:** Claude checked the work against the grading table and made the diagrams in `docs/`.

**Where I changed what the AI gave me**

- **The spec.** Before building, I had Claude Code review the spec against the README. It flagged five differences, and I went through each one myself before changing the plan. Zustand held a second copy of envelopes. The sender's name and date were never auto-filled. A typed envelope URL could open anyone's document. Async hashing could fork the audit chain. React Router was missing. They're listed at the bottom of `CLAUDE.md`.
- **The signing date.** The first build filled auto-date fields with the UTC date. In Utah in November, UTC is the next day after 5 PM, so a Friday-evening signature was dated Saturday. The first test used a noon timestamp, so it never caught this. I changed it to the signer's local date (`localDate` in `domain/envelope.ts`) and added a late-evening test.

## 6. What's unfinished

- Typed signatures only. The model supports drawn ones, but there's no canvas input.
- Fields can move but not resize.
- No "viewed" event in the audit trail.
- The audit write isn't transactional with the save. If it fails after a save, the log misses that entry.
- Recipients must be seeded users. There are no invitations.
- Security is simulated in the browser.
- Open tabs can go stale until they reload.
- 32 tests cover the domain, service, and audit chain. There are no component or end-to-end tests.
- Only the Master Agreement is registered as a source document.

A longer write-up is in [`docs/WRITEUP-full.md`](docs/WRITEUP-full.md).
