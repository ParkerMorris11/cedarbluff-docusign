import type { FieldDefinition, FieldValue, SourceDocument } from '../domain/types';
import { valueToText } from '../domain/validation';
import { FieldValueView } from './FieldValueView';
import { PageViewer } from './PageViewer';

type Props = {
  doc: SourceDocument;
  fields: FieldDefinition[];
  values: Record<string, FieldValue>;
};

/**
 * A small, non-interactive picture of an envelope. It reuses PageViewer, so fields
 * land in the same spots as on the full page. CSS fans the pages out.
 */
export function DocumentThumbnail({ doc, fields, values }: Props) {
  return (
    <div className="thumb" aria-hidden="true">
      <PageViewer
        doc={doc}
        fields={fields}
        fieldClassName={(f) => (valueToText(values[f.id]) ? 'readonly' : '')}
        renderField={(f) => (valueToText(values[f.id]) ? <FieldValueView field={f} value={values[f.id]} /> : null)}
      />
    </div>
  );
}
