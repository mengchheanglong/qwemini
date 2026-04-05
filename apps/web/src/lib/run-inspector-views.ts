import type { RunViewState } from './run-view-state.js';

type RunEvent = RunViewState['events'][number];
type RunSummary = RunViewState['selectedRun'];

export type RunDeltaEvent = RunEvent & {
  type: 'run.output.delta';
  payload?: {
    stream?: unknown;
    text?: unknown;
  };
};

export type RunMessageEvent = RunEvent & {
  type: 'message.created';
  payload?: {
    content?: unknown;
    role?: unknown;
  };
};

export type ConversationRole = 'user' | 'assistant' | 'thinking' | 'system';

export type ConversationBlock = {
  role: ConversationRole;
  text: string;
  timestamp: string;
};

export type SplitRunInspectorViews = {
  deltas: RunDeltaEvent[];
  messages: RunMessageEvent[];
  timeline: RunEvent[];
};

export function splitRunInspectorViews(events: RunEvent[]): SplitRunInspectorViews {
  const deltas: RunDeltaEvent[] = [];
  const messages: RunMessageEvent[] = [];
  const timeline: RunEvent[] = [];

  for (const event of events) {
    if (event.type === 'run.output.delta') {
      deltas.push(event as RunDeltaEvent);
      continue;
    }

    if (
      event.type === 'message.created' &&
      typeof (event.payload as { content?: unknown } | undefined)?.content === 'string'
    ) {
      messages.push(event as RunMessageEvent);
      continue;
    }

    timeline.push(event);
  }

  return {
    deltas,
    messages,
    timeline,
  };
}

function normalizeDeltaRole(event: RunDeltaEvent): ConversationRole {
  const stream =
    typeof event.payload?.stream === 'string'
      ? event.payload.stream.toLowerCase()
      : 'system';
  if (stream === 'assistant') {
    return 'assistant';
  }
  if (stream === 'thinking') {
    return 'thinking';
  }
  return 'system';
}

function pushConversationBlock(
  blocks: ConversationBlock[],
  role: ConversationRole,
  text: string,
  timestamp: string,
) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  const previous = blocks.at(-1);
  if (previous && previous.role === role) {
    previous.text += text;
    previous.timestamp = timestamp;
    return;
  }

  blocks.push({
    role,
    text,
    timestamp,
  });
}

export function buildConversationBlocks(
  selectedRun: RunSummary,
  deltas: RunDeltaEvent[],
  messages: RunMessageEvent[],
): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];

  if (selectedRun?.prompt?.trim()) {
    blocks.push({
      role: 'user',
      text: selectedRun.prompt.trim(),
      timestamp: selectedRun.createdAt,
    });
  }

  for (const event of deltas) {
    const text =
      typeof event.payload?.text === 'string'
        ? event.payload.text
        : JSON.stringify(event.payload ?? {});
    pushConversationBlock(blocks, normalizeDeltaRole(event), text, event.timestamp);
  }

  if (messages.length > 0) {
    const finalMessage = messages[messages.length - 1];
    const content =
      typeof finalMessage.payload?.content === 'string'
        ? finalMessage.payload.content.trim()
        : '';
    if (content) {
      const lastAssistantIndex = [...blocks]
        .reverse()
        .findIndex((entry) => entry.role === 'assistant');
      if (lastAssistantIndex !== -1) {
        const absoluteIndex = blocks.length - 1 - lastAssistantIndex;
        blocks[absoluteIndex] = {
          role: 'assistant',
          text: content,
          timestamp: finalMessage.timestamp,
        };
      } else {
        blocks.push({
          role: 'assistant',
          text: content,
          timestamp: finalMessage.timestamp,
        });
      }
    }
  }

  return blocks.map((block) => ({
    ...block,
    text: block.text.replace(/\n{3,}/g, '\n\n').trim(),
  }));
}
