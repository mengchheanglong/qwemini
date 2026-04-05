export type ShellSummaryState = {
  providerHealth: string;
  providerSession: string;
  dataDirectory: string;
  toolPlaneNote: string;
  sessionProviderNote: string;
  selectedSessionNote: string;
  runTitle: string;
  runStatusLabel: string;
  runStatusClassName: string;
  runStateNote: string;
  orchestratorNote: string;
};

export const emptyShellSummaryState: ShellSummaryState = {
  providerHealth: 'Checking...',
  providerSession: 'unbound',
  dataDirectory: '-',
  toolPlaneNote: 'Loading...',
  sessionProviderNote:
    'Qwen supports daemon approvals, resume, and checkpoint events.',
  selectedSessionNote:
    'Select a session to inspect provider-specific controls.',
  runTitle: 'No run selected',
  runStatusLabel: 'idle',
  runStatusClassName: 'status-pill status-idle',
  runStateNote: 'Select a session and start a run.',
  orchestratorNote:
    'Select a session and enter a prompt to preview daemon-owned provider routing.',
};
