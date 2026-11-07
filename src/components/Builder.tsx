import { useRef, useState, type PointerEvent } from 'react';
import { envelopeService } from '../app/services';
import { masterAgreementLayout } from '../domain/seed';
import type { Envelope, FieldAssignee, FieldDefinition, FieldType, SourceDocument, User } from '../domain/types';
import { PageViewer } from './PageViewer';

type Props = { env: Envelope; doc: SourceDocument; user: User; onChanged: (env: Envelope) => void };

const TYPES: FieldType[] = ['text', 'email', 'phone', 'date', 'signature', 'signerName'];
const DEFAULT_SIZE: Record<FieldType, { w: number; h: number }> = {
  text: { w: 0.2, h: 0.018 }, email: { w: 0.25, h: 0.018 }, phone: { w: 0.18, h: 0.018 },
  date: { w: 0.12, h: 0.018 }, signature: { w: 0.3, h: 0.028 }, signerName: { w: 0.2, h: 0.018 },
};
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Sender's layout editor (draft only). Works on a local copy of the fields
 * while you drag or type, and saves through the service when a change is done.
 */
export function Builder({ env, doc, user, onChanged }: Props) {
  const [fields, setFields] = useState(env.fields);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [placeType, setPlaceType] = useState<FieldType>('text');
  const [placeAssignee, setPlaceAssignee] = useState<FieldAssignee>('recipient');
  const [message, setMessage] = useState<string | undefined>();
  const drag = useRef<{ id: string; startX: number; startY: number; fx: number; fy: number; rect: DOMRect; moved: boolean } | null>(null);

  const selected = fields.find((f) => f.id === selectedId);

  async function commit(next: FieldDefinition[]) {
    setFields(next);
    setMessage(undefined);
    try {
      onChanged(await envelopeService.updateLayout(env.id, next, user));
    } catch (e) {
      setMessage((e as Error).message);
      setFields(env.fields);
    }
  }

  function addAt(page: number, e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const { w, h } = DEFAULT_SIZE[placeType];
    const field: FieldDefinition = {
      id: crypto.randomUUID(),
      page,
      x: clamp((e.clientX - rect.left) / rect.width - w / 2, 0, 1 - w),
      y: clamp((e.clientY - rect.top) / rect.height - h / 2, 0, 1 - h),
      w, h,
      type: placeType,
      label: placeType === 'signerName' ? 'Print Name' : placeType[0].toUpperCase() + placeType.slice(1),
      required: true,
      assignee: placeAssignee,
      ...(placeType === 'date' ? { autoFillDate: true } : {}),
    };
    setSelectedId(field.id);
    void commit([...fields, field]);
  }

  // Dragging: convert the pointer's movement in pixels to a change in page fractions.
  function startDrag(f: FieldDefinition, e: PointerEvent<HTMLDivElement>) {
    const pageEl = e.currentTarget.parentElement!;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: f.id, startX: e.clientX, startY: e.clientY, fx: f.x, fy: f.y, rect: pageEl.getBoundingClientRect(), moved: false };
    setSelectedId(f.id);
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    setFields((fs) => fs.map((f) => f.id !== d.id ? f : {
      ...f,
      x: clamp(d.fx + (e.clientX - d.startX) / d.rect.width, 0, 1 - f.w),
      y: clamp(d.fy + (e.clientY - d.startY) / d.rect.height, 0, 1 - f.h),
    }));
  }
  function endDrag() {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) void commit(fields);
  }

  function patchSelected(patch: Partial<FieldDefinition>, save = true) {
    const next = fields.map((f) => (f.id === selectedId ? { ...f, ...patch } : f));
    if (save) void commit(next);
    else setFields(next);
  }

  return (
    <div className="workspace" onPointerMove={onMove} onPointerUp={endDrag}>
      <PageViewer
        doc={doc}
        fields={fields}
        fieldClassName={(f) => (f.id === selectedId ? 'selected draggable' : 'draggable')}
        renderField={(f) => <span className="field-label">{f.label}{f.required ? ' *' : ''}</span>}
        onPagePointerDown={addAt}
        onFieldPointerDown={startDrag}
      />
      <aside className="panel">
        <h3>Place fields</h3>
        <p className="hint">Pick a type and who fills it, then click the page. Drag a field to move it.</p>
        <label>Type
          <select value={placeType} onChange={(e) => setPlaceType(e.target.value as FieldType)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Filled by
          <select value={placeAssignee} onChange={(e) => setPlaceAssignee(e.target.value as FieldAssignee)}>
            <option value="recipient">recipient</option>
            <option value="sender">sender (you)</option>
          </select>
        </label>
        <button className="secondary" onClick={() => commit(masterAgreementLayout())}>
          Load Master Agreement layout
        </button>
        <p className="hint">{fields.length} fields placed.</p>

        {selected && (
          <div className="field-editor">
            <h3>Selected field</h3>
            <label>Label
              <input value={selected.label} onChange={(e) => patchSelected({ label: e.target.value }, false)} onBlur={() => commit(fields)} />
            </label>
            <label>Type
              <select value={selected.type} onChange={(e) => {
                const type = e.target.value as FieldType;
                patchSelected({ type, autoFillDate: type === 'date' ? selected.autoFillDate ?? true : undefined });
              }}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label>Filled by
              <select value={selected.assignee} onChange={(e) => patchSelected({ assignee: e.target.value as FieldAssignee })}>
                <option value="recipient">recipient</option>
                <option value="sender">sender</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={selected.required} onChange={(e) => patchSelected({ required: e.target.checked })} /> Required
            </label>
            {selected.type === 'date' && (
              <label className="check">
                <input type="checkbox" checked={!!selected.autoFillDate} onChange={(e) => patchSelected({ autoFillDate: e.target.checked })} /> Auto-fill with signing date
              </label>
            )}
            <button className="danger" onClick={() => { setSelectedId(undefined); void commit(fields.filter((f) => f.id !== selectedId)); }}>
              Delete field
            </button>
          </div>
        )}
        {message && <p className="error">{message}</p>}
      </aside>
    </div>
  );
}
