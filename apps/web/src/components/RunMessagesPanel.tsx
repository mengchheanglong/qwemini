import type { RunViewState } from '../lib/run-view-state';
import {
  buildConversationBlocks,
  type RunDeltaEvent,
  type RunMessageEvent,
} from '../lib/run-inspector-views';
import { EmptyState } from './EmptyState';

type RunMessagesPanelProps = {
  selectedRun: RunViewState['selectedRun'];
  deltas: RunDeltaEvent[];
  messages: RunMessageEvent[];
  formatTimestamp: (timestamp: string) => string;
};

export function RunMessagesPanel({
  selectedRun,
  deltas,
  messages,
  formatTimestamp,
}: RunMessagesPanelProps) {
  const conversation = buildConversationBlocks(selectedRun, deltas, messages).filter(
    (entry) => entry.role !== 'system',
  );

  if (!selectedRun) {
    return (
      <EmptyState
        title="No run selected"
        message="Select a run to inspect the conversation."
      />
    );
  }

  if (conversation.length === 0) {
    return (
      <EmptyState
        title="No conversation yet"
        message="User and assistant messages will appear here."
      />
    );
  }

  return (
    <div className="message-stream terminal-stream">
      {conversation.map((entry, index) => (
          <article
            className={`timeline-item terminal-line transcript-block transcript-block-${entry.role}`}
            key={`${entry.timestamp}-message-${index}`}
          >
            <header className="terminal-line-header transcript-block-header">
              <span className={`event-chip ${entry.role === 'assistant' ? 'message' : entry.role}`}>
                {entry.role === 'thinking' ? 'thinking' : entry.role}
              </span>
              <span>{formatTimestamp(entry.timestamp)}</span>
            </header>
            <pre className="terminal-line-body transcript-block-body">{entry.text}</pre>
          </article>
        ))}
    </div>
  );
}
