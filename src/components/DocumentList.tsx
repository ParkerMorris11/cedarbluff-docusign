import { Link, useNavigate } from 'react-router';
import { envelopeService } from '../app/services';
import { useLoad } from '../app/useLoad';
import { isSender } from '../domain/envelope';
import { USERS } from '../domain/seed';
import { getSourceDocument, SOURCE_DOCUMENTS } from '../repository/sourceDocuments';
import { useCurrentUser } from '../store/currentUser';
import { StatusBadge } from './StatusBadge';
import { useState } from 'react';

export function DocumentList() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [docId, setDocId] = useState(SOURCE_DOCUMENTS[0].id);
  const { data: envelopes, error } = useLoad(() => envelopeService.listForUser(user), [user.id]);

  async function create() {
    const env = await envelopeService.createEnvelope(docId, user);
    navigate(`/envelope/${env.id}`);
  }

  return (
    <main className="list">
      <h1>Your documents</h1>
      <div className="row">
        <select value={docId} onChange={(e) => setDocId(e.target.value)}>
          {SOURCE_DOCUMENTS.map((d) => (
            <option key={d.id} value={d.id}>{d.title}</option>
          ))}
        </select>
        <button className="primary" onClick={create}>+ New envelope</button>
      </div>
      {error && <p className="error">{error}</p>}
      {envelopes && envelopes.length === 0 && <p>No documents yet.</p>}
      {envelopes && envelopes.length > 0 && (
        <table>
          <thead>
            <tr><th>Document</th><th>Your role</th><th>With</th><th>Status</th><th>Updated</th><th /></tr>
          </thead>
          <tbody>
            {envelopes.map((env) => {
              const mine = isSender(env, user);
              const sender = USERS.find((u) => u.id === env.senderId);
              const needsMe = (mine && env.status === 'draft') || (!mine && env.status === 'sent');
              return (
                <tr key={env.id}>
                  <td>{getSourceDocument(env.sourceDocId)?.title ?? env.sourceDocId}</td>
                  <td>{mine ? 'Sender' : 'Recipient'}</td>
                  <td>{mine ? (env.recipient ? `${env.recipient.name} <${env.recipient.email}>` : '—') : sender?.name}</td>
                  <td><StatusBadge status={env.status} /></td>
                  <td>{new Date(env.completedAt ?? env.sentAt ?? env.createdAt).toLocaleString()}</td>
                  <td>
                    <Link className={needsMe ? 'btn-link primary' : 'btn-link'} to={`/envelope/${env.id}`}>{needsMe ? (mine ? 'Continue →' : 'Sign now →') : 'View'}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
