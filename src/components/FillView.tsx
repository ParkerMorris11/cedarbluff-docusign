import { useMemo, useState } from 'react';
import { envelopeService } from '../app/services';
import { canEditField, DomainError, isRecipient, isSender } from '../domain/envelope';
import type { Envelope, FieldDefinition, FieldValue, SourceDocument, User } from '../domain/types';
import { isAutoFilled, validateFields, valueToText, type FieldError } from '../domain/validation';
import { FieldValueView } from './FieldValueView';
import { PageViewer } from './PageViewer';
import { USERS } from '../domain/seed';

type Props = { env: Envelope; doc: SourceDocument; user: User; onChanged: (env: Envelope) => void };

const INPUT_TYPE: Record<FieldDefinition['type'], string> = {
  text: 'text', email: 'email', phone: 'tel', date: 'date', signature: 'text', signerName: 'text',
};

/**
 * Filling in values. Used by the sender (their own fields, before issuing)
 * and the recipient (their fields, before finishing). Which inputs are
 * editable comes from canEditField, the same rule the service enforces.
 */
export function FillView({ env, doc, user, onChanged }: Props) {
  // Local edit buffer: what's typed but not yet saved. Saved on blur.
  const [draft, setDraft] = useState<Record<string, FieldValue>>(env.values);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [recipient, setRecipient] = useState({ name: '', email: '' });

  const sender = isSender(env, user) && env.status === 'draft';
  const recipientTurn = isRecipient(env, user) && env.status === 'sent';
  const editable = env.fields.filter((f) => canEditField(env, f, user));
  const errors: FieldError[] = useMemo(
    () => (sender || recipientTurn ? validateFields(env.fields, draft, sender ? 'sender' : 'recipient') : []),
    [env.fields, draft, sender, recipientTurn],
  );
  const errorById = new Map(errors.map((e) => [e.fieldId, e.error]));
  const fieldById = new Map(env.fields.map((f) => [f.id, f]));
  const remaining = editable.filter((f) => errorById.has(f.id)).length;

  // Colour each box from this person's point of view.
  const myAssignee = sender ? 'sender' : recipientTurn ? 'recipient' : null;
  function boxState(f: FieldDefinition): string {
    if (canEditField(env, f, user)) return errorById.has(f.id) ? 'editable mine-todo' : 'editable mine-done';
    if (myAssignee && f.assignee === myAssignee && isAutoFilled(f)) return 'readonly mine-auto';
    return 'readonly theirs';
  }

  // Scroll to a box on the page and put the cursor in it.
  function jumpTo(fieldId: string) {
    const el = document.querySelector<HTMLElement>(`[data-field-id="${fieldId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector('input')?.focus({ preventScroll: true });
  }

  function changedPatch(): Record<string, FieldValue> {
    const patch: Record<string, FieldValue> = {};
    for (const f of editable) {
      if (valueToText(draft[f.id]) !== valueToText(env.values[f.id])) patch[f.id] = draft[f.id];
    }
    return patch;
  }

  async function run(action: () => Promise<Envelope>) {
    setMessage(undefined);
    try {
      onChanged(await action());
    } catch (e) {
      setMessage(e instanceof DomainError || e instanceof Error ? e.message : String(e));
    }
  }

  const save = () => run(() => envelopeService.updateValues(env.id, changedPatch(), user));

  async function submit() {
    setSubmitted(true);
    await run(async () => {
      await envelopeService.updateValues(env.id, changedPatch(), user);
      return sender ? envelopeService.issue(env.id, recipient, user) : envelopeService.complete(env.id, user);
    });
  }

  function setValue(f: FieldDefinition, text: string) {
    setDraft((d) => ({ ...d, [f.id]: f.type === 'signature' ? { kind: 'typed', text } : text }));
  }

  return (
    <div className="workspace">
      <div className="pages-col">
      {(sender || recipientTurn) && (
        <div className="legend-boxes">
          <span><i className="sw mine-todo" /> Yours, still to fill</span>
          <span><i className="sw mine-done" /> Yours, done</span>
          <span><i className="sw mine-auto" /> Yours, fills in automatically</span>
          <span><i className="sw theirs" /> {sender ? "Recipient's" : "Sender's"} (you can't edit)</span>
        </div>
      )}
      <PageViewer
        doc={doc}
        fields={env.fields}
        fieldClassName={(f) =>
          [boxState(f), submitted && errorById.has(f.id) ? 'invalid' : ''].join(' ')
        }
        renderField={(f) =>
          canEditField(env, f, user) ? (
            <input
              className={f.type === 'signature' ? 'script' : ''}
              type={INPUT_TYPE[f.type]}
              placeholder={f.label + (f.required ? ' *' : '')}
              aria-label={f.label}
              value={valueToText(draft[f.id])}
              onChange={(e) => setValue(f, e.target.value)}
              onBlur={save}
            />
          ) : (
            <FieldValueView field={f} value={draft[f.id]} />
          )
        }
      />
      </div>
      <aside className="panel">
        {sender && (
          <>
            <h3>Fill your fields, then send</h3>
            <p className="hint">Your Print Name and Date fill in automatically when you send.</p>
            <Progress remaining={remaining} total={editable.length} onJump={() => { const f = editable.find((x) => errorById.has(x.id)); if (f) jumpTo(f.id); }} />
            <Checklist fields={editable} errorById={errorById} onJump={jumpTo} />
            <label>Recipient name<input value={recipient.name} onChange={(e) => setRecipient({ ...recipient, name: e.target.value })} /></label>
            <label>Recipient email<input list="known-users" value={recipient.email} onChange={(e) => {
              // Picking a known person's email fills in their name too.
              const known = USERS.find((u) => u.email === e.target.value.trim().toLowerCase());
              setRecipient({ email: e.target.value, name: known && !recipient.name ? known.name : recipient.name });
            }} /></label>
            <datalist id="known-users">
              {USERS.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
            </datalist>
            <button className="primary big" onClick={submit}>Sign and send →</button>
          </>
        )}
        {recipientTurn && (
          <>
            <h3>Fill in and sign</h3>
            <p className="hint">Your Print Name and Date fill in automatically when you finish.</p>
            <Progress remaining={remaining} total={editable.length} onJump={() => { const f = editable.find((x) => errorById.has(x.id)); if (f) jumpTo(f.id); }} />
            <Checklist fields={editable} errorById={errorById} onJump={jumpTo} />
            <button className="primary big" onClick={submit}>Finish and sign ✓</button>
          </>
        )}
        {!sender && !recipientTurn && <p className="hint">This document is read-only for you.</p>}
        {message && <p className="error">{message}</p>}
        {submitted && errors.length > 0 && (
          <ul className="error-list">
            {errors.map((e) => (
              <li key={e.fieldId}>
                <button className="link" onClick={() => jumpTo(e.fieldId)}>
                  {e.error} <span className="where">page {(fieldById.get(e.fieldId)?.page ?? 0) + 1} →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

/** "3 of 11 boxes left" with a button that jumps to the next empty one. */
function Progress({ remaining, total, onJump }: { remaining: number; total: number; onJump: () => void }) {
  if (total === 0) return null;
  const done = total - remaining;
  return (
    <div className="progress">
      <div className="progress-bar"><span style={{ width: `${(done / total) * 100}%` }} /></div>
      <div className="progress-text">
        {remaining === 0 ? 'All your boxes are filled.' : `${done} of ${total} of your boxes done.`}
        {remaining > 0 && <button className="link" onClick={onJump}>Go to next empty box →</button>}
      </div>
    </div>
  );
}

/** Every box this person must fill, in page order, with a tick when it's valid. Click to jump to it. */
function Checklist({ fields, errorById, onJump }: { fields: FieldDefinition[]; errorById: Map<string, string>; onJump: (id: string) => void }) {
  if (fields.length === 0) return null;
  const sorted = [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  return (
    <ul className="checklist" aria-label="Your boxes">
      {sorted.map((f) => {
        const ok = !errorById.has(f.id);
        return (
          <li key={f.id} className={ok ? 'ok' : ''}>
            <button className="link" onClick={() => onJump(f.id)}>
              <span className="tick" aria-hidden="true">{ok ? '✓' : '○'}</span>
              {f.label}{f.required ? '' : ' (optional)'}
              <span className="pg">p.{f.page + 1}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
