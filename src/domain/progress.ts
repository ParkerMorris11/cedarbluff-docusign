import { buildChecklist } from './checklist';
import type { Envelope, FieldAssignee } from './types';

export type StageId = 'place' | 'sender' | 'recipient' | 'completed';
export type StageState = 'done' | 'current' | 'upcoming';

export type ProgressStage = {
  id: StageId;
  state: StageState;
  /** How full this stage's segment is, 0 to 1. */
  fill: number;
  /** Boxes done for the party acting in this stage. Only set while the stage is current. */
  boxes?: { done: number; total: number };
};

export type EnvelopeProgress = {
  stages: ProgressStage[];
  /** 1-based number of the stage in progress. A completed envelope is on the last stage. */
  step: number;
};

function signingStage(env: Envelope, id: 'sender' | 'recipient', assignee: FieldAssignee, status: Envelope['status']): ProgressStage {
  if (env.status !== status) {
    const finished = status === 'draft' || env.status === 'completed';
    return { id, state: finished ? 'done' : 'upcoming', fill: finished ? 1 : 0 };
  }
  const { items, remaining } = buildChecklist(env.fields, env.values, assignee);
  const done = items.filter((i) => i.done).length;
  const total = done + remaining;
  // Having no boxes to fill still leaves the sending or finishing step, so the stage stays current.
  return { id, state: 'current', fill: total === 0 ? 1 : done / total, boxes: { done, total } };
}

/**
 * Where an envelope is on its way from draft to completed. Always derived from the
 * envelope itself, so it can't disagree with the status or with what validation accepts.
 * Stored values only count: text still being typed joins in when it is saved.
 */
export function envelopeProgress(env: Envelope): EnvelopeProgress {
  const placed = env.fields.length > 0 || env.status !== 'draft';
  const stages: ProgressStage[] = [
    { id: 'place', state: placed ? 'done' : 'current', fill: placed ? 1 : 0 },
    placed
      ? signingStage(env, 'sender', 'sender', 'draft')
      : { id: 'sender', state: 'upcoming', fill: 0 },
    signingStage(env, 'recipient', 'recipient', 'sent'),
    env.status === 'completed'
      ? { id: 'completed', state: 'done', fill: 1 }
      : { id: 'completed', state: 'upcoming', fill: 0 },
  ];
  const current = stages.findIndex((s) => s.state === 'current');
  return { stages, step: current === -1 ? stages.length : current + 1 };
}
