import { useMemo, useState } from 'react';
import { envelopeService } from '../app/services';
import { canEditField, DomainError, isRecipient, isSender } from '../domain/envelope';
import type { Envelope, FieldDefinition, FieldValue, SourceDocument, User } from '../domain/types';
import { validateFields, valueToText, type FieldError } from '../domain/validation';
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
      <PageViewer
        doc={doc}
        fields={env.fields}
        fieldClassName={(f) =>
          [canEditField(env, f, user) ? 'editable' : 'readonly', submitted && errorById.has(f.id) ? 'invalid' : ''].join(' ')
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
      <aside className="panel">
        {sender && (
          <>
            <h3>Fill your fields, then send</h3>
            <p className="hint">Your Print Name and Date fill in automatically when you send.</p>
            <label>Recipient name<input value={recipient.name} onChange={(e) => setRecipient({ ...recipient, name: e.target.value })} /></label>
            <label>Recipient email<input list="known-users" value={recipient.email} onChange={(e) => setRecipient({ ...recipient, email: e.target.value })} /></label>
            <datalist id="known-users">
              {USERS.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
            </datalist>
            <button onClick={submit}>Send to recipient</button>
          </>
        )}
        {recipientTurn && (
          <>
            <h3>Fill in and sign</h3>
            <p className="hint">Your Print Name and Date fill in automatically when you finish.</p>
            <button onClick={submit}>Finish and sign</button>
          </>
        )}
        {!sender && !recipientTurn && <p className="hint">This document is read-only for you.</p>}
        {message && <p className="error">{message}</p>}
        {submitted && errors.length > 0 && (
          <ul className="error">{errors.map((e) => <li key={e.fieldId}>{e.error}</li>)}</ul>
        )}
      </aside>
    </div>
  );
}
