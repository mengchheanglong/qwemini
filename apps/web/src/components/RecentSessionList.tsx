import { useEffect, useState } from 'react';
import type { ShellPanelsState } from '../lib/shell-panels-state';
import { EmptyState } from './EmptyState';

type RecentSessionListProps = {
  sessions: ShellPanelsState['recentSessions'];
  selectedSessionId: string | null;
  emptyMessage: string;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
};

function getWorkspaceLabel(workspacePath: string) {
  const segments = workspacePath.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? workspacePath;
}

function getThreadTitle(session: ShellPanelsState['recentSessions'][number]) {
  const prompt = session.latestRunPrompt?.trim();
  if (prompt) {
    return prompt.length > 34 ? `${prompt.slice(0, 34)}...` : prompt;
  }

  if (session.recovery) {
    return 'Recovered thread';
  }

  if (session.orchestration) {
    return `${session.orchestration.role} thread`;
  }

  return 'New thread';
}

export function RecentSessionList({
  sessions,
  selectedSessionId,
  emptyMessage,
  onSelectSession,
  onDeleteSession,
}: RecentSessionListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [openMenuSessionId, setOpenMenuSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuSessionId) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (target.closest('.session-item-menu-shell')) {
        return;
      }

      setOpenMenuSessionId(null);
    }

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [openMenuSessionId]);

  if (sessions.length === 0) {
    return <EmptyState title="No sessions yet" message={emptyMessage} />;
  }

  const groupedSessions = sessions.reduce<
    Array<{
      workspacePath: string;
      workspaceLabel: string;
      sessions: ShellPanelsState['recentSessions'];
    }>
  >((groups, session) => {
    const existing = groups.find((entry) => entry.workspacePath === session.workspacePath);
    if (existing) {
      existing.sessions.push(session);
      return groups;
    }

    groups.push({
      workspacePath: session.workspacePath,
      workspaceLabel: getWorkspaceLabel(session.workspacePath),
      sessions: [session],
    });
    return groups;
  }, []);

  return (
    <>
      {groupedSessions.map((group) => (
        <section key={group.workspacePath} className="rail-project-group">
          <button
            type="button"
            className="rail-project-header"
            aria-expanded={!collapsedGroups[group.workspacePath]}
            onClick={() => {
              setCollapsedGroups((current) => ({
                ...current,
                [group.workspacePath]: !current[group.workspacePath],
              }));
            }}
          >
            <span
              className={`rail-project-caret${
                collapsedGroups[group.workspacePath] ? ' is-collapsed' : ''
              }`}
              aria-hidden="true"
            >
              ▾
            </span>
            <span className="rail-project-icon" aria-hidden="true">
              ⌂
            </span>
            <span className="rail-project-name">{group.workspaceLabel}</span>
          </button>

          {!collapsedGroups[group.workspacePath] ? (
            <div className="rail-project-threads">
              {group.sessions.map((session) => (
                <div key={session.id} className="rail-session-row">
                  <button
                    type="button"
                    title={session.workspacePath}
                    className={`session-item sb-project qw-session-row ${
                      selectedSessionId === session.id ? 'active sb-project-active' : ''
                    }`}
                    onClick={() => {
                      onSelectSession(session.id);
                    }}
                  >
                    <div className="session-item-head qw-session-row-head sidebar-item-title-row">
                      <strong className="sb-project-name">{getThreadTitle(session)}</strong>
                    </div>
                  </button>

                  <div
                    className={`session-item-menu-shell${
                      openMenuSessionId === session.id ? ' open' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="session-item-menu-trigger"
                      aria-label={`Thread menu for ${getThreadTitle(session)}`}
                      title="Thread actions"
                      aria-expanded={openMenuSessionId === session.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenuSessionId((current) =>
                          current === session.id ? null : session.id,
                        );
                      }}
                    >
                      …
                    </button>
                    <div
                      className="session-item-menu-popover"
                      hidden={openMenuSessionId !== session.id}
                    >
                      <button
                        type="button"
                        className="session-item-menu-action"
                        onClick={() => {
                          setOpenMenuSessionId(null);
                          onDeleteSession(session.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </>
  );
}
