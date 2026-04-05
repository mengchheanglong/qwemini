import type { WorkbenchEvent, WorkbenchRun } from '@qwemini/protocol';

type RunViewSummary = Pick<
  WorkbenchRun,
  'id' | 'status' | 'createdAt' | 'prompt'
>;

type RunViewEvent = Pick<WorkbenchEvent, 'type' | 'timestamp'> & {
  payload?: unknown;
};

export type RunViewState = {
  selectedSessionId: string | null;
  runs: RunViewSummary[];
  selectedRun: RunViewSummary | null;
  events: RunViewEvent[];
};

export const emptyRunViewState: RunViewState = {
  selectedSessionId: null,
  runs: [],
  selectedRun: null,
  events: [],
};
