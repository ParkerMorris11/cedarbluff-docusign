import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { envelopeService } from '../app/services';
import { useLoad } from '../app/useLoad';
import { isSender } from '../domain/envelope';
import { USERS } from '../domain/seed';
import type { Envelope, User } from '../domain/types';
import { getSourceDocument, SOURCE_DOCUMENTS } from '../repository/sourceDocuments';
import { useCurrentUser } from '../store/currentUser';
import { DocThumb } from './DocThumb';
import { StatusBadge, StatusTrack } from './StatusBadge';

/** Your turn: you're the sender of a draft, or the recipient of something sent. */
function needsMe(env: Envelope, user: User) {
  return isSender(env, user) ? env.status === 'draft' : env.status === 'sent';
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

  const all = envelopes ?? [];
  const sections = [
    { key: 'action', title: 'Needs your action', items: all.filter((e) => needsMe(e, user)) },
    { key: 'waiting', title: 'Waiting on someone else', items: all.filter((e) => !needsMe(e, user) && e.status !== 'completed') },
    { key: 'done', title: 'Completed', items: all.filter((e) => e.status === 'completed') },
  ];
  const count = (s: Envelope['status']) => all.filter((e) => e.status === s).length;

  return (
    <main className="list">
      <div className="list-head">
        <div>
          <h1>Hi, {user.name.split(' ')[0]}</h1>
          <p className="hint">{user.company} · documents you sent or received</p>
        </div>
        <div className="row">
          <select aria-label="Document to send" value={docId} onChange={(e) => setDocId(e.target.value)}>
            {SOURCE_DOCUMENTS.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
          </select>
          <button className="primary" onClick={create}>+ New envelope</button>
        </div>
      </div>

      <div className="tally">
        <div className="tally-item tally-draft"><strong>{count('draft')}</strong> Draft</div>
        <div className="tally-item tally-sent"><strong>{count('sent')}</strong> Sent</div>
        <div className="tally-item tally-completed"><strong>{count('completed')}</strong> Completed</div>
      </div>

      {error && <p className="error">{error}</p>}
      {envelopes && all.length === 0 && (
        <p className="empty">Nothing here yet. Documents appear when you create one, or when someone sends one to {user.email}.</p>
      )}

      {sections.filter((s) => s.items.length > 0).map((s) => (
        <section key={s.key} className="doc-section">
          <h2>{s.title} <span className="hint">({s.items.length})</span></h2>
          <div className="cards">
            {s.items.map((env) => <DocCard key={env.id} env={env} user={user} />)}
          </div>
        </section>
      ))}
    </main>
  );
}

function DocCard({ env, user }: { env: Envelope; user: User }) {
  const doc = getSourceDocument(env.sourceDocId);
  const mine = isSender(env, user);
  const sender = USERS.find((u) => u.id === env.senderId);
  const mineToDo = needsMe(env, user);
  const withWho = mine ? (env.recipient ? `To ${env.recipient.name}` : 'Not sent yet') : `From ${sender?.name}`;
  const when = env.completedAt ?? env.sentAt ?? env.createdAt;
  return (
    <Link to={`/envelope/${env.id}`} className={`card card-${env.status} ${mineToDo ? 'card-todo' : ''}`}>
      {doc && <DocThumb env={env} doc={doc} />}
      <div className="card-body">
        <StatusBadge status={env.status} />
        <strong className="card-title">{doc?.title ?? env.sourceDocId}</strong>
        <span className="hint">{withWho} · you are the {mine ? 'sender' : 'recipient'}</span>
        <StatusTrack status={env.status} />
        <span className="hint">Updated {new Date(when).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span className={mineToDo ? 'btn-link primary' : 'btn-link'}>{mineToDo ? (mine ? 'Continue →' : 'Sign now →') : 'View'}</span>
      </div>
    </Link>
  );
}
