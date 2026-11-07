import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { envelopeService } from '../app/services';
import { useLoad } from '../app/useLoad';
import { isSender } from '../domain/envelope';
import { USERS } from '../domain/seed';
import type { Envelope, User } from '../domain/types';
import { getSourceDocument, SOURCE_DOCUMENTS } from '../repository/sourceDocuments';
import { useCurrentUser } from '../store/currentUser';
import { DocumentThumbnail } from './DocumentThumbnail';
import { EnvelopeProgressBar } from './EnvelopeProgressBar';
import { StatusBadge } from './StatusBadge';

type Turn = 'you' | 'others' | 'done';

const SECTIONS: { turn: Turn; title: string }[] = [
  { turn: 'you', title: 'Waiting on you' },
  { turn: 'others', title: 'Waiting on others' },
  { turn: 'done', title: 'Completed' },
];

function turnOf(env: Envelope, user: User): Turn {
  if (env.status === 'completed') return 'done';
  const mine = isSender(env, user);
  return (mine && env.status === 'draft') || (!mine && env.status === 'sent') ? 'you' : 'others';
}

function summarize(counts: Record<Turn, number>): string {
  return [
    counts.you && `${counts.you} waiting on you`,
    counts.others && `${counts.others} waiting on others`,
    counts.done && `${counts.done} completed`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function DocumentCard({ env, user, index }: { env: Envelope; user: User; index: number }) {
  const doc = getSourceDocument(env.sourceDocId);
  const title = doc?.title ?? env.sourceDocId;
  const mine = isSender(env, user);
  const needsMe = turnOf(env, user) === 'you';
  const action = needsMe ? (mine ? 'Continue' : 'Sign now') : 'View';
  const sender = USERS.find((u) => u.id === env.senderId);
  const withWhom = mine
    ? env.recipient ? `To ${env.recipient.name}` : 'No recipient yet'
    : `From ${sender?.name ?? env.senderId}`;
  const updated = new Date(env.completedAt ?? env.sentAt ?? env.createdAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  return (
    <article className="doc-card" style={{ '--i': index } as CSSProperties}>
      <div className="doc-stage">
        {doc && <DocumentThumbnail doc={doc} fields={env.fields} values={env.values} />}
      </div>
      <div className="doc-body">
        <div className="doc-meta"><StatusBadge status={env.status} /><time>{updated}</time></div>
        <h3>{title}</h3>
        <p className="doc-with">{withWhom}</p>
        <EnvelopeProgressBar env={env} compact />
        <Link
          className={needsMe ? 'btn-link doc-action primary' : 'btn-link doc-action'}
          to={`/envelope/${env.id}`}
          aria-label={`${action}: ${title}, ${withWhom}`}
        >
          {needsMe ? `${action} →` : action}
        </Link>
      </div>
    </article>
  );
}

export function DocumentList() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [docId, setDocId] = useState(SOURCE_DOCUMENTS[0].id);
  const { data: envelopes, error } = useLoad(() => envelopeService.listForUser(user), [user.id]);

  async function create() {
    const env = await envelopeService.createEnvelope(docId, user);
    navigate(`/envelope/${env.id}`);
  }

  const groups = SECTIONS.map((s) => ({ ...s, items: (envelopes ?? []).filter((e) => turnOf(e, user) === s.turn) }));
  const counts = { you: groups[0].items.length, others: groups[1].items.length, done: groups[2].items.length };

  return (
    <main className="list">
      <div className="list-head">
        <div>
          <h1>Your documents</h1>
          {envelopes && envelopes.length > 0 && <p className="list-summary">{summarize(counts)}</p>}
        </div>
        <div className="list-new">
          <label>
            <span className="visually-hidden">Document to send</span>
            <select value={docId} onChange={(e) => setDocId(e.target.value)}>
              {SOURCE_DOCUMENTS.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={create}>+ New envelope</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {envelopes && envelopes.length === 0 && (
        <section className="list-empty">
          <DocumentThumbnail doc={SOURCE_DOCUMENTS[0]} fields={[]} values={{}} />
          <div>
            <h2>Nothing to sign yet</h2>
            <p>Documents you send or receive will appear here. Start one with New envelope.</p>
          </div>
        </section>
      )}

      {groups.filter((g) => g.items.length > 0).map((g) => (
        <section key={g.turn} className="doc-section">
          <h2>{g.title} <span className="doc-count">{g.items.length}</span></h2>
          <div className="doc-grid">
            {g.items.map((env, i) => <DocumentCard key={env.id} env={env} user={user} index={i} />)}
          </div>
        </section>
      ))}
    </main>
  );
}
