// Pure hash-chain logic for the audit trail. No storage, no React.

export type AuditEntry = {
  seq: number; // position in this envelope's chain, starting at 0
  envelopeId: string;
  at: string;
  actorId: string;
  type: string;
  data: unknown;
  prevHash: string; // hash of the previous entry (GENESIS for the first)
  hash: string; // sha256(prevHash + canonical content of this entry)
};

export const GENESIS = '0'.repeat(64);

async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Everything except `hash`, in a fixed order, so the same entry always hashes the same. */
function canonical(e: Omit<AuditEntry, 'hash'>): string {
  return JSON.stringify([e.seq, e.envelopeId, e.at, e.actorId, e.type, e.data, e.prevHash]);
}

export async function hashEntry(e: Omit<AuditEntry, 'hash'>): Promise<string> {
  return sha256Hex(e.prevHash + canonical(e));
}

export async function makeEntry(
  previous: AuditEntry | undefined,
  content: Pick<AuditEntry, 'envelopeId' | 'at' | 'actorId' | 'type' | 'data'>,
): Promise<AuditEntry> {
  const base = { ...content, seq: previous ? previous.seq + 1 : 0, prevHash: previous ? previous.hash : GENESIS };
  return { ...base, hash: await hashEntry(base) };
}

export type VerifyResult = { ok: true; count: number } | { ok: false; brokenAtSeq: number; reason: string };

/**
 * Walks the chain and checks two things for every entry:
 *  1. its stored hash matches a fresh hash of its content (content not edited)
 *  2. its prevHash matches the previous entry's hash (nothing edited, removed or reordered before it)
 */
export async function verifyChain(entries: AuditEntry[]): Promise<VerifyResult> {
  let prevHash = GENESIS;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.seq !== i) return { ok: false, brokenAtSeq: i, reason: 'An entry is missing or out of order' };
    if (e.prevHash !== prevHash) return { ok: false, brokenAtSeq: e.seq, reason: 'Link to the previous entry is broken' };
    const { hash, ...rest } = e;
    if ((await hashEntry(rest)) !== hash) return { ok: false, brokenAtSeq: e.seq, reason: 'Entry content was changed' };
    prevHash = hash;
  }
  return { ok: true, count: entries.length };
}
