import type {
  ApprovalPolicy,
  RoutingToolRequirement,
} from '@qwemini/protocol';
import type {
  DelegateRole,
  FollowUpKind,
} from './shell-controls-state.js';
import type {
  ApprovalDecision,
  CancelSelectedRun,
  ControllerRequesterMap,
  CreateFollowUpRun,
  CreateSession,
  HandoffPrompt,
  RecoverFromCheckpoint,
  RecoverSelectedSession,
  RefreshRecommendation,
  ResolveApproval,
  RoutePrompt,
  DeleteSession,
  SelectRun,
  SelectSession,
  SessionDraftPatch,
  StartRun,
  UpdateSelectedSessionPolicy,
  DelegatePrompt,
} from './controller-contracts.js';
import type { ControllerRequesterState } from './controller-state-slices.js';

type ControllerRequesterDeps = {
  state: ControllerRequesterState;
  emitShellControlsState: () => void;
  syncSessionCreationControls: () => void;
  syncRunAction: () => void;
  syncRouteAction: () => void;
  loadToolPlane: (workspacePath?: string) => Promise<void>;
  refreshRecommendation: RefreshRecommendation;
  selectRun: SelectRun;
  selectSession: SelectSession;
  recoverFromCheckpoint: RecoverFromCheckpoint;
  recoverSelectedSession: RecoverSelectedSession;
  deleteSession: DeleteSession;
  resolveApproval: ResolveApproval;
  updateSelectedSessionPolicyDraft: (policy: ApprovalPolicy) => void;
  createSession: CreateSession;
  startRun: StartRun;
  routePrompt: RoutePrompt;
  delegatePrompt: DelegatePrompt;
  handoffPrompt: HandoffPrompt;
  updateSelectedSessionPolicy: UpdateSelectedSessionPolicy;
  cancelSelectedRun: CancelSelectedRun;
  createFollowUpRun: CreateFollowUpRun;
};

export function createControllerRequesters(
  deps: ControllerRequesterDeps,
): ControllerRequesterMap {
  const {
    state,
    emitShellControlsState,
    syncSessionCreationControls,
    syncRunAction,
    syncRouteAction,
    loadToolPlane,
    refreshRecommendation,
    selectRun,
    selectSession,
    recoverFromCheckpoint,
    recoverSelectedSession,
    deleteSession,
    resolveApproval,
    updateSelectedSessionPolicyDraft,
    createSession,
    startRun,
    routePrompt,
    delegatePrompt,
    handoffPrompt,
    updateSelectedSessionPolicy,
    cancelSelectedRun,
    createFollowUpRun,
  } = deps;

  function toApprovalPolicy(value: string): ApprovalPolicy {
    return value === 'allow' || value === 'deny' ? value : 'manual';
  }

  return {
    approvalResolutionRequester: async (
      approvalId: string,
      decision: ApprovalDecision,
    ) => {
      await resolveApproval(approvalId, decision);
    },
    applySelectedSessionPolicyRequester: async () => {
      await updateSelectedSessionPolicy().catch(() => {});
    },
    cancelSelectedRunRequester: async () => {
      await cancelSelectedRun().catch(() => {});
    },
    checkpointRecoveryRequester: async (checkpointId: string) => {
      await recoverFromCheckpoint(checkpointId);
    },
    createSessionRequester: async () => {
      await createSession().catch(() => {});
    },
    delegatePromptRequester: async () => {
      await delegatePrompt().catch(() => {});
    },
    delegateRoleChangeRequester: async (role: DelegateRole) => {
      state.delegateRoleDraft = role;
      emitShellControlsState();
    },
    followUpRunRequester: async (kind: FollowUpKind) => {
      await createFollowUpRun(kind).catch(() => {});
    },
    handoffPromptRequester: async () => {
      await handoffPrompt().catch(() => {});
    },
    promptDraftChangeRequester: async (prompt: string) => {
      state.promptDraft = prompt;
      syncRunAction();
      await refreshRecommendation();
    },
    recoverSelectedSessionRequester: async () => {
      await recoverSelectedSession().catch(() => {});
    },
    sessionDeleteRequester: async (sessionId: string) => {
      await deleteSession(sessionId).catch(() => {});
    },
    routePromptRequester: async () => {
      await routePrompt().catch(() => {});
    },
    routingToolsDraftChangeRequester: async (tools: RoutingToolRequirement[]) => {
      state.routingToolsDraft = [...tools];
      syncRouteAction();
      await refreshRecommendation();
    },
    runSelectionRequester: async (runId: string) => {
      await selectRun(runId);
    },
    selectedSessionPolicyDraftChangeRequester: async (
      policy: ApprovalPolicy,
    ) => {
      updateSelectedSessionPolicyDraft(policy);
    },
    sessionDraftChangeRequester: async (
      patch: SessionDraftPatch,
    ) => {
      if (typeof patch.workspacePath === 'string') {
        state.workspacePathDraft = patch.workspacePath;
      }
      if (typeof patch.providerId === 'string') {
        state.providerIdDraft = patch.providerId;
        syncSessionCreationControls();
      }
      if (typeof patch.sessionApprovalPolicy === 'string') {
        state.sessionApprovalPolicyDraft = toApprovalPolicy(
          patch.sessionApprovalPolicy,
        );
      }
      syncRunAction();
      emitShellControlsState();
    },
    sessionSelectionRequester: async (sessionId: string) => {
      return selectSession(sessionId);
    },
    startRunRequester: async () => {
      await startRun().catch(() => {});
    },
    workspaceDraftCommitRequester: async () => {
      syncRunAction();
      await loadToolPlane(state.workspacePathDraft.trim()).catch(() => {});
      await refreshRecommendation();
    },
  };
}
