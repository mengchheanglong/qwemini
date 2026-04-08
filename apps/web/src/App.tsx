import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type {
  ApprovalPolicy,
  ProviderId,
  RoutingToolRequirement,
} from '@qwemini/protocol';
import {
  initializeShell,
  requestApprovalResolution,
  requestApplySelectedSessionPolicy,
  requestCancelSelectedRun,
  requestCheckpointRecovery,
  requestCreateSession,
  requestDelegatePrompt,
  requestDelegateRoleChange,
  requestFollowUpRun,
  requestHandoffPrompt,
  requestPromptDraftChange,
  requestRecoverSelectedSession,
  requestSessionDelete,
  requestRoutePrompt,
  requestRoutingToolsDraftChange,
  requestRunSelection,
  requestSelectedSessionPolicyDraftChange,
  requestSessionDraftChange,
  requestSessionSelection,
  requestStartRun,
  requestWorkspaceDraftCommit,
  subscribeShellControlsState,
  subscribeShellPanelsState,
  subscribeShellSummaryState,
  subscribeRunViewState,
} from './app-controller';
import { ApprovalListPanel } from './components/ApprovalListPanel';
import { ArchiveSessionList } from './components/ArchiveSessionList';
import { ArtifactListPanel } from './components/ArtifactListPanel';
import { CheckpointListPanel } from './components/CheckpointListPanel';
import { OrchestrationFlowBoard } from './components/OrchestrationFlowBoard';
import { QuickOpen } from './components/QuickOpen';
import { RecentSessionList } from './components/RecentSessionList';
import { RunHistoryList } from './components/RunHistoryList';
import { RunTimelinePanel } from './components/RunTimelinePanel';
import { RunTranscriptPanel } from './components/RunTranscriptPanel';
import { TabBar } from './components/TabBar';
import { ToolActivityList } from './components/ToolActivityList';
import { ToolRegistrationEvidenceList } from './components/ToolRegistrationEvidenceList';
import { WorkspaceFilePanel } from './components/WorkspaceFilePanel';
import { splitRunInspectorViews } from './lib/run-inspector-views';
import {
  emptyRunViewState,
  type RunViewState,
} from './lib/run-view-state';
import {
  type DelegateRole,
  emptyShellControlsState,
  type ShellControlsState,
} from './lib/shell-controls-state';
import {
  emptyShellPanelsState,
  type ShellPanelsState,
} from './lib/shell-panels-state';
import {
  emptyShellSummaryState,
  type ShellSummaryState,
} from './lib/shell-summary-state';
import { useShellLayout } from './lib/use-shell-layout';
import { useAutoResizeTextarea } from './lib/use-auto-resize-textarea';
import {
  formatRunStatus,
  formatSessionOrchestration,
  formatSessionRecovery,
  formatTimestamp,
} from './shell-status-summary.js';
import { getWorkspaceLabel, summarizePrompt } from './lib/quick-open-helpers.js';
import { buildQuickOpenItems } from './lib/quick-open-items.js';

type RailView = 'recent' | 'history' | 'archive' | 'flows';
type RunViewTab = 'chat' | 'timeline';
type UtilityView = 'approvals' | 'tools' | 'files' | 'artifacts' | 'checkpoints';
const UTILITY_COLLAPSED_KEY = 'qwemini:utility-collapsed';

const RAIL_VIEW_ORDER: RailView[] = ['recent', 'history', 'archive', 'flows'];
const RUN_VIEW_ORDER: RunViewTab[] = ['chat', 'timeline'];
const UTILITY_VIEW_ORDER: UtilityView[] = [
  'approvals',
  'tools',
  'files',
  'artifacts',
  'checkpoints',
];
const ROUTING_TOOL_OPTIONS: RoutingToolRequirement[] = [
  'workspace-read',
  'workspace-write',
  'shell',
  'network',
  'mcp',
];

function parseProviderId(value: string): ProviderId {
  return value === 'gemini' ? 'gemini' : 'qwen';
}

function parseApprovalPolicy(value: string): ApprovalPolicy {
  return value === 'allow' || value === 'deny' ? value : 'manual';
}

function parseDelegateRole(value: string): DelegateRole {
  return value === 'researcher' || value === 'reviewer' || value === 'verifier'
    ? value
    : 'planner';
}

function getRailSectionLabel(view: RailView) {
  if (view === 'history') {
    return 'Runs';
  }
  if (view === 'archive') {
    return 'Archived';
  }
  if (view === 'flows') {
    return 'Agents';
  }
  return 'Threads';
}

function cycleValue<T extends string>(
  values: readonly T[],
  current: T,
  direction: 1 | -1,
) {
  const currentIndex = values.indexOf(current);
  if (currentIndex === -1) {
    return values[0];
  }
  const nextIndex = (currentIndex + direction + values.length) % values.length;
  return values[nextIndex];
}

function readInitialUtilityCollapsed() {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(UTILITY_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  );
}

function includesSearch(value: string, needle: string): boolean {
  if (!needle) {
    return true;
  }

  return value.toLowerCase().includes(needle);
}

export default function App() {
  const [runViewState, setRunViewState] = useState<RunViewState>(
    emptyRunViewState,
  );
  const [shellControlsState, setShellControlsState] =
    useState<ShellControlsState>(emptyShellControlsState);
  const [shellPanelsState, setShellPanelsState] =
    useState<ShellPanelsState>(emptyShellPanelsState);
  const [shellSummaryState, setShellSummaryState] =
    useState<ShellSummaryState>(emptyShellSummaryState);
  const [railView, setRailView] = useState<RailView>('recent');
  const [runViewTab, setRunViewTab] = useState<RunViewTab>('chat');
  const [utilityView, setUtilityView] = useState<UtilityView>('approvals');
  const [utilityCollapsed, setUtilityCollapsed] = useState(() =>
    readInitialUtilityCollapsed(),
  );
  const [focusView, setFocusView] = useState(false);
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [showSessionSetup, setShowSessionSetup] = useState(false);
  const [showRunToolbar, setShowRunToolbar] = useState(true);
  const [railFilter, setRailFilter] = useState('');
  const { textareaRef, autoResize } = useAutoResizeTextarea();
  const railFilterInputRef = useRef<HTMLInputElement | null>(null);
  const composerPlusMenuRef = useRef<HTMLDetailsElement | null>(null);
  const composerProviderMenuRef = useRef<HTMLDetailsElement | null>(null);
  const composerAccessMenuRef = useRef<HTMLDetailsElement | null>(null);
  const {
    leftColumnWidth,
    rightColumnWidth,
    startLeftResize,
    startRightResize,
  } = useShellLayout();

  const inspectorViews = useMemo(
    () => splitRunInspectorViews(runViewState.events),
    [runViewState.events],
  );

  useEffect(() => {
    const unsubscribeRunView = subscribeRunViewState((nextState) => {
      setRunViewState(nextState);
    });
    const unsubscribeShellControls = subscribeShellControlsState((nextState) => {
      setShellControlsState(nextState);
    });
    const unsubscribeShellPanels = subscribeShellPanelsState((nextState) => {
      setShellPanelsState(nextState);
    });
    const unsubscribeShellSummary = subscribeShellSummaryState((nextState) => {
      setShellSummaryState(nextState);
    });

    void initializeShell();

    return () => {
      unsubscribeRunView();
      unsubscribeShellControls();
      unsubscribeShellPanels();
      unsubscribeShellSummary();
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        UTILITY_COLLAPSED_KEY,
        utilityCollapsed ? 'true' : 'false',
      );
    } catch {}
  }, [utilityCollapsed]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMetaKey = event.metaKey || event.ctrlKey;

      if (
        !isMetaKey &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === '/' &&
        !isEditableTarget(event.target)
      ) {
        event.preventDefault();
        railFilterInputRef.current?.focus();
        railFilterInputRef.current?.select();
        return;
      }

      if (isMetaKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setQuickOpenVisible((current) => !current);
        return;
      }

      if (isMetaKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFocusView((current) => !current);
        return;
      }

      if (isMetaKey && event.shiftKey && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        focusComposer();
        return;
      }

      if (isMetaKey && event.key === '\\') {
        event.preventDefault();
        setUtilityCollapsed((current) => !current);
        return;
      }

      if (isMetaKey && event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        setRailView((current) => cycleValue(RAIL_VIEW_ORDER, current, -1));
        return;
      }

      if (isMetaKey && event.shiftKey && event.key === 'ArrowUp') {
        event.preventDefault();
        setRunViewTab((current) => cycleValue(RUN_VIEW_ORDER, current, -1));
        return;
      }

      if (isMetaKey && event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault();
        setUtilityCollapsed(false);
        setUtilityView((current) => cycleValue(UTILITY_VIEW_ORDER, current, 1));
        return;
      }

      if (event.key === 'Escape') {
        setQuickOpenVisible(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [utilityCollapsed]);

  const normalizedRailFilter = railFilter.trim().toLowerCase();

  const filteredRecentSessions = useMemo(
    () =>
      shellPanelsState.recentSessions.filter((session) => {
        const haystack = [
          session.id,
          session.workspacePath,
          session.providerId,
          session.approvalPolicy,
          session.latestRunPrompt ?? '',
          session.orchestration?.kind ?? '',
          session.orchestration?.role ?? '',
          session.recovery?.kind ?? '',
        ].join(' ');
        return includesSearch(haystack, normalizedRailFilter);
      }),
    [shellPanelsState.recentSessions, normalizedRailFilter],
  );

  const filteredRuns = useMemo(
    () =>
      runViewState.runs.filter((run) => {
        const haystack = [run.id, run.status, run.prompt, run.createdAt].join(' ');
        return includesSearch(haystack, normalizedRailFilter);
      }),
    [runViewState.runs, normalizedRailFilter],
  );

  const filteredArchiveSessions = useMemo(
    () =>
      shellPanelsState.archiveSessions.filter((summary) => {
        const haystack = [
          summary.session.id,
          summary.session.workspacePath,
          summary.session.providerId,
          summary.session.approvalPolicy,
          summary.latestRun?.prompt ?? '',
          summary.latestRun?.status ?? '',
          summary.session.orchestration?.kind ?? '',
          summary.session.orchestration?.role ?? '',
          summary.session.recovery?.kind ?? '',
        ].join(' ');
        return includesSearch(haystack, normalizedRailFilter);
      }),
    [shellPanelsState.archiveSessions, normalizedRailFilter],
  );

  const filteredOrchestrationFlows = useMemo(
    () =>
      shellPanelsState.orchestrationFlows.filter((flow) => {
        const rootHaystack = [
          flow.rootSession.id,
          flow.rootSession.workspacePath,
          flow.rootSession.providerId,
          flow.rootSession.approvalPolicy,
          flow.rootLatestRun?.prompt ?? '',
          flow.rootLatestRun?.status ?? '',
        ].join(' ');

        if (includesSearch(rootHaystack, normalizedRailFilter)) {
          return true;
        }

        return flow.sessions.some((summary) => {
          const sessionHaystack = [
            summary.session.id,
            summary.session.workspacePath,
            summary.session.providerId,
            summary.session.approvalPolicy,
            summary.session.orchestration?.kind ?? '',
            summary.session.orchestration?.role ?? '',
            summary.latestRun?.prompt ?? '',
            summary.latestRun?.status ?? '',
          ].join(' ');
          return includesSearch(sessionHaystack, normalizedRailFilter);
        });
      }),
    [shellPanelsState.orchestrationFlows, normalizedRailFilter],
  );

  const shellStyle = useMemo(
    () =>
      ({
        '--left-column-width': `${leftColumnWidth}px`,
        '--right-column-width': `${rightColumnWidth}px`,
      }) as CSSProperties,
    [leftColumnWidth, rightColumnWidth],
  );

  const railTabs = useMemo(
    () => [
      { id: 'recent' as const, label: 'Recent', badge: filteredRecentSessions.length },
      { id: 'history' as const, label: 'Runs', badge: filteredRuns.length },
      { id: 'archive' as const, label: 'Archive', badge: filteredArchiveSessions.length },
      { id: 'flows' as const, label: 'Flows', badge: filteredOrchestrationFlows.length },
    ],
    [
      filteredArchiveSessions.length,
      filteredOrchestrationFlows.length,
      filteredRecentSessions.length,
      filteredRuns.length,
    ],
  );

  const runTabs = useMemo(
    () => [
      {
        id: 'chat' as const,
        label: 'Thread',
      },
      {
        id: 'timeline' as const,
        label: 'Events',
        badge: inspectorViews.timeline.length,
      },
    ],
    [inspectorViews.timeline.length],
  );

  const utilityTabs = useMemo(
    () => [
      {
        id: 'approvals' as const,
        label: 'Approvals',
        badge: shellPanelsState.approvals.length,
      },
      {
        id: 'tools' as const,
        label: 'Tools',
        badge: shellPanelsState.tools.length,
      },
      {
        id: 'files' as const,
        label: 'Files',
      },
      {
        id: 'artifacts' as const,
        label: 'Artifacts',
        badge: shellPanelsState.artifacts.length,
      },
      {
        id: 'checkpoints' as const,
        label: 'Checkpoints',
        badge: shellPanelsState.checkpoints.length,
      },
    ],
    [
      shellPanelsState.approvals.length,
      shellPanelsState.artifacts.length,
      shellPanelsState.checkpoints.length,
      shellPanelsState.tools.length,
    ],
  );
  const activeRunId = runViewState.selectedRun?.id?.slice(0, 8) ?? 'none';
  const activeSessionId =
    shellPanelsState.selectedSessionId?.slice(0, 8) ?? 'none';
  const hasActiveSession = Boolean(shellPanelsState.selectedSessionId);
  const hasActiveRun = Boolean(runViewState.selectedRun);
  const hasPromptDraft = shellControlsState.prompt.trim().length > 0;
  const conversationTitle = hasActiveSession ? shellSummaryState.runTitle : 'New chat';
  const conversationWorkspace = shellControlsState.workspacePath
    ? getWorkspaceLabel(shellControlsState.workspacePath)
    : 'Workspace';
  const menuWorkspaceContext = useMemo(() => {
    const normalized = shellControlsState.workspacePath.trim();
    if (!normalized) {
      return conversationWorkspace;
    }

    const segments = normalized.split(/[\\/]/).filter(Boolean);
    const leaf = segments.at(-1) ?? normalized;
    const parent = segments.at(-2) ?? null;
    if (leaf.toLowerCase() === 'qwemini' && parent) {
      return `${parent}/${leaf}`;
    }

    return leaf;
  }, [shellControlsState.workspacePath, conversationWorkspace]);
  const activeProviderId =
    shellPanelsState.selectedProviderId ?? shellControlsState.providerId;
  const activeApprovalPolicy = hasActiveSession
    ? shellControlsState.selectedSessionApprovalPolicy
    : shellControlsState.sessionApprovalPolicy;
  const composerPlaceholder = hasActiveSession
    ? 'Ask for follow-up changes'
    : 'Ask Qwemini to work on this workspace';
  const sendHelperPrimary = hasActiveSession
    ? 'Enter to send'
    : 'Enter to send and create the session';
  const sendHelperSecondary = 'Shift+Enter adds a new line';
  const composerHint = shellControlsState.promptDisabled
    ? 'Choose an available provider to enable the composer.'
    : !shellControlsState.workspacePath.trim()
      ? 'Set a workspace path in the left rail to enable send.'
      : hasPromptDraft
        ? `${sendHelperPrimary}. ${sendHelperSecondary}.`
        : 'Type a message below, then press Enter or click Send.';

  function focusComposer() {
    const promptInput = document.querySelector(
      '#prompt-input',
    ) as HTMLTextAreaElement | null;
    promptInput?.focus();
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (shellControlsState.startRunDisabled) {
      return;
    }

    void requestStartRun();
  }

  function closeComposerPlusMenu() {
    if (composerPlusMenuRef.current) {
      composerPlusMenuRef.current.open = false;
    }
  }

  function closeComposerProviderMenu() {
    if (composerProviderMenuRef.current) {
      composerProviderMenuRef.current.open = false;
    }
  }

  function closeComposerAccessMenu() {
    if (composerAccessMenuRef.current) {
      composerAccessMenuRef.current.open = false;
    }
  }

  function handleAddFolderToRail() {
    const nextWorkspacePathInput = window.prompt('Folder path');
    if (!nextWorkspacePathInput) {
      return;
    }

    const nextWorkspacePath = nextWorkspacePathInput.trim();
    if (!nextWorkspacePath) {
      return;
    }

    void (async () => {
      await requestSessionDraftChange({ workspacePath: nextWorkspacePath });
      await requestWorkspaceDraftCommit();
      await requestCreateSession();
    })();
  }

  function renderRoutingToolLabel(tool: RoutingToolRequirement) {
    if (tool === 'workspace-read') {
      return 'Workspace Read';
    }
    if (tool === 'workspace-write') {
      return 'Workspace Write';
    }
    if (tool === 'shell') {
      return 'Shell';
    }
    if (tool === 'network') {
      return 'Network';
    }
    return 'MCP';
  }

  function renderProviderLabel(providerId: ProviderId) {
    return providerId === 'gemini' ? 'Gemini' : 'Qwen';
  }

  function renderAccessLabel(policy: ApprovalPolicy) {
    if (policy === 'allow') {
      return 'Full access';
    }
    if (policy === 'deny') {
      return 'Read only';
    }
    return 'Ask first';
  }

  function handleComposerPolicyChange(value: string) {
    const nextPolicy = parseApprovalPolicy(value);
    if (hasActiveSession) {
      void requestSelectedSessionPolicyDraftChange(nextPolicy).then(() => {
        void requestApplySelectedSessionPolicy();
      });
      return;
    }

    void requestSessionDraftChange({
      sessionApprovalPolicy: nextPolicy,
    });
  }

  const quickOpenItems = useMemo(
    () => buildQuickOpenItems({
      setRailView,
      setRunViewTab,
      setUtilityView,
      setUtilityCollapsed,
      setFocusView,
      focusComposer,
      requestCreateSession,
      requestStartRun,
      requestRoutePrompt,
      requestDelegatePrompt,
      requestHandoffPrompt,
      requestRecoverSelectedSession,
      requestCancelSelectedRun,
      requestFollowUpRun,
      requestApplySelectedSessionPolicy,
      requestSessionSelection,
      requestRunSelection,
      shellControlsState,
      shellPanelsState,
      runViewState,
      focusView,
      utilityCollapsed,
    }),
    [
      activeRunId,
      activeSessionId,
      focusView,
      runViewState.runs,
      shellControlsState,
      shellPanelsState.recentSessions,
      utilityCollapsed,
    ],
  ); return (
    <div className="shell app-shell">
      <div
        id="toast-container"
        className="toast-container"
        aria-live="polite"
        aria-atomic="true"
      ></div>

      <QuickOpen
        open={quickOpenVisible}
        items={quickOpenItems}
        onClose={() => {
          setQuickOpenVisible(false);
        }}
      />

      <header className="app-menu-bar">
        <div className="app-menu-cluster app-menu-cluster-center">
          <div className="app-menu-logo" aria-hidden="true">
            <img src="/qwemini-mark.svg" alt="" className="app-menu-logo-mark" />
          </div>
          <span className="app-menu-brand">qwemini</span>
          <span className="app-menu-context">{menuWorkspaceContext}</span>
        </div>
        <span
          id="daemon-connection-indicator"
          className="app-menu-status daemon-conn-connecting"
          title="Connecting to daemon…"
        >
          connecting…
        </span>
      </header>

      <section
        className={`workbench-shell panes-workbench${focusView ? ' workbench-shell-focus' : ''}`}
        style={shellStyle}
      >
        <aside className="workspace-column panes-sidebar">
          <div className="sidebar-top">
            <div className="sidebar-brand-block">
              <div className="sidebar-brand-row">
                <p className="sidebar-label">QWEMINI</p>
                <button
                  type="button"
                  className={`sidebar-pin-button${showSessionSetup ? ' active' : ''}`}
                  onClick={() => {
                    setShowSessionSetup((current) => !current);
                  }}
                  aria-label={showSessionSetup ? 'Hide session setup' : 'Show session setup'}
                  title={showSessionSetup ? 'Hide session setup' : 'Show session setup'}
                >
                  {showSessionSetup ? '−' : '+'}
                </button>
              </div>
              <div className="sidebar-action-stack">
                <button
                  type="button"
                  className="sidebar-primary-button"
                  onClick={() => {
                    void requestCreateSession();
                  }}
                >
                  New thread
                </button>
                <button
                  type="button"
                  className="sidebar-mode-button"
                  onClick={() => {
                    handleAddFolderToRail();
                  }}
                >
                  Add folder
                </button>
              </div>
            </div>
          </div>

          {showSessionSetup ? (
            <form
              id="session-form"
              className="session-dock panes-session-dock panes-session-dock-compact"
              onSubmit={(event) => {
                event.preventDefault();
                void requestCreateSession();
              }}
            >
              <label className="session-field session-field-workspace">
                <span>Workspace</span>
                <input
                  id="workspace-path"
                  name="workspacePath"
                  type="text"
                  required
                  value={shellControlsState.workspacePath}
                  onChange={(event) => {
                    void requestSessionDraftChange({
                      workspacePath: event.target.value,
                    });
                  }}
                  onBlur={() => {
                    void requestWorkspaceDraftCommit();
                  }}
                />
              </label>

              <div className="session-dock-grid">
                <label className="session-field">
                  <span>Provider</span>
                  <select
                    id="provider-id"
                    name="providerId"
                    value={shellControlsState.providerId}
                    onChange={(event) => {
                      void requestSessionDraftChange({
                        providerId: parseProviderId(event.target.value),
                      });
                    }}
                  >
                    <option value="qwen">Qwen</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </label>

                <label className="session-field">
                  <span>Policy</span>
                  <select
                    id="session-approval-policy-input"
                    name="approvalPolicy"
                    value={shellControlsState.sessionApprovalPolicy}
                    disabled={shellControlsState.sessionApprovalPolicyDisabled}
                    onChange={(event) => {
                      void requestSessionDraftChange({
                        sessionApprovalPolicy: parseApprovalPolicy(event.target.value),
                      });
                    }}
                  >
                    <option value="manual">Manual</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </label>
              </div>

              <p id="session-provider-note" className="chip-note session-dock-hint">
                {shellSummaryState.sessionProviderNote}
              </p>

              <div className="session-dock-actions">
                <button type="submit">Create Session</button>
              </div>
            </form>
          ) : null}

          <div className="rail-section panes-sidebar-section">
            <div className="sidebar-section-header">
              <span className="sidebar-section-label">{getRailSectionLabel(railView)}</span>
              <button
                type="button"
                className="sidebar-section-action"
                onClick={() => {
                  if (railView === 'recent') {
                    setShowSessionSetup((current) => !current);
                    return;
                  }
                  setRailView('recent');
                }}
              >
                {railView === 'recent' ? (showSessionSetup ? 'Hide setup' : 'Setup') : 'Back'}
              </button>
            </div>

            <div className="rail-filter-row">
              <input
                ref={railFilterInputRef}
                type="search"
                className="rail-filter-input"
                value={railFilter}
                placeholder={`Filter ${getRailSectionLabel(railView).toLowerCase()}...`}
                aria-label="Filter rail items"
                onChange={(event) => {
                  setRailFilter(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && railFilter) {
                    event.preventDefault();
                    setRailFilter('');
                  }
                }}
              />
              {railFilter ? (
                <button
                  type="button"
                  className="rail-filter-clear"
                  onClick={() => {
                    setRailFilter('');
                    railFilterInputRef.current?.focus();
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="section-scroll dock-scroll">
              {railView === 'recent' ? (
                <div id="session-list" className="list rail-list">
                  <RecentSessionList
                    sessions={filteredRecentSessions}
                    selectedSessionId={shellPanelsState.selectedSessionId}
                    emptyMessage={
                      normalizedRailFilter
                        ? `No threads match "${railFilter.trim()}".`
                        : shellPanelsState.recentSessionsMessage ?? 'No sessions yet.'
                    }
                    onSelectSession={(sessionId) => {
                      void requestSessionSelection(sessionId);
                    }}
                    onDeleteWorkspaceGroup={(workspacePath) => {
                      const sessionsInWorkspace = shellPanelsState.recentSessions.filter(
                        (session) => session.workspacePath === workspacePath,
                      );
                      if (sessionsInWorkspace.length === 0) {
                        return;
                      }

                      const confirmed = window.confirm(
                        `Delete folder group \"${workspacePath}\" and ${sessionsInWorkspace.length} thread(s)?`,
                      );
                      if (!confirmed) {
                        return;
                      }

                      void (async () => {
                        for (const session of sessionsInWorkspace) {
                          await requestSessionDelete(session.id);
                        }
                      })();
                    }}
                    onDeleteSession={(sessionId) => {
                      void requestSessionDelete(sessionId);
                    }}
                  />
                </div>
              ) : null}

              {railView === 'history' ? (
                <div id="run-history-list" className="list rail-list compact">
                  <RunHistoryList
                    selectedSessionId={runViewState.selectedSessionId}
                    runs={filteredRuns}
                    selectedRunId={runViewState.selectedRun?.id ?? null}
                    emptyMessage={
                      normalizedRailFilter
                        ? `No runs match "${railFilter.trim()}".`
                        : undefined
                    }
                    formatRunStatus={formatRunStatus}
                    formatTimestamp={formatTimestamp}
                    onSelectRun={(runId) => {
                      void requestRunSelection(runId);
                    }}
                  />
                </div>
              ) : null}

              {railView === 'archive' ? (
                <div id="archive-list" className="list rail-list compact">
                  <ArchiveSessionList
                    archiveSessions={filteredArchiveSessions}
                    selectedSessionId={shellPanelsState.selectedSessionId}
                    emptyMessage={
                      normalizedRailFilter
                        ? `No archived sessions match "${railFilter.trim()}".`
                        : undefined
                    }
                    formatRunStatus={formatRunStatus}
                    formatSessionOrchestration={formatSessionOrchestration}
                    formatSessionRecovery={formatSessionRecovery}
                    onSelectSession={(sessionId) => {
                      void requestSessionSelection(sessionId);
                    }}
                  />
                </div>
              ) : null}

              {railView === 'flows' ? (
                <div id="orchestration-board" className="list rail-list compact">
                  <OrchestrationFlowBoard
                    orchestrationFlows={filteredOrchestrationFlows}
                    selectedSessionId={shellPanelsState.selectedSessionId}
                    emptyMessage={
                      normalizedRailFilter
                        ? `No flows match "${railFilter.trim()}".`
                        : undefined
                    }
                    formatTimestamp={formatTimestamp}
                    formatRunStatus={formatRunStatus}
                    onSelectSession={(sessionId) => {
                      void requestSessionSelection(sessionId);
                    }}
                  />
                </div>
              ) : null}

              <div className="sidebar-nav-group">
                {railTabs
                  .filter((item) => item.id !== railView)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="sidebar-nav-row"
                      onClick={() => {
                        setRailView(item.id);
                      }}
                    >
                      <span>{getRailSectionLabel(item.id)}</span>
                      <span className="sidebar-nav-count">{item.badge ?? 0}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </aside>

        <div
          className="column-resize-handle dock-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize session column"
          onMouseDown={startLeftResize}
        ></div>

        <div
          className={`content-shell panel${focusView ? ' content-shell-focus' : ''}${
            utilityCollapsed ? ' content-shell-utility-collapsed' : ''
          }`}
        >
          <main className="run-column panes-main">
            <header className="conversation-header">
              <div className="conversation-header-copy">
                <div className="conversation-breadcrumbs">
                  <span>{conversationWorkspace}</span>
                  <span>/</span>
                  <strong id="run-title">{conversationTitle}</strong>
                  {hasActiveSession ? (
                    <span className="conversation-badge">+{runViewState.runs.length} runs</span>
                  ) : null}
                  {!hasActiveSession ? (
                    <span className="conversation-inline-note" id="selected-session-note">
                      Open a folder and send a message to begin.
                    </span>
                  ) : null}
                </div>
                {hasActiveSession ? (
                  <div className="conversation-subline conversation-subline-compact">
                    <span id="selected-session-note">{shellSummaryState.selectedSessionNote}</span>
                    <span id="tool-plane-note">{shellSummaryState.toolPlaneNote}</span>
                  </div>
                ) : null}
              </div>
              <div className="conversation-header-actions">
                <button
                  type="button"
                  className="header-icon-button"
                  title="Quick open"
                  aria-label="Quick open"
                  onClick={() => {
                    setQuickOpenVisible(true);
                  }}
                >
                  <span className="header-glyph header-glyph-search" aria-hidden="true"></span>
                </button>
                <button
                  type="button"
                  className={`header-icon-button${!utilityCollapsed ? ' active' : ''}`}
                  title={utilityCollapsed ? 'Open right rail' : 'Hide right rail'}
                  aria-label={utilityCollapsed ? 'Open right rail' : 'Hide right rail'}
                  aria-pressed={!utilityCollapsed}
                  onClick={() => {
                    setUtilityCollapsed((current) => !current);
                  }}
                >
                  <span className="header-glyph header-glyph-inspector" aria-hidden="true"></span>
                </button>
              </div>
            </header>

            {hasActiveSession && showRunToolbar ? (
              <div className="action-row run-toolbar panes-toolbar">
                <div className="run-toolbar-group">
                  <button
                    id="resume-session-button"
                    type="button"
                    className="secondary-button"
                    disabled={shellControlsState.resumeSessionDisabled}
                    onClick={() => {
                      void requestRecoverSelectedSession();
                    }}
                    title="Recover session (via action menu)"
                  >
                    Recover
                  </button>
                  <select
                    id="session-approval-policy-select"
                    className="secondary-select"
                    value={shellControlsState.selectedSessionApprovalPolicy}
                    disabled={shellControlsState.selectedSessionApprovalPolicyDisabled}
                    onChange={(event) => {
                      void requestSelectedSessionPolicyDraftChange(
                        parseApprovalPolicy(event.target.value),
                      );
                    }}
                    title="Switch approval policy"
                  >
                    <option value="manual">Manual</option>
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                  <button
                    id="apply-session-policy-button"
                    type="button"
                    className="secondary-button"
                    disabled={shellControlsState.applySelectedSessionPolicyDisabled}
                    onClick={() => {
                      void requestApplySelectedSessionPolicy();
                    }}
                    title="Pin current approval policy to session"
                  >
                    Apply
                  </button>
                </div>
                <div className="run-toolbar-group">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setUtilityView('files');
                      setUtilityCollapsed(false);
                    }}
                    title="Open files panel"
                  >
                    Files
                  </button>
                  <button
                    id="cancel-run-button"
                    type="button"
                    className="secondary-button"
                    disabled={shellControlsState.cancelRunDisabled}
                    onClick={() => {
                      void requestCancelSelectedRun();
                    }}
                    title="Stop the active run"
                  >
                    Cancel
                  </button>
                  <button
                    id="review-run-button"
                    type="button"
                    className="secondary-button"
                    disabled={shellControlsState.reviewRunDisabled}
                    onClick={() => {
                      void requestFollowUpRun('review');
                    }}
                    title="Fork into a reviewer session"
                  >
                    Review
                  </button>
                  <button
                    id="verify-run-button"
                    type="button"
                    className="secondary-button"
                    disabled={shellControlsState.verifyRunDisabled}
                    onClick={() => {
                      void requestFollowUpRun('verify');
                    }}
                    title="Fork into a verifier session"
                  >
                    Verify
                  </button>
                  <button
                    type="button"
                    className="secondary-button run-toolbar-close-button"
                    onClick={() => {
                      setShowRunToolbar(false);
                    }}
                    title="Hide run controls"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}

            {hasActiveSession && !showRunToolbar ? (
              <div className="action-row run-toolbar-compact">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setShowRunToolbar(true);
                  }}
                >
                  Show controls
                </button>
              </div>
            ) : null}

            <section className="run-surface panes-run-surface">
              {hasActiveSession ? (
                <>
                  <div className="conversation-view-header">
                    <div className="terminal-tabbar">
                      <TabBar
                        className="tab-bar-run"
                        activeId={runViewTab}
                        items={runTabs}
                        onSelect={(id) => {
                          setRunViewTab(id);
                        }}
                      />
                    </div>
                    <div className="conversation-view-note">
                      <span id="session-provider-session">{shellSummaryState.providerSession}</span>
                      <span id="data-directory">{shellSummaryState.dataDirectory}</span>
                    </div>
                  </div>

                  <div className="section-scroll run-scroll panes-run-scroll">
                    {runViewTab === 'chat' ? (
                      <div id="thread-feed" className="timeline thread-view">
                        <RunTranscriptPanel
                          selectedRun={runViewState.selectedRun}
                          deltas={inspectorViews.deltas}
                          messages={inspectorViews.messages}
                          formatTimestamp={formatTimestamp}
                        />
                      </div>
                    ) : null}

                    {runViewTab === 'timeline' ? (
                      <div id="timeline" className="timeline timeline-secondary">
                        <RunTimelinePanel
                          selectedRun={runViewState.selectedRun}
                          timeline={inspectorViews.timeline}
                          formatTimestamp={formatTimestamp}
                        />
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="workspace-empty-state">
                  <div className="workspace-empty-icon" aria-hidden="true">
                    <span className="workspace-empty-glyph">↗</span>
                  </div>
                  <strong className="workspace-empty-title">
                    {hasActiveRun ? 'Continue the conversation' : 'Start a conversation'}
                  </strong>
                  <span className="workspace-empty-message">
                    {
                      !shellControlsState.workspacePath.trim()
                        ? 'Set a workspace path in the left rail, then type your message below and press Send.'
                        : hasPromptDraft
                          ? 'Press Enter or click Send to begin.'
                          : 'Type your message below and press Enter to start.'
                    }
                  </span>
                  {
                    !hasPromptDraft && shellControlsState.promptDisabled
                      ? (
                        <div className="workspace-empty-hint">
                          {!shellControlsState.providerId
                            ? 'Choose a provider to get started.'
                            : 'Draft a prompt to enable the Send button.'}
                        </div>
                      )
                      : null
                  }
                </div>
              )}
            </section>

            <form
              id="run-form"
              className="composer-shell panes-composer-shell"
              onSubmit={(event) => {
                event.preventDefault();
                void requestStartRun();
              }}
            >
              <textarea
                id="prompt-input"
                name="prompt"
                rows={1}
                ref={textareaRef}
                placeholder={composerPlaceholder}
                required
                value={shellControlsState.prompt}
                disabled={shellControlsState.promptDisabled}
                onChange={(event) => {
                  void requestPromptDraftChange(event.target.value);
                  autoResize();
                }}
                onKeyDown={handleComposerKeyDown}
              ></textarea>

              <div className="composer-footer">
                <div className="composer-footer-top">
                  <div className="composer-footer-meta">
                    <span className="composer-send-guidance">{composerHint}</span>
                    <span className="composer-meta-divider" aria-hidden="true">·</span>
                    <span>
                      {hasActiveSession
                        ? `Thread in ${conversationWorkspace}`
                        : `New thread in ${conversationWorkspace}`}
                    </span>
                  </div>
                </div>

                <div className="composer-footer-bottom">
                  <div className="composer-config-strip">
                    <details ref={composerPlusMenuRef} className="composer-plus-menu">
                      <summary
                        className="composer-plus-trigger"
                        title="Thread settings"
                        aria-label="Thread settings"
                      >
                        +
                      </summary>
                      <div className="composer-plus-popover">
                        {!hasActiveSession ? (
                          <label className="composer-actions-field" htmlFor="composer-workspace-path">
                            <span>Workspace</span>
                            <input
                              id="composer-workspace-path"
                              type="text"
                              value={shellControlsState.workspacePath}
                              onChange={(event) => {
                                void requestSessionDraftChange({
                                  workspacePath: event.target.value,
                                });
                              }}
                              onBlur={() => {
                                void requestWorkspaceDraftCommit();
                              }}
                            />
                          </label>
                        ) : (
                          <div className="composer-config-note">
                            <strong>Thread settings are locked</strong>
                            <span>
                              This thread is already bound to {shellPanelsState.selectedProviderId ?? 'its provider'} in{' '}
                              {conversationWorkspace}.
                            </span>
                          </div>
                        )}

                        <div className="tool-requirements composer-tools-popover">
                          {ROUTING_TOOL_OPTIONS.map((tool) => (
                            <label key={tool}>
                              <input
                                type="checkbox"
                                name="routingTool"
                                value={tool}
                                checked={shellControlsState.routingTools.includes(tool)}
                                onChange={(event) => {
                                  const nextTools = event.target.checked
                                    ? [...shellControlsState.routingTools, tool]
                                    : shellControlsState.routingTools.filter(
                                        (entry) => entry !== tool,
                                      );
                                  void requestRoutingToolsDraftChange(nextTools);
                                }}
                              />
                              {renderRoutingToolLabel(tool)}
                            </label>
                          ))}
                        </div>
                        <p className="composer-config-note composer-config-note-muted">
                          {hasActiveSession
                            ? shellSummaryState.selectedSessionNote
                            : shellSummaryState.sessionProviderNote}
                        </p>
                        <div className="composer-menu-divider" aria-hidden="true"></div>
                        <div className="composer-popover-section">
                          <span className="composer-popover-label">Advanced</span>
                          <button
                            id="route-run-button"
                            type="button"
                            className="secondary-button"
                            disabled={shellControlsState.routeRunDisabled}
                            onClick={() => {
                              closeComposerPlusMenu();
                              void requestRoutePrompt();
                            }}
                          >
                            Route Prompt
                          </button>
                          <label className="composer-actions-field" htmlFor="delegate-role-select">
                            <span>Delegate Role</span>
                            <select
                              id="delegate-role-select"
                              className="secondary-select"
                              value={shellControlsState.delegateRole}
                              onChange={(event) => {
                                void requestDelegateRoleChange(
                                  parseDelegateRole(event.target.value),
                                );
                              }}
                            >
                              <option value="planner">Planner</option>
                              <option value="researcher">Researcher</option>
                              <option value="reviewer">Reviewer</option>
                              <option value="verifier">Verifier</option>
                            </select>
                          </label>
                          <div className="composer-popover-actions">
                            <button
                              id="delegate-run-button"
                              type="button"
                              className="secondary-button"
                              disabled={shellControlsState.delegateRunDisabled}
                              onClick={() => {
                                closeComposerPlusMenu();
                                void requestDelegatePrompt();
                              }}
                            >
                              Delegate
                            </button>
                            <button
                              id="handoff-run-button"
                              type="button"
                              className="secondary-button"
                              disabled={shellControlsState.handoffRunDisabled}
                              onClick={() => {
                                closeComposerPlusMenu();
                                void requestHandoffPrompt();
                              }}
                            >
                              Handoff
                            </button>
                          </div>
                        </div>
                      </div>
                    </details>

                    {hasActiveSession ? (
                      <div className="composer-choice-pill composer-choice-pill-locked">
                        <span className="composer-choice-value">
                          {renderProviderLabel(activeProviderId)}
                        </span>
                        <span className="composer-choice-lock" aria-hidden="true">
                          locked
                        </span>
                      </div>
                    ) : (
                      <details
                        ref={composerProviderMenuRef}
                        className="composer-choice-menu"
                      >
                        <summary className="composer-choice-trigger">
                          <span className="composer-choice-value">
                            {renderProviderLabel(activeProviderId)}
                          </span>
                          <span className="composer-choice-caret" aria-hidden="true">
                            ▾
                          </span>
                        </summary>
                        <div className="composer-choice-popover">
                          {(['qwen', 'gemini'] as ProviderId[]).map((providerId) => (
                            <button
                              key={providerId}
                              type="button"
                              className={`composer-choice-option${
                                shellControlsState.providerId === providerId ? ' active' : ''
                              }`}
                              onClick={() => {
                                closeComposerProviderMenu();
                                void requestSessionDraftChange({ providerId });
                              }}
                            >
                              <span>{renderProviderLabel(providerId)}</span>
                              {shellControlsState.providerId === providerId ? (
                                <span className="composer-choice-check" aria-hidden="true">
                                  ✓
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}

                    {(hasActiveSession
                      ? shellControlsState.selectedSessionApprovalPolicyDisabled
                      : shellControlsState.sessionApprovalPolicyDisabled) ? (
                      <div className="composer-choice-pill composer-choice-pill-locked">
                        <span className="composer-choice-value">
                          {renderAccessLabel(activeApprovalPolicy)}
                        </span>
                      </div>
                    ) : (
                      <details
                        ref={composerAccessMenuRef}
                        className="composer-choice-menu"
                      >
                        <summary className="composer-choice-trigger">
                          <span className="composer-choice-value">
                            {renderAccessLabel(activeApprovalPolicy)}
                          </span>
                          <span className="composer-choice-caret" aria-hidden="true">
                            ▾
                          </span>
                        </summary>
                        <div className="composer-choice-popover">
                          {(['manual', 'allow', 'deny'] as ApprovalPolicy[]).map((policy) => (
                            <button
                              key={policy}
                              type="button"
                              className={`composer-choice-option${
                                activeApprovalPolicy === policy ? ' active' : ''
                              }`}
                              onClick={() => {
                                closeComposerAccessMenu();
                                handleComposerPolicyChange(policy);
                              }}
                            >
                              <span>{renderAccessLabel(policy)}</span>
                              {activeApprovalPolicy === policy ? (
                                <span className="composer-choice-check" aria-hidden="true">
                                  ✓
                                </span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="composer-primary-actions">
                    <div className="composer-send-shortcut" aria-hidden="true">
                      <span>{sendHelperPrimary}</span>
                      <span>{sendHelperSecondary}</span>
                    </div>
                    {hasPromptDraft ? (
                      <button
                        type="button"
                        className="composer-clear-button"
                        onClick={() => {
                          void requestPromptDraftChange('');
                          autoResize();
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                    <button
                      id="start-run-button"
                      className="composer-send-button"
                      type="submit"
                      aria-label="Send prompt"
                      disabled={shellControlsState.startRunDisabled}
                    >
                      <span className="composer-send-icon" aria-hidden="true">↗</span>
                      <span className="composer-send-label">Send</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>

            {hasActiveSession ? (
              <div className="conversation-topbar terminal-status-bar">
                <div className="conversation-topbar-group">
                  <span className="pane-meta-chip">Local</span>
                  <span className="pane-meta-chip">
                    {renderAccessLabel(activeApprovalPolicy)}
                  </span>
                  <span className="pane-meta-chip">
                    {renderProviderLabel(activeProviderId)}
                  </span>
                </div>
                <div className="conversation-topbar-group">
                  <div className={shellSummaryState.runStatusClassName} id="run-status">
                    {shellSummaryState.runStatusLabel}
                  </div>
                  <span className="terminal-footer-path">
                    {shellControlsState.workspacePath || 'workspace unavailable'}
                  </span>
                </div>
              </div>
            ) : null}
          </main>

        <div
          className={`column-resize-handle utility-resize-handle${
            utilityCollapsed ? ' is-hidden' : ''
          }`}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize utility column"
          onMouseDown={startRightResize}
        ></div>

        <aside
          className={`utility-column utility-shell${
            utilityCollapsed ? ' utility-shell-collapsed' : ''
          }`}
        >
          <div
            className={`section-header section-header-compact inspector-header${
              utilityCollapsed ? ' inspector-header-collapsed' : ''
            }`}
          >
            {!utilityCollapsed ? (
              <div className="inspector-heading">
                <div className="inspector-heading-top">
                  <h2>Context</h2>
                  <span className="inspector-context-chip">
                    {shellPanelsState.selectedProviderId ?? 'no provider'}
                  </span>
                  <span className="inspector-header-note">
                    {shellPanelsState.selectedSessionId
                      ? `session ${activeSessionId}`
                      : 'no session'}
                  </span>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="utility-toggle-button"
              title={utilityCollapsed ? 'Open inspector' : 'Collapse inspector'}
              aria-label={utilityCollapsed ? 'Open inspector' : 'Collapse inspector'}
              onClick={() => {
                setUtilityCollapsed((current) => !current);
              }}
            >
              <span className="header-glyph header-glyph-collapse" aria-hidden="true"></span>
            </button>
          </div>

          {utilityCollapsed ? (
            <div className="utility-mini-stack" aria-label="Collapsed utility views">
              {utilityTabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`utility-mini-button${
                    utilityView === item.id ? ' active' : ''
                  }`}
                  onClick={() => {
                    setUtilityView(item.id);
                    setUtilityCollapsed(false);
                  }}
                >
                  <span className="utility-mini-code">
                    {item.label.slice(0, 3).toUpperCase()}
                  </span>
                  {item.badge !== undefined ? (
                    <span className="utility-mini-count">{item.badge}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <>
          <div className="inspector-nav">
            <TabBar
              className="tab-bar-utility"
              activeId={utilityView}
              items={utilityTabs}
              onSelect={(id) => {
                setUtilityView(id);
              }}
            />
          </div>

          <div className="section-scroll utility-scroll">
            {utilityView === 'approvals' ? (
              <section className="utility-section">
                <div className="utility-section-heading">
                  <p className="eyebrow">Approvals</p>
                  <h3>Pending decisions</h3>
                </div>
                <div id="approval-list" className="list compact">
                  <ApprovalListPanel
                    approvals={shellPanelsState.approvals}
                    capabilities={shellPanelsState.selectedSessionCapabilities}
                    onResolveApproval={(approvalId, decision) => {
                      void requestApprovalResolution(approvalId, decision);
                    }}
                  />
                </div>
              </section>
            ) : null}

            {utilityView === 'tools' ? (
              <section className="utility-section utility-stack">
                <div className="utility-section-heading">
                  <p className="eyebrow">Tool Plane</p>
                  <h3>Activity</h3>
                </div>
                <div id="tool-list" className="list compact">
                  <ToolActivityList tools={shellPanelsState.tools} />
                </div>
                <div className="tool-plane-subsection">
                  <div className="section-title">Session Registration Evidence</div>
                  <div id="tool-registration-list" className="list compact">
                    <ToolRegistrationEvidenceList
                      snapshot={shellPanelsState.toolPlane}
                      selectedProviderId={shellPanelsState.selectedProviderId}
                    />
                  </div>
                </div>
              </section>
            ) : null}

            {utilityView === 'files' ? (
              <section className="utility-section utility-stack">
                <div className="utility-section-heading">
                  <p className="eyebrow">Workspace</p>
                  <h3>Files</h3>
                </div>
                <WorkspaceFilePanel workspacePath={shellControlsState.workspacePath} />
              </section>
            ) : null}

            {utilityView === 'artifacts' ? (
              <section className="utility-section">
                <div className="utility-section-heading">
                  <p className="eyebrow">Artifacts</p>
                  <h3>Captured output</h3>
                </div>
                <div id="artifact-list" className="list compact">
                  <ArtifactListPanel
                    artifacts={shellPanelsState.artifacts}
                    formatTimestamp={formatTimestamp}
                  />
                </div>
              </section>
            ) : null}

            {utilityView === 'checkpoints' ? (
              <section className="utility-section">
                <div className="utility-section-heading">
                  <p className="eyebrow">Checkpoints</p>
                  <h3>Saved recovery points</h3>
                </div>
                <div id="checkpoint-list" className="list compact">
                  <CheckpointListPanel
                    checkpoints={shellPanelsState.checkpoints}
                    capabilities={shellPanelsState.selectedSessionCapabilities}
                    formatTimestamp={formatTimestamp}
                    onRecoverCheckpoint={(checkpointId) => {
                      void requestCheckpointRecovery(checkpointId);
                    }}
                  />
                </div>
              </section>
            ) : null}
          </div>
            </>
          )}
        </aside>
        </div>
      </section>
    </div>
  );
}
