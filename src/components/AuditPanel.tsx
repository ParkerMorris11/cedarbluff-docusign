import { useState } from 'react';
import { auditLog } from '../app/services';
import { useLoad } from '../app/useLoad';
import { USERS } from '../domain/seed';
import type { Envelope, User } from '../domain/types';
import type { VerifyResult } from '../features/audit/chain';

/** Chronological, read-only log of what happened to this envelope, plus an integrity check. */
export function AuditPanel({ env, user }: { env: Envelope; user: User }) {
  // Reload whenever the envelope changes, so new events show up.
  const { data: entries } = useLoad(() => auditLog.listFor(env.id, user), [env, user.id]);
  const [result, setResult] = useState<VerifyResult | undefined>();

  return (
    <section className="audit">
      <h3>Audit trail</h3>
      <button className="secondary" onClick={async () => setResult(await auditLog.verify(env.id, user))}>
        Verify integrity
      </button>
      {result && (
        <p className={result.ok ? 'ok' : 'error'}>
          {result.ok ? `Chain intact: ${result.count} entries verified.` : `Tampering detected at entry #${result.brokenAtSeq}: ${result.reason}.`}
        </p>
      )}
      <ol>
        {entries?.map((e) => (
          <li key={e.seq}>
            <time>{new Date(e.at).toLocaleString()}</time> <strong>{e.type}</strong> by{' '}
            {USERS.find((u) => u.id === e.actorId)?.name ?? e.actorId}
            <code title={`hash ${e.hash}\nprev ${e.prevHash}`}>#{e.seq} {e.hash.slice(0, 10)}…</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
