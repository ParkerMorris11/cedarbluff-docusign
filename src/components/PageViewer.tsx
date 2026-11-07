import type { ReactNode, PointerEvent } from 'react';
import type { FieldDefinition, SourceDocument } from '../domain/types';

type Props = {
  doc: SourceDocument;
  fields: FieldDefinition[];
  renderField: (field: FieldDefinition) => ReactNode;
  fieldClassName?: (field: FieldDefinition) => string;
  onPagePointerDown?: (page: number, e: PointerEvent<HTMLDivElement>) => void;
  onFieldPointerDown?: (field: FieldDefinition, e: PointerEvent<HTMLDivElement>) => void;
};

/**
 * Draws each page in a box with the page's aspect ratio, and places fields with
 * percentage left/top/width/height. Because positions are fractions of the page,
 * fields stay over the same spot at any window size, with no resize code.
 */
export function PageViewer({ doc, fields, renderField, fieldClassName, onPagePointerDown, onFieldPointerDown }: Props) {
  return (
    <div className="pages">
      {doc.pages.map((page, index) => (
        <div
          key={index}
          className="page"
          data-page={index}
          style={{ aspectRatio: `${page.width} / ${page.height}`, backgroundImage: `url(${page.imageUrl})` }}
          onPointerDown={(e) => e.target === e.currentTarget && onPagePointerDown?.(index, e)}
        >
          {fields
            .filter((f) => f.page === index)
            .map((f) => (
              <div
                key={f.id}
                className={`field field-${f.assignee} ${fieldClassName?.(f) ?? ''}`}
                style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
                title={`${f.label} (${f.assignee}${f.required ? ', required' : ''})`}
                onPointerDown={onFieldPointerDown ? (e) => onFieldPointerDown(f, e) : undefined}
              >
                {renderField(f)}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
