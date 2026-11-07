import { useMemo, useState } from 'react';
import { envelopeService } from '../app/services';
import { buildChecklist, type ChecklistItem } from '../domain/checklist';
import { canEditField, DomainError, isRecipient, isSender } from '../domain/envelope';
import type { Envelope, FieldDefinition, FieldValue, SourceDocument, User } from '../domain/types';
import { isValidEmail, valueToText } from '../domain/validation';
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
  const active = sender || recipientTurn;
  const assignee = sender ? 'sender' : 'recipient';
  const checklist = useMemo(() => buildChecklist(env.fields, draft, assignee), [env.fields, draft, assignee]);
  const itemById = new Map(checklist.items.map((i) => [i.fieldId, i]));

  // The sender also has to say who it goes to. Same checks as the issue transition.
  const nameOk = recipient.name.trim() !== '';
  const emailOk = isValidEmail(recipient.email);
  const recipientLeft = sender ? Number(!nameOk) + Number(!emailOk) : 0;
  const remaining = checklist.remaining + recipientLeft;
  const done = checklist.items.filter((i) => i.done).length + (sender ? Number(nameOk) + Number(emailOk) : 0);

  function goToNext() {
    if (checklist.next) jumpTo(checklist.next.fieldId);
    else document.getElementById(nameOk ? 'recipient-email' : 'recipient-name')?.focus();
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
      <PageViewer
        doc={doc}
        fields={env.fields}
        fieldClassName={(f) => {
          const item = active ? itemById.get(f.id) : undefined;
          return [
            canEditField(env, f, user) ? 'editable' : 'readonly',
            item?.done ? 'filled' : '',
            checklist.next?.fieldId === f.id && active ? 'next' : '',
            item?.error && (submitted || !item.empty) ? 'invalid' : '',
          ].join(' ');
        }}
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
        {active && (
          <>
            <h3>What you need to fill in</h3>
            <Progress remaining={remaining} done={done} onJump={goToNext} />
            {checklist.items.length === 0 && <p className="hint">None of the boxes are yours to fill in.</p>}
            {doc.pages.map((_, page) => {
              const items = checklist.items.filter((i) => i.page === page);
              if (items.length === 0) return null;
              return (
                <div key={page} className="check-group">
                  <h4>Page {page + 1}</h4>
                  {items.map((item) => (
                    <CheckRow
                      key={item.fieldId}
                      item={item}
                      isNext={checklist.next?.fieldId === item.fieldId}
                      showError={submitted || !item.empty}
                      onClick={() => jumpTo(item.fieldId)}
                    />
                  ))}
                </div>
              );
            })}
            {checklist.autoFilled.length > 0 && (
              <p className="hint">
                Filled in for you when you {sender ? 'send' : 'finish'}: {checklist.autoFilled.map((f) => f.label).join(', ')}.
              </p>
            )}
          </>
        )}
        {sender && (
          <div className="check-group">
            <h4>Who it goes to</h4>
            <label><span>{nameOk && <span className="tick" aria-hidden="true">✓ </span>}Recipient name</span><input id="recipient-name" value={recipient.name} onChange={(e) => setRecipient({ ...recipient, name: e.target.value })} /></label>
            <label><span>{emailOk && <span className="tick" aria-hidden="true">✓ </span>}Recipient email</span><input id="recipient-email" list="known-users" value={recipient.email} onChange={(e) => {
              // Picking a known person's email fills in their name too.
              const known = USERS.find((u) => u.email === e.target.value.trim().toLowerCase());
              setRecipient({ email: e.target.value, name: known && !recipient.name ? known.name : recipient.name });
            }} /></label>
            {recipient.email.trim() !== '' && !emailOk && <p className="check-error">Enter a full email address, like name@company.com.</p>}
            <datalist id="known-users">
              {USERS.filter((u) => u.id !== user.id).map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
            </datalist>
          </div>
        )}
        {sender && <button className="primary big" onClick={submit}>Sign and send →</button>}
        {recipientTurn && <button className="primary big" onClick={submit}>Finish and sign ✓</button>}
        {!active && <p className="hint">This document is read-only for you.</p>}
        {message && <p className="error">{message}</p>}
      </aside>
    </div>
  );
}

/** "3 of 10 done" with a button that jumps to the next thing still needed. */
function Progress({ remaining, done, onJump }: { remaining: number; done: number; onJump: () => void }) {
  const total = done + remaining;
  if (total === 0) return null;
  return (
    <div className="progress">
      <div className="progress-bar"><span style={{ width: `${(done / total) * 100}%` }} /></div>
      <div className="progress-text">
        {remaining === 0 ? 'All done. You can submit now.' : `${done} of ${total} done.`}
        {remaining > 0 && <button className="link" onClick={onJump}>Go to the next one →</button>}
      </div>
    </div>
  );
}

/** One line of the checklist. Clicking it jumps to that box on the page. */
function CheckRow({ item, isNext, showError, onClick }: { item: ChecklistItem; isNext: boolean; showError: boolean; onClick: () => void }) {
  const bad = !!item.error && showError;
  return (
    <button type="button" className={`check-row${item.done ? ' done' : ''}${bad ? ' bad' : ''}${isNext ? ' is-next' : ''}`} onClick={onClick}>
      <span className="check-mark" aria-hidden="true">{item.done ? '✓' : ''}</span>
      <span className="check-text">
        <span className="visually-hidden">{item.done ? 'Done: ' : 'To do: '}</span>
        {item.label}
        {!item.required && <span className="check-optional"> (optional)</span>}
        {bad && <small>{item.error}</small>}
      </span>
      {isNext && <span className="check-next">Next</span>}
    </button>
  );
}
