import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { envelopeService } from '../app/services';
import { useLoad } from '../app/useLoad';
import { canEditLayout, isSender } from '../domain/envelope';
import { USERS } from '../domain/seed';
import { getSourceDocument } from '../repository/sourceDocuments';
import { useCurrentUser } from '../store/currentUser';
import { AuditPanel } from './AuditPanel';
import { Builder } from './Builder';
import { FillView } from './FillView';
import { StatusBadge } from './StatusBadge';

/** One route for an envelope. What you can do here is derived from the permission rules. */
export function EnvelopePage() {
  const { id = '' } = useParams();
  const user = useCurrentUser();
  const { data: env, error, setData } = useLoad(() => envelopeService.getForUser(id, user), [id, user.id]);
  const [step, setStep] = useState<'layout' | 'fill'>('layout');

  if (error) return <main className="list"><p className="error">{error}</p><Link to="/">Back to your documents</Link></main>;
  if (!env) return <main className="list">Loading…</main>;
  const doc = getSourceDocument(env.sourceDocId);
  if (!doc) return <main className="list"><p className="error">Missing source document.</p></main>;

  const sender = USERS.find((u) => u.id === env.senderId);
  const layoutEditable = canEditLayout(env, user);

  return (
    <main>
      <div className="envelope-bar">
        <Link to="/">← Documents</Link>
        <strong>{doc.title}</strong>
        <StatusBadge status={env.status} />
        <span className="hint">
          From {sender?.name}{env.recipient ? ` to ${env.recipient.name} <${env.recipient.email}>` : ''}
          {env.sentAt && ` · sent ${new Date(env.sentAt).toLocaleString()}`}
          {env.completedAt && ` · completed ${new Date(env.completedAt).toLocaleString()}`}
        </span>
        {layoutEditable && (
          <span className="steps">
            <button className={step === 'layout' ? '' : 'secondary'} onClick={() => setStep('layout')}>1. Place fields</button>
            <button className={step === 'fill' ? '' : 'secondary'} onClick={() => setStep('fill')}>2. Fill, sign and send</button>
          </span>
        )}
        {!layoutEditable && isSender(env, user) && env.status !== 'draft' && <span className="hint">Locked: already sent.</span>}
      </div>
      {/* key: start fresh local edit state when the user or status changes. */}
      {layoutEditable && step === 'layout'
        ? <Builder key={`${env.id}:${user.id}`} env={env} doc={doc} user={user} onChanged={setData} />
        : <FillView key={`${env.id}:${user.id}:${env.status}`} env={env} doc={doc} user={user} onChanged={setData} />}
      <AuditPanel env={env} user={user} />
    </main>
  );
}
