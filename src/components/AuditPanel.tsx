import { useState } from 'react';
import { auditLog } from '../app/services';
import { useLoad } from '../app/useLoad';
import { USERS } from '../domain/seed';
import type { Envelope, User } from '../domain/types';
import type { AuditEntry, VerifyResult } from '../features/audit/chain';

/** Plain-English wording for each stored event type. Display only: stored entries are untouched. */
function describe(e: AuditEntry): { title: string; detail?: string; tone: 'neutral' | 'sent' | 'done' } {
  const data = (e.data ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case 'envelope.created':
      return { title: 'Created the envelope', tone: 'neutral' };
    case 'layout.updated':
      return { title: 'Edited the field layout', detail: `${data.fieldCount ?? '?'} fields`, tone: 'neutral' };
    case 'values.updated': {
      const ids = Array.isArray(data.fieldIds) ? data.fieldIds.length : 0;
      return { title: 'Filled in fields', detail: `${ids} field${ids === 1 ? '' : 's'}`, tone: 'neutral' };
    }
    case 'envelope.issued': {
      const r = data.recipient as { name?: string; email?: string } | undefined;
      return { title: 'Signed and sent', detail: r ? `to ${r.name} <${r.email}>` : undefined, tone: 'sent' };
    }
    case 'envelope.completed':
      return { title: 'Signed and completed', detail: 'document locked', tone: 'done' };
    default:
      return { title: e.type, tone: 'neutral' };
  }
}

type Group = { key: string; entries: AuditEntry[] };

/** Consecutive entries of the same type by the same person are shown as one row. */
function groupEntries(entries: AuditEntry[]): Group[] {
  const groups: Group[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.entries[0].type === e.type && last.entries[0].actorId === e.actorId) last.entries.push(e);
    else groups.push({ key: String(e.seq), entries: [e] });
  }
  return groups;
}

const actorName = (id: string) => USERS.find((u) => u.id === id)?.name ?? id;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const date = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

/** Chronological, read-only log of what happened to this envelope, plus an integrity check. */
export function AuditPanel({ env, user }: { env: Envelope; user: User }) {
  // Reload whenever the envelope changes, so new events show up.
  const { data: entries } = useLoad(() => auditLog.listFor(env.id, user), [env, user.id]);
  const [result, setResult] = useState<VerifyResult | undefined>();
  const [checkedAt, setCheckedAt] = useState(0);

  async function verify() {
    setResult(await auditLog.verify(env.id, user));
    setCheckedAt(entries?.length ?? 0);
  }
  // A result only describes the entries that existed when it ran.
  const stale = result && (entries?.length ?? 0) !== checkedAt;

  return (
    <section className="audit">
      <div className="audit-head">
        <div>
          <h3>Audit trail</h3>
          <p className="hint">{entries?.length ?? 0} entries, each sealed with the fingerprint of the one before.</p>
        </div>
        <button className="secondary" onClick={verify}>Verify integrity</button>
      </div>
      {result && !stale && (
        <p className={`verify ${result.ok ? 'verify-ok' : 'verify-bad'}`}>
          {result.ok
            ? `✓ Chain intact. All ${result.count} entries verified.`
            : `✗ Tampering detected at entry #${result.brokenAtSeq}: ${result.reason}.`}
        </p>
      )}
      {entries && entries.length > 0 && <p className="audit-date">{date(entries[0].at)}</p>}
      <ol className="timeline">
        {entries && groupEntries(entries).map((g) => {
          const first = g.entries[0];
          const last = g.entries[g.entries.length - 1];
          const d = describe(last);
          const many = g.entries.length > 1;
          return (
            <li key={g.key} className={`event tone-${d.tone}`}>
              <span className="dot" aria-hidden="true" />
              <div className="event-body">
                <div className="event-line">
                  <strong>{d.title}</strong>
                  {many && <span className="count">×{g.entries.length}</span>}
                  <span className="who">{actorName(first.actorId)}</span>
                  <time>{time(first.at) === time(last.at) ? time(first.at) : `${time(first.at)} – ${time(last.at)}`}</time>
                </div>
                {d.detail && !(many && last.type === 'values.updated') && <div className="hint">{d.detail}</div>}
                <details>
                  <summary>{many ? `Entries #${first.seq}–#${last.seq}` : `Entry #${first.seq}`}</summary>
                  <ul className="hashes">
                    {g.entries.map((e) => (
                      <li key={e.seq}>
                        <span>#{e.seq} · {time(e.at)}</span>
                        <code title={`prev ${e.prevHash}`}>{e.hash.slice(0, 16)}…</code>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
