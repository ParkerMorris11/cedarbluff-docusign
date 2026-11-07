# cedarbluff-docusign

MiniSign: a mini document-signing app (CedarBluff take-home).
**Start with [WRITEUP.md](WRITEUP.md)**: how to run, architecture, decisions, the audit-trail feature, and what's unfinished.

```bash
npm install
npm run dev   # http://localhost:5173
npm test
```

## Repo layout

| Path | What's there |
|---|---|
| `WRITEUP.md` | The write-up |
| `CLAUDE.md` | The pre-build plan (spec), kept as written |
| `src/` | The app: `domain/`, `service/`, `repository/`, `features/audit/`, `store/`, `app/`, `components/` |
| `docs/architecture.png` | Layer diagram |
| `docs/audit-trail.png` | How the audit trail records and verifies |
| `docs/plain-flow.png` | Plain-language flow of how it works |
| `docs/steps-both-users.png` | Every step for the sender and the recipient, end to end |
| `sample/master-agreement.pdf` | The original sample document |
