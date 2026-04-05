import type { ShellPanelsState } from '../lib/shell-panels-state';
import { EmptyState } from './EmptyState';

type ApprovalListPanelProps = {
  approvals: ShellPanelsState['approvals'];
  capabilities: ShellPanelsState['selectedSessionCapabilities'];
  onResolveApproval: (
    approvalId: string,
    decision: 'approved' | 'denied',
  ) => void;
};

function formatApprovalSuggestions(
  metadata: NonNullable<ShellPanelsState['approvals'][number]['payload']>['metadata'],
) {
  const suggestions = Array.isArray(metadata?.permissionSuggestions)
    ? metadata.permissionSuggestions
    : [];
  if (suggestions.length === 0) {
    return 'No provider suggestions';
  }

  return suggestions
    .map((suggestion) =>
      typeof suggestion?.label === 'string' ? suggestion.label : JSON.stringify(suggestion),
    )
    .join(', ');
}

export function ApprovalListPanel({
  approvals,
  capabilities,
  onResolveApproval,
}: ApprovalListPanelProps) {
  if (approvals.length === 0) {
    return (
      <EmptyState
        title="No approvals pending"
        message={
          capabilities && !capabilities.daemonApprovalMediation
            ? 'This provider does not expose daemon-owned approvals yet. Tool activity can still appear without approval records.'
            : 'Tool approvals will appear here.'
        }
      />
    );
  }

  return (
    <>
      {approvals
        .slice()
        .reverse()
        .map((approval) => (
          <article className={`approval-card qw-inspector-card ${approval.status}`} key={approval.id}>
            <header className="qw-inspector-card-header">
              <div className="qw-inspector-card-title-group">
                <strong>{approval.toolName}</strong>
                <span className="qw-inspector-subline">
                  Suggestions: {formatApprovalSuggestions(approval.payload?.metadata ?? null)}
                </span>
              </div>
              <span className={`event-chip approval-status-${approval.status}`}>{approval.status}</span>
            </header>

            <pre className="qw-inspector-card-preview">
              {JSON.stringify(approval.payload?.input ?? {}, null, 2)}
            </pre>

            <div className="approval-meta-list qw-inspector-meta-list">
              {approval.reason ? (
                <p className="approval-meta">Reason: {approval.reason}</p>
              ) : null}
            </div>

            {approval.status === 'requested' ? (
              <div className="approval-actions">
                <button
                  type="button"
                  className="approve-button"
                  onClick={() => {
                    onResolveApproval(approval.id, 'approved');
                  }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="deny-button"
                  onClick={() => {
                    onResolveApproval(approval.id, 'denied');
                  }}
                >
                  Deny
                </button>
              </div>
            ) : null}
          </article>
        ))}
    </>
  );
}
