import type { EnvelopeStatus } from '../domain/types';

const LABEL: Record<EnvelopeStatus, { icon: string; text: string }> = {
  draft: { icon: '✎', text: 'Draft' },
  sent: { icon: '➤', text: 'Sent' },
  completed: { icon: '✓', text: 'Completed' },
};

export function StatusBadge({ status }: { status: EnvelopeStatus }) {
  const { icon, text } = LABEL[status];
  return <span className={`badge badge-${status}`}><span aria-hidden="true">{icon}</span> {text}</span>;
}

const ORDER: EnvelopeStatus[] = ['draft', 'sent', 'completed'];

/** Draft → Sent → Completed, with the steps reached so far filled in. */
export function StatusTrack({ status }: { status: EnvelopeStatus }) {
  const at = ORDER.indexOf(status);
  return (
    <ol className="track" aria-label={`Status: ${status}`}>
      {ORDER.map((s, i) => (
        <li key={s} className={`${i <= at ? `reached reached-${status}` : ''} ${i === at ? 'current' : ''}`}>{LABEL[s].text}</li>
      ))}
    </ol>
  );
}
