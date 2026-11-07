import type { Envelope, SourceDocument } from '../domain/types';
import { FieldValueView } from './FieldValueView';

/** A small, read-only picture of page 1 with its boxes and whatever has been filled in. */
export function DocThumb({ env, doc }: { env: Envelope; doc: SourceDocument }) {
  const page = doc.pages[0];
  return (
    <div className="thumb" aria-hidden="true">
      <div className="page" style={{ aspectRatio: `${page.width} / ${page.height}`, backgroundImage: `url(${page.imageUrl})` }}>
        {env.fields.filter((f) => f.page === 0).map((f) => (
          <div key={f.id} className={`field field-${f.assignee} readonly-thumb`}
            style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}>
            {env.values[f.id] !== undefined && <FieldValueView field={f} value={env.values[f.id]} />}
          </div>
        ))}
      </div>
    </div>
  );
}
