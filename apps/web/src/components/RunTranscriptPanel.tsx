import { useEffect, useRef } from 'react';
import type { RunViewState } from '../lib/run-view-state';
import {
  buildConversationBlocks,
  type RunDeltaEvent,
  type RunMessageEvent,
} from '../lib/run-inspector-views';
import { EmptyState } from './EmptyState';

type RunTranscriptPanelProps = {
  selectedRun: RunViewState['selectedRun'];
  deltas: RunDeltaEvent[];
  messages: RunMessageEvent[];
  formatTimestamp: (timestamp: string) => string;
};

export function RunTranscriptPanel({
  selectedRun,
  deltas,
  messages,
  formatTimestamp,
}: RunTranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const conversation = buildConversationBlocks(selectedRun, deltas, messages);

  useEffect(() => {
    if (!containerRef.current || !selectedRun || conversation.length === 0) {
      return;
    }

    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [selectedRun, conversation]);

  if (!selectedRun) {
    return (
      <EmptyState
        title="No active run selected"
        message="Select a session and start a run."
      />
    );
  }

  if (conversation.length === 0) {
    return (
      <EmptyState
        title="Transcript is idle"
        message="Live deltas will appear here."
      />
    );
  }

  return (
    <div ref={containerRef} className="transcript-stream terminal-stream">
      {conversation.map((entry, index) => (
        <article
          className={`timeline-item terminal-line transcript-block transcript-block-${entry.role}`}
          key={`${entry.timestamp}-${entry.role}-${index}`}
          title={formatTimestamp(entry.timestamp)}
        >
          {entry.role === 'thinking' ? (
            <header className="terminal-line-header transcript-block-header">
              <span className={`event-chip ${entry.role}`}>thinking</span>
            </header>
          ) : null}
          <pre className="terminal-line-body transcript-block-body">{entry.text}</pre>
        </article>
      ))}
    </div>
  );
}
