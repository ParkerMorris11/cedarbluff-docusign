# MiniSign — Write-up

A small DocuSign-style app: a sender places fields on the Master Agreement, fills and signs
their own fields, and issues it; the recipient fills their fields and signs; the document is
then locked. Part 2 feature: a tamper-evident audit trail fed by an event bus.

## 1. How to run

Tested with Node 22.
Download the Zip and run

```bash
cd cedarbluff-docusign
npm install
npm run dev     # http://localhost:5173
npm test        # Vitest: domain, service and audit tests
npm run build   # type-check + production build
```

Walkthrough:

1. You start as **Alex Rivera** (Lone Star Fleet Services). Open the seeded draft (Continue).
2. Click **Load Master Agreement layout** (17 fields), or pick a type and click the page to place
   fields yourself. Drag to move; click a field to edit its label, type, assignee, required flag.
3. Go to **2. Fill, sign and send**, fill Signature and Title, enter `Sam Chen` /
   `sam@acmecorp.example`, and send.
4. Switch the header to **Sam Chen**, open the document, fill the customer fields, and Finish.
5. Switch to **Dana Brooks**: she sees nothing, and pasting the envelope URL shows "not found".
   (A fourth user, **Parker Morris** at a made-up "Morris Fleet Co.", `parker@morrisfleet.example`,
   can be used as a recipient instead of Sam.)
6. In the audit panel, click **Verify integrity**. To see tampering detected, edit any entry in
   `localStorage["minisign.audit.v1"]`, or any signed value in `localStorage["minisign.envelopes.v1"]`,
   in DevTools, reload, and verify again.

Data lives in `localStorage`; clear site data to reset.

## 2. Architecture overview

![Architecture](docs/architecture.png)

```
src/
  domain/            pure TypeScript: types, state machine, permissions, validation, seed data
  service/           EnvelopeService (every call takes the acting user) + EventBus
  repository/        EnvelopeRepository interface + localStorage implementation, source documents
  features/audit/    the Part 2 feature: hash chain + AuditLog (subscribes to the bus)
  store/             Zustand: the current user only
  app/               composition root (wires concrete classes together) + a small load hook
  components/        screens: list, builder, fill/sign view, page viewer, audit panel
```

Each layer only calls the one below it. `domain/` imports nothing else from the app, and
`service/` imports no React. Components never touch storage; they call the service.

**Data model** (`src/domain/types.ts`), three separate things:

| Concept | Type | Changes? |
|---|---|---|
| Source document (the blank document, stored as page images) | `SourceDocument` — id, title, page images and sizes | Never |
| Field layout (where boxes go) | `FieldDefinition[]` on the envelope — page, x/y/w/h fractions, type, label, required, assignee | Only while `draft`, only by the sender |
| Values (what people typed) | `values: Record<fieldId, FieldValue>` on the envelope | Sender's while `draft`, recipient's while `sent`, nobody's once `completed` |

An `Envelope` is one copy of a source document sent to one recipient: `sourceDocId`, `senderId`,
`recipient`, `status`, `fields`, `values`, and timestamps.

**Status** moves only `draft → sent → completed`, through one pure function,
`transition(envelope, action, actor)` in `domain/envelope.ts`. It throws a `DomainError` for the
wrong state, the wrong person, or invalid required fields.

**State and data flow.** Envelopes have one source of truth: the repository, read through the
service. Screens load what they need (`useLoad` → `envelopeService.getForUser`) and replace it with
whatever the service returns after a change. Zustand holds only "who am I acting as". Form inputs
keep a local edit buffer while typing and save on blur. That is UI state, not a second copy of the
data.

## 3. Key decisions and trade-offs

Decision 1 — Field positions are stored as fractions of the page, plus a page index.

I had three choices: pixels, PDF points, or fractions. Pixels are the easiest to write — a click gives you coordinates immediately — but they're only correct at one window size. The moment the page resizes, fields drift off their lines, and fixing that means writing resize code that runs forever and can have bugs. PDF points (the PDF's native units) map directly onto the real document, which is nice for exporting a signed copy — but points must be converted on every render and on every click, so you pay the conversion cost constantly instead of once. Fractions pay it at most twice per field, ever: one divide when a click is stored, one multiply if we ever export. Fields render as percentage CSS over a fixed aspect-ratio box, so they hold position at any size with no resize code at all. I verified this in a browser: a field sat at 0.140 / 0.505 of the page at both 1072px and 388px page widths. The trade-off: "0.45" means nothing to a PDF library, so exporting a flattened PDF later requires the page's point dimensions — which is why the document model stores each page's width and height. The conversion data is already sitting in the model.

Decision 2 — Values are stored separately from the field layout.

The natural version of this data model puts the answer inside each field. That's simpler and it's what AI tools generate by default. It's also wrong for this app: the requirements freeze things at three different moments — the layout locks when the document is sent, the sender's answers lock then too, and the recipient's answers lock at completion. Three freeze events can't exist on one glued-together object; they need layout and values to be independent. The trade-off is a cleanup responsibility the app now owns: when a field is deleted, retyped, or reassigned, its old value must be dropped too — otherwise a recipient could receive a box the sender pre-filled. A side benefit: because the layout contains no data, "save this layout as a template" is a one-line copy instead of a redaction job.

Decision 3 — Rules live in pure domain functions, and the service re-checks them on every write.

The framework-idiomatic approach is to derive permissions in the UI — disable inputs, hide buttons. In a single-user app that's correct, because the UI is the only thing that can change state. This app has two parties and rules between them, so permissions are a security property, and UI-level enforcement is only true if every code path goes through the UI. One future keyboard shortcut or test helper that bypasses the components, and the rule silently stops covering everything. So canView, canEditLayout, canEditField, transition, and validateFields are plain functions used in two places: the UI reads them to decide what to show, and EnvelopeService runs them again before every mutation. Hiding a button is a suggestion; the service check is a wall. Reads are checked too — getForUser returns "not found" for both missing and forbidden envelopes, so the service never reveals whether an ID exists. The trade-off, stated honestly: with localStorage, the service is a trust boundary against bugs, not against a user with DevTools, who can still edit the store directly. The reason this is acceptable is structural — the domain functions are pure and framework-free, so a real backend would run the identical code server-side. The seam isn't hypothetical; it's the same files.

Decision 4 — localStorage behind an async repository interface.

EnvelopeRepository has list, get, and put, all returning Promises even though localStorage is synchronous. That looks like unnecessary abstraction — one interface, one implementation, fake async. The honest case for it: a signing app with no server is a prototype, and the first thing production does is add one. Every consumer is already written against Promise<Envelope[]>, so a REST implementation changes one file at the composition root instead of every call site — the timing (sync vs. async, loading states, error paths) is what would force the rewrite, not the logic. The trade-off: it's per-browser, so the two parties are simulated in one browser with a user switcher, and two tabs hold independent caches over the same storage. Fine for this demo; both belong in "unfinished."

Decision 5 — Pre-rendered page images instead of pdf.js.

Rendering the real PDF in-browser (react-pdf) supports any PDF and selectable text, but it runs in a web worker, needs bundler configuration, and fails at runtime — potentially on the reviewer's machine, not mine. Inside a 90-minute box, an unscheduled setup rabbit hole is 17% of the budget. Two pre-rendered PNGs at 150 DPI are guaranteed to work everywhere. The trade-off: the app can't ingest a new document — the source document is effectively hardcoded. That's not a limitation of the code so much as a feature that doesn't exist yet, and the README doesn't ask for it. The seam that makes this cheap to reverse: the viewer's only contract is pages[].imageUrl, so swapping in a real PDF renderer later changes one component and nothing above it.




**Guidance added after the core worked.** The spec said not to add unlisted features. After the
core flow passed, I chose to add a few things that make the two-person flow easier to follow: a
"what you need to fill in" checklist, a four-stage progress bar, box colours from each viewer's point
of view (yours to do, yours done, filled automatically, theirs), and a cleaner visual design. None of
them adds a rule. The checklist (`domain/checklist.ts`) and progress bar (`domain/progress.ts`) are pure
domain functions built on the same `validateFields` rules that gate send and finish, and both are
*derived* from the envelope each render, never stored, so they can't disagree with it. A test checks
that the checklist and the send/finish gate agree.

Libraries: **React Router** (routes), **Zustand** (current user; tiny, no provider), **Vitest**
(tests). No PDF, UI kit, or drag-and-drop library; dragging is plain pointer events.

**How this maps to the evaluation:**

| Area | Where to look |
|---|---|
| Data modeling | Decision 2 and the data model table: source document, layout and values are separate types; `transition()` is the only way status changes |
| Field positioning | Decision 1: page index plus fractions, percentage CSS, checked at two widths |
| State and data flow | Section 2: the repository is the one source of truth; Zustand holds only the current user; checklist and progress are derived, not stored |
| Feature | Section 4: the audit log subscribes to an event bus; the core never imports it |
| Correctness | Decision 3: the same domain rules run in the UI and again in the service on every call; tests cover wrong actor, locked states, validation and hidden envelopes |
| Communication | This document, including what's unfinished |

## 4. Feature: audit trail on an event bus

![Audit trail](docs/audit-trail.png)

**What it does.** Every change (created, layout updated, values updated, issued, completed) is
recorded per envelope with who and when. Each entry stores `prevHash` (the previous entry's hash) and
`hash = sha256(prevHash + canonical entry content)` using Web Crypto. **Verify integrity** walks the
chain and checks both that each entry's content still matches its own hash and that each `prevHash`
matches the entry before it. Editing or reordering any entry, or removing one from the middle,
breaks the chain at that point. Removing entries from the *end* is not caught: what's left is still a
valid, shorter chain (see the honest limit below).

Each entry also seals a **fingerprint of the document** as it was saved (status, recipient, layout and
every value). Verify compares the newest entry's fingerprint with the document as it is now, so a
signed value or status edited directly in storage is caught too. The fingerprint is taken by the audit
module after the save, from the repository; the core still doesn't know the audit trail exists.

**Why this feature.** In a signing product, the history is the evidence. `status` only says where a
document is now, and the audit trail says how it got there. It's small, and it exercises the
architecture: it should be addable without touching the core.

**How it plugs in.** `EnvelopeService` emits events on a tiny `EventBus` after each successful save.
`features/audit/AuditLog` subscribes in the composition root. The service never imports the audit
code. A notifications inbox, for example, would be another subscriber, with no core change.

Details that matter:
- **Writes are queued one at a time.** Hashing is async, so two events fired back to back could both
  read the same "previous" entry and fork the chain. There's a test that fires overlapping changes and
  checks the sequence stays 0, 1, 2, 3 and verifies.
- **Events fire only after the save succeeds**, so the log never records a change that didn't happen.
  A failing listener is caught so it can't break the core action.
- **Reading the trail uses the same access rule as the envelope.**
- **The panel groups consecutive same-person, same-type entries** (e.g. "Filled in fields ×12") and
  uses plain-English labels. This is display only: every entry is still stored and verified, and each
  group expands to show its entry numbers and hashes.

**Honest limit.** The chain makes tampering *detectable*, not impossible: someone who controls
localStorage can rewrite every entry and recompute every hash, or delete the newest entries *and*
roll the document back to match an older one. Both are fixed the same way: a real system would anchor the latest hash (and entry count) somewhere
the attacker can't write (a server, a signature with a private key, or the completion
email sent to both parties).

## 5. How I used AI

<!-- Parker: this section must describe only what you actually did. Read it, correct anything that
     isn't accurate, and rewrite it in your own words before submitting. -->

- **Planning I used Perplexity computer to intake the ReadMe context from the email and create a SPEC.MD with a list of notes of logic I chose from myself like the audit trail. I used my EGM skill (Elephant Goldfish Model) to review the Spec.MD and find any missing holes we need to resolve before passing this off to Claude to build.
<img width="1999" height="1268" alt="image" src="https://github.com/user-attachments/assets/79d85887-40dc-42d6-a2ac-b6dfd61adf32" />


- **Build:** I used Claude Code to write the code from that spec.MD file.
  
- **Where I changed what the AI gave me:** Claude Code reviewed the Perplexity spec before building and
  found five problems. I accepted all five (listed at the bottom of `CLAUDE.md`):
  1. The spec cached envelopes in Zustand as well as localStorage, which is two sources of truth.
     Zustand now holds only the current user.
  2. The spec only auto-filled the recipient's name and date on complete, so the sender's Print Name
     and Date would never be filled. They're now auto-filled on issue.
  3. The spec filtered only the list by user, so typing an envelope URL would open anyone's document.
     Single reads are now checked too.
  4. Async hashing could fork the audit chain, so appends are now queued.
  5. React Router was missing from the stack.

- **Review:** I used Claude to review the grading requirements and identify any gaps to resolve any missing parts and focus on creating tech stack diagrams to show how this works!
   

## 6. What's unfinished

- **Drawn signatures.** Typed only. The data model already has `{ kind: 'drawn', dataUrl }` and the
  viewer renders it, but there's no canvas input.
- **Field resizing.** Fields use a default size per type. You can move them but not resize them.
- **No "viewed" event.** The audit trail records changes, not views.
- **Audit write can fail after the action.** The core change is saved first, then the audit appends.
  If the append failed, the log would be missing an entry. A real system would write both in one
  transaction (or an outbox).
- **Chatty log storage.** Every field edit is stored as its own `values.updated` entry. The panel
  groups them for reading, but storage isn't batched.
- **Recipients must be one of the seeded users to sign.** Matching is by email, and there are no
  invitations or new accounts.
- **Security is simulated.** The rules run in the browser, so anyone with DevTools can edit
  localStorage. That's acceptable for a demo without a backend, and the domain functions are ready to
  run server-side.
- **Tests cover the domain, service access, checklist, progress and audit chain** (32 tests). There are no component or
  end-to-end tests in the repo; the full flow was checked with a scripted browser run that isn't
  committed.
- **One source document.** The "pick a document" step exists but only the Master Agreement is
  registered.
