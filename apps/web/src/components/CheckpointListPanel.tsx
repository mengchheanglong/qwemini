import type { ShellPanelsState } from '../lib/shell-panels-state';
import { EmptyState } from './EmptyState';

type CheckpointListPanelProps = {
  checkpoints: ShellPanelsState['checkpoints'];
  capabilities: ShellPanelsState['selectedSessionCapabilities'];
  formatTimestamp: (timestamp: string) => string;
  onRecoverCheckpoint: (checkpointId: string) => void;
};

export function CheckpointListPanel({
  checkpoints,
  capabilities,
  formatTimestamp,
  onRecoverCheckpoint,
}: CheckpointListPanelProps) {
  if (checkpoints.length === 0) {
    return (
      <EmptyState
        title="No checkpoints recorded"
        message={
          capabilities && !capabilities.checkpointEvents
            ? 'This provider does not emit checkpoint events yet. Use session recovery when resume metadata is available.'
            : 'Checkpoint events will be stored here.'
        }
      />
    );
  }

  return (
    <>
      {checkpoints
        .slice()
        .reverse()
        .map((checkpoint) => (
          <article className="artifact-card qw-inspector-card" key={checkpoint.id}>
            <header className="qw-inspector-card-header">
              <div className="qw-inspector-card-title-group">
                <strong>{checkpoint.title}</strong>
                {checkpoint.providerSessionId ? (
                  <span className="qw-inspector-subline">
                    provider session {checkpoint.providerSessionId}
                  </span>
                ) : null}
              </div>
              <span>{formatTimestamp(checkpoint.createdAt)}</span>
            </header>
            <pre className="qw-inspector-card-preview">
              {JSON.stringify(checkpoint.metadata, null, 2)}
            </pre>
            {checkpoint.providerSessionId ? (
              <div className="approval-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    onRecoverCheckpoint(checkpoint.id);
                  }}
                >
                  Recover Session
                </button>
              </div>
            ) : null}
          </article>
        ))}
    </>
  );
}
