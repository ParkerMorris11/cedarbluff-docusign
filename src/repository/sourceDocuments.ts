import page1 from '../assets/page-1.png';
import page2 from '../assets/page-2.png';
import { MASTER_AGREEMENT_ID } from '../domain/seed';
import type { SourceDocument } from '../domain/types';

// Source documents are read-only. Pages are pre-rendered PNGs (150 DPI) of the PDF.
// Swapping in pdf.js later would only change how imageUrl is produced and drawn.
export const SOURCE_DOCUMENTS: SourceDocument[] = [
  {
    id: MASTER_AGREEMENT_ID,
    title: 'Master Agreement for Products and Services',
    pages: [
      { imageUrl: page1, width: 1275, height: 1650 },
      { imageUrl: page2, width: 1275, height: 1650 },
    ],
  },
];

export function getSourceDocument(id: string): SourceDocument | undefined {
  return SOURCE_DOCUMENTS.find((d) => d.id === id);
}
