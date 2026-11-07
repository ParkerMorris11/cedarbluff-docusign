import type { EnvelopeStatus } from '../domain/types';

export function StatusBadge({ status }: { status: EnvelopeStatus }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}
