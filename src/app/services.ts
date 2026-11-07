// Composition root: the one place that wires concrete implementations together.
import { MASTER_AGREEMENT_ID, USERS } from '../domain/seed';
import { AuditLog } from '../features/audit/auditLog';
import { LocalStorageEnvelopeRepository } from '../repository/envelopeRepository';
import { EnvelopeService } from '../service/envelopeService';
import { EventBus } from '../service/eventBus';

const bus = new EventBus();
const envelopeRepo = new LocalStorageEnvelopeRepository(window.localStorage);

// Subscribe the audit trail before anything can emit.
export const auditLog = new AuditLog(window.localStorage, envelopeRepo, bus);
export const envelopeService = new EnvelopeService(envelopeRepo, bus);

/** First run only: one empty draft for Alex so the app isn't blank. Runs once even if called twice. */
let seeding: Promise<void> | undefined;
export function seedIfEmpty(): Promise<void> {
  seeding ??= (async () => {
    if ((await envelopeRepo.list()).length > 0) return;
    await envelopeService.createEnvelope(MASTER_AGREEMENT_ID, USERS[0]);
  })();
  return seeding;
}
