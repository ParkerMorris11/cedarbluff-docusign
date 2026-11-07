import { envelopeProgress, type ProgressStage } from '../domain/progress';
import { USERS } from '../domain/seed';
import type { Envelope } from '../domain/types';

function labelFor(stage: ProgressStage, env: Envelope): string {
  switch (stage.id) {
    case 'place': return 'Place boxes';
    case 'sender': return `${USERS.find((u) => u.id === env.senderId)?.name ?? 'Sender'} signs and sends`;
    case 'recipient': return `${env.recipient?.name ?? 'Recipient'} signs`;
    case 'completed': return 'Completed';
  }
}

/** The whole document's journey. `compact` is the bar and one line of text, for the list cards. */
export function EnvelopeProgressBar({ env, compact = false }: { env: Envelope; compact?: boolean }) {
  const { stages, step } = envelopeProgress(env);
  const current = stages[step - 1];
  const count = current.boxes ? ` (${current.boxes.done} of ${current.boxes.total} boxes)` : '';
  const summary = env.status === 'completed'
    ? `Step ${step} of ${stages.length}: completed`
    : `Step ${step} of ${stages.length}: ${labelFor(current, env)}${count}`;

  return (
    <div className={compact ? 'journey compact' : 'journey'}>
      <ol>
        {stages.map((s) => (
          <li key={s.id} className={`journey-stage ${s.state}`}>
            <span className="journey-track" aria-hidden="true">
              <span style={{ width: `${s.fill * 100}%` }} />
            </span>
            {!compact && (
              <span className="journey-label">
                {labelFor(s, env)}
                <span className="visually-hidden"> ({s.state})</span>
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="journey-summary">{summary}</p>
    </div>
  );
}
