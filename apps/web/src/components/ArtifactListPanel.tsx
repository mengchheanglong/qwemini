import type { ShellPanelsState } from '../lib/shell-panels-state';
import { EmptyState } from './EmptyState';

type ArtifactListPanelProps = {
  artifacts: ShellPanelsState['artifacts'];
  formatTimestamp: (timestamp: string) => string;
};

export function ArtifactListPanel({
  artifacts,
  formatTimestamp,
}: ArtifactListPanelProps) {
  if (artifacts.length === 0) {
    return (
      <EmptyState
        title="No artifacts captured"
        message="Assistant artifacts will be stored here."
      />
    );
  }

  return (
    <>
      {artifacts
        .slice()
        .reverse()
        .map((artifact, index) => (
          <article
            className="artifact-card qw-inspector-card"
            key={artifact.id ?? `${artifact.title}-${artifact.createdAt}-${index}`}
          >
            <header className="qw-inspector-card-header">
              <div className="qw-inspector-card-title-group">
                <strong>{artifact.title}</strong>
              </div>
              <span>{formatTimestamp(artifact.createdAt)}</span>
            </header>
            <pre className="qw-inspector-card-preview">{artifact.content}</pre>
          </article>
        ))}
    </>
  );
}
