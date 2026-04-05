import type {
  DelegateRunRequest,
  FollowUpRunRequest,
  HandoffRunRequest,
  OrchestrationRecommendation,
  OrchestrationRole,
  OrchestrationStrategy,
  ProviderHealth,
  ProviderId,
  RoutingToolRequirement,
  ToolPlaneSnapshot,
  WorkbenchRun,
} from '@qwemini/protocol';

export interface RecommendProviderRouteInput {
  prompt: string;
  workspacePath: string;
  providers: ProviderHealth[];
  preferredProviderId?: ProviderId | null;
  requiredTools?: RoutingToolRequirement[];
  toolPlane?: ToolPlaneSnapshot | null;
}

export interface RecommendFollowUpRouteInput {
  kind: FollowUpRunRequest['kind'];
  workspacePath: string;
  providers: ProviderHealth[];
  sourceRun: WorkbenchRun;
  preferredProviderId?: ProviderId | null;
}

export interface BuildFollowUpPromptInput {
  kind: FollowUpRunRequest['kind'];
  sourceRun: WorkbenchRun;
  sourceProviderId: ProviderId;
  sourceOutput: string;
}

export interface RecommendDelegatedRouteInput {
  prompt: string;
  role: DelegateRunRequest['role'];
  workspacePath: string;
  providers: ProviderHealth[];
  sourceRun: WorkbenchRun;
  preferredProviderId?: ProviderId | null;
  requiredTools?: RoutingToolRequirement[];
  toolPlane?: ToolPlaneSnapshot | null;
}

export interface BuildDelegatedPromptInput {
  prompt: string;
  role: DelegateRunRequest['role'];
  sourceRun: WorkbenchRun;
  sourceProviderId: ProviderId;
  sourceOutput: string;
}

export interface RecommendHandoffRouteInput {
  prompt: string;
  workspacePath: string;
  providers: ProviderHealth[];
  sourceRun: WorkbenchRun;
  preferredProviderId?: ProviderId | null;
  requiredTools?: RoutingToolRequirement[];
  toolPlane?: ToolPlaneSnapshot | null;
}

export interface BuildHandoffPromptInput {
  prompt: string;
  sourceRun: WorkbenchRun;
  sourceProviderId: ProviderId;
  sourceOutput: string;
}

const CHECKPOINT_PATTERN =
  /\b(checkpoint|resume|recover|recovery|continue where|pick up where)\b/i;
const TOOL_PATTERN =
  /\b(shell|command|terminal|powershell|bash|edit|write|patch|fix|implement|refactor|tool|artifact|apply|run tests?|lint)\b/i;
const ANALYSIS_PATTERN =
  /\b(explain|summari[sz]e|compare|review|brainstorm|plan|research|investigate|understand|analy[sz]e)\b/i;

function normalizeRequiredTools(
  requiredTools: RoutingToolRequirement[] | undefined,
): RoutingToolRequirement[] {
  return [...new Set(requiredTools ?? [])];
}

function hasToolRequirement(
  requiredTools: RoutingToolRequirement[],
  requirement: RoutingToolRequirement,
): boolean {
  return requiredTools.includes(requirement);
}

function clampConfidence(value: number): number {
  return Math.max(0.5, Math.min(0.98, Number(value.toFixed(2))));
}

function getFallbackProvider(
  providers: ProviderHealth[],
  primaryProviderId: ProviderId,
): ProviderId | null {
  return (
    providers.find(
      (provider) =>
        provider.available && provider.providerId !== primaryProviderId,
    )?.providerId ?? null
  );
}

function getToolPlaneProviderSignal(
  toolPlane: ToolPlaneSnapshot | null | undefined,
  providerId: ProviderId,
) {
  return toolPlane?.providers.find((provider) => provider.providerId === providerId) ?? null;
}

function getToolRequirementCoverageScore(
  toolPlane: ToolPlaneSnapshot | null | undefined,
  providerId: ProviderId,
  requiredTools: RoutingToolRequirement[],
): number {
  if (requiredTools.length === 0) {
    return 0;
  }

  const signal = getToolPlaneProviderSignal(toolPlane, providerId);
  if (!signal) {
    return 0;
  }

  const matched = requiredTools.filter((tool) => signal.readyTools.includes(tool)).length;
  const sessionMatched = requiredTools.filter((tool) =>
    signal.sessionRegisteredTools.includes(tool),
  ).length;
  const coverage = matched / requiredTools.length;
  const sessionCoverage = sessionMatched / requiredTools.length;
  const recentSuccessRate =
    signal.recentInvocationCount > 0
      ? signal.recentSuccessCount / signal.recentInvocationCount
      : 0.5;
  const sessionRegistrationBonus =
    toolPlane?.scope === 'session' ? sessionCoverage * 2 : sessionCoverage * 0.5;
  return coverage * 10 + recentSuccessRate + sessionRegistrationBonus;
}

function buildSignalLines(
  toolPlane: ToolPlaneSnapshot | null | undefined,
  providerId: ProviderId,
  requiredTools: RoutingToolRequirement[],
): string[] {
  if (!toolPlane) {
    return [];
  }

  const signal = getToolPlaneProviderSignal(toolPlane, providerId);
  if (!signal) {
    return [];
  }

  const lines = [signal.summary];
  if (toolPlane.registryPath) {
    lines.push(`Workspace registry: ${toolPlane.registryPath}.`);
  } else {
    lines.push('Workspace registry: using tool-plane defaults.');
  }

  if (toolPlane.mcpServers.length > 0) {
    const readyServers = toolPlane.mcpServers
      .filter((server) => server.enabled && server.available)
      .map((server) => server.id);
    lines.push(
      `Workspace MCP servers: ${
        readyServers.length > 0 ? readyServers.join(', ') : 'none ready'
      }.`,
    );
  }

  if (requiredTools.length > 0) {
    const satisfied = requiredTools.filter((tool) => signal.readyTools.includes(tool));
    const sessionSatisfied = requiredTools.filter((tool) =>
      signal.sessionRegisteredTools.includes(tool),
    );
    lines.push(
      `${providerId} satisfies ${satisfied.length}/${requiredTools.length} required tool signals: ${
        satisfied.length > 0 ? satisfied.join(', ') : 'none'
      }.`,
    );
    if (toolPlane.scope === 'session') {
      const providerRegistrations = toolPlane.registeredSessionTools.filter(
        (registration) => registration.providerId === providerId,
      );
      const providerEnumeratedCount = providerRegistrations.filter(
        (registration) =>
          registration.metadata?.registrationKind === 'provider-enumeration',
      ).length;
      const inferredCount = providerRegistrations.length - providerEnumeratedCount;
      lines.push(
        `${providerId} has ${sessionSatisfied.length}/${requiredTools.length} required tools live-registered in this session: ${
          sessionSatisfied.length > 0 ? sessionSatisfied.join(', ') : 'none'
        }.`,
      );
      lines.push(
        `${providerId} session registration evidence: ${providerEnumeratedCount} provider-enumerated, ${inferredCount} inferred from tool events.`,
      );
    }
  }

  return lines;
}

function buildRecommendation(
  input: RecommendProviderRouteInput,
  primaryProviderId: ProviderId,
  strategy: OrchestrationStrategy,
  confidence: number,
  reason: string,
  signals: string[] = [],
): OrchestrationRecommendation {
  const availableProviders = input.providers.filter((provider) => provider.available);
  return {
    prompt: input.prompt,
    workspacePath: input.workspacePath,
    preferredProviderId: input.preferredProviderId ?? null,
    requiredTools: normalizeRequiredTools(input.requiredTools),
    primaryProviderId,
    fallbackProviderId: getFallbackProvider(availableProviders, primaryProviderId),
    strategy,
    confidence: clampConfidence(confidence),
    reason,
    signals,
  };
}

export function recommendProviderRoute(
  input: RecommendProviderRouteInput,
): OrchestrationRecommendation {
  const availableProviders = input.providers.filter((provider) => provider.available);
  if (availableProviders.length === 0) {
    throw new Error('No providers are currently available for orchestration.');
  }

  if (availableProviders.length === 1) {
    const onlyProvider = availableProviders[0]!;
    return buildRecommendation(
      input,
      onlyProvider.providerId,
      'balanced',
      0.96,
      `${onlyProvider.providerId} is the only available provider, so routing stays on the healthy runtime.`,
    );
  }

  const normalizedPrompt = input.prompt.trim();
  const requiredTools = normalizeRequiredTools(input.requiredTools);
  const preferredProvider = input.preferredProviderId
    ? availableProviders.find(
        (provider) => provider.providerId === input.preferredProviderId,
      ) ?? null
    : null;
  const toolPlane = input.toolPlane ?? null;
  const qwen = availableProviders.find((provider) => provider.providerId === 'qwen');
  const gemini = availableProviders.find(
    (provider) => provider.providerId === 'gemini',
  );

  if (toolPlane && requiredTools.length > 0) {
    const scoredProviders = availableProviders
      .map((provider) => ({
        providerId: provider.providerId,
        score: getToolRequirementCoverageScore(
          toolPlane,
          provider.providerId,
          requiredTools,
        ),
      }))
      .sort((left, right) => right.score - left.score);
    const [best, secondBest] = scoredProviders;

    if (best && best.score > 0 && (!secondBest || best.score > secondBest.score)) {
      const strategy =
        requiredTools.includes('workspace-write') || requiredTools.includes('shell')
          ? 'tool-first'
          : 'analysis-first';
      return buildRecommendation(
        input,
        best.providerId,
        strategy,
        0.9,
        `${best.providerId} is preferred because the daemon-owned tool plane currently offers the strongest coverage for the required tool signals.`,
        buildSignalLines(toolPlane, best.providerId, requiredTools),
      );
    }

    if (hasToolRequirement(requiredTools, 'mcp')) {
      throw new Error(
        'No provider currently has MCP ready for this workspace. Add an enabled MCP server in .qwemini/mcp.json or .mcp.json first.',
      );
    }
  }

  if (hasToolRequirement(requiredTools, 'mcp') && gemini && !toolPlane) {
    return buildRecommendation(
      input,
      'gemini',
      'analysis-first',
      0.91,
      'Gemini is preferred because the route explicitly requires MCP-aware tooling and Gemini is the stronger MCP-first provider surface today.',
      buildSignalLines(toolPlane, 'gemini', requiredTools),
    );
  }

  if (
    (hasToolRequirement(requiredTools, 'workspace-write') ||
      hasToolRequirement(requiredTools, 'shell')) &&
    qwen
  ) {
    return buildRecommendation(
      input,
      'qwen',
      'tool-first',
      0.92,
      'Qwen is preferred because the route explicitly requires write or shell tooling and its tool-control plus checkpoint path is stronger for execution-heavy work.',
      buildSignalLines(toolPlane, 'qwen', requiredTools),
    );
  }

  if (hasToolRequirement(requiredTools, 'network') && gemini) {
    return buildRecommendation(
      input,
      'gemini',
      'analysis-first',
      0.86,
      'Gemini is preferred because the route explicitly requires network-style tool work and its current extension and MCP posture is the better fit.',
      buildSignalLines(toolPlane, 'gemini', requiredTools),
    );
  }

  if (hasToolRequirement(requiredTools, 'workspace-read') && gemini) {
    return buildRecommendation(
      input,
      'gemini',
      'analysis-first',
      0.82,
      'Gemini is preferred because the route is read-heavy without a stronger execution signal.',
      buildSignalLines(toolPlane, 'gemini', requiredTools),
    );
  }

  if (CHECKPOINT_PATTERN.test(normalizedPrompt) && qwen) {
    return buildRecommendation(
      input,
      'qwen',
      'checkpoint-first',
      0.9,
      'Qwen is preferred for checkpoint-heavy or recovery-sensitive work because its runtime currently emits richer checkpoint and session-control signals.',
      buildSignalLines(toolPlane, 'qwen', requiredTools),
    );
  }

  if (
    TOOL_PATTERN.test(normalizedPrompt) &&
    qwen &&
    (!toolPlane ||
      getToolRequirementCoverageScore(toolPlane, 'qwen', ['workspace-write', 'shell']) >=
        getToolRequirementCoverageScore(toolPlane, 'gemini', [
          'workspace-write',
          'shell',
        ]))
  ) {
    return buildRecommendation(
      input,
      'qwen',
      'tool-first',
      0.87,
      'Qwen is preferred for tool-heavy coding work because its daemon-owned control path and checkpoint surfaces are more mature.',
      buildSignalLines(toolPlane, 'qwen', []),
    );
  }

  if (
    ANALYSIS_PATTERN.test(normalizedPrompt) &&
    gemini &&
    (!toolPlane ||
      getToolRequirementCoverageScore(toolPlane, 'gemini', ['mcp', 'network', 'workspace-read']) >=
        getToolRequirementCoverageScore(toolPlane, 'qwen', [
          'mcp',
          'network',
          'workspace-read',
        ]))
  ) {
    return buildRecommendation(
      input,
      'gemini',
      'analysis-first',
      0.84,
      'Gemini is preferred for analysis-heavy prompts when no stronger tool or checkpoint signal is present.',
      buildSignalLines(toolPlane, 'gemini', []),
    );
  }

  if (preferredProvider) {
    return buildRecommendation(
      input,
      preferredProvider.providerId,
      'balanced',
      0.72,
      `No strong routing signal was detected, so orchestration stays close to the current ${preferredProvider.providerId} session context.`,
      buildSignalLines(toolPlane, preferredProvider.providerId, requiredTools),
    );
  }

  if (qwen) {
    return buildRecommendation(
      input,
      'qwen',
      'balanced',
      0.68,
      'No strong routing signal was detected, so orchestration uses Qwen as the default implementation-first runtime and keeps Gemini as fallback.',
      buildSignalLines(toolPlane, 'qwen', requiredTools),
    );
  }

  return buildRecommendation(
    input,
    gemini ? 'gemini' : availableProviders[0]!.providerId,
    'balanced',
    0.66,
    'No strong routing signal was detected, so orchestration uses the healthiest available provider.',
    buildSignalLines(
      toolPlane,
      gemini ? 'gemini' : availableProviders[0]!.providerId,
      requiredTools,
    ),
  );
}

export function recommendFollowUpRoute(
  input: RecommendFollowUpRouteInput,
): OrchestrationRecommendation {
  const availableProviders = input.providers.filter((provider) => provider.available);
  if (availableProviders.length === 0) {
    throw new Error('No providers are currently available for orchestration.');
  }

  const gemini = availableProviders.find((provider) => provider.providerId === 'gemini');
  const qwen = availableProviders.find((provider) => provider.providerId === 'qwen');
  const preferredProvider = input.preferredProviderId
    ? availableProviders.find(
        (provider) => provider.providerId === input.preferredProviderId,
      ) ?? null
    : null;

  if (input.kind === 'review') {
    const reviewProvider =
      gemini?.providerId !== input.sourceRun.providerId
        ? gemini
        : qwen?.providerId !== input.sourceRun.providerId
          ? qwen
          : gemini ?? qwen ?? availableProviders[0];
    if (!reviewProvider) {
      throw new Error('No providers are currently available for review routing.');
    }
    return buildRecommendation(
      {
        prompt: input.sourceRun.prompt,
        workspacePath: input.workspacePath,
        providers: input.providers,
        preferredProviderId: input.preferredProviderId ?? null,
        requiredTools: [],
        toolPlane: null,
      },
      reviewProvider.providerId,
      'analysis-first',
      preferredProvider?.providerId === reviewProvider.providerId ? 0.83 : 0.88,
      `${reviewProvider.providerId} is preferred for a reviewer follow-up because review work should be separated from the source run when another healthy provider is available.`,
    );
  }

  const verifyProvider =
    qwen ??
    (gemini?.providerId !== input.sourceRun.providerId
      ? gemini
      : gemini ?? availableProviders[0]);
  if (!verifyProvider) {
    throw new Error('No providers are currently available for verify routing.');
  }
  return buildRecommendation(
      {
        prompt: input.sourceRun.prompt,
        workspacePath: input.workspacePath,
        providers: input.providers,
        preferredProviderId: input.preferredProviderId ?? null,
        requiredTools: [],
        toolPlane: null,
      },
    verifyProvider.providerId,
    'tool-first',
    preferredProvider?.providerId === verifyProvider.providerId ? 0.84 : 0.89,
    `${verifyProvider.providerId} is preferred for a verifier follow-up because verification should stay close to the tool and execution path while still avoiding unnecessary provider lock-in.`,
  );
}

export function buildFollowUpPrompt(
  input: BuildFollowUpPromptInput,
): string {
  const sourceOutput = input.sourceOutput.trim() || 'No final assistant output was captured.';

  if (input.kind === 'review') {
    return [
      'You are the reviewer for a Qwemini follow-up run.',
      'Review the prior result for correctness, regressions, missing checks, and risky assumptions.',
      "If you find issues, list them clearly. If you do not find issues, say 'No review findings.'",
      '',
      `Source provider: ${input.sourceProviderId}`,
      `Original task: ${input.sourceRun.prompt}`,
      '',
      'Prior result:',
      sourceOutput,
    ].join('\n');
  }

  return [
    'You are the verifier for a Qwemini follow-up run.',
    'Verify the prior result and state what appears validated versus what still needs checking.',
    "If verification is incomplete, say exactly what remains. If it appears sound, say 'Verification looks clean.'",
    '',
    `Source provider: ${input.sourceProviderId}`,
    `Original task: ${input.sourceRun.prompt}`,
    '',
    'Prior result:',
    sourceOutput,
  ].join('\n');
}

export function getFollowUpRole(
  kind: FollowUpRunRequest['kind'],
): OrchestrationRole {
  return kind === 'review' ? 'reviewer' : 'verifier';
}

export function recommendDelegatedRoute(
  input: RecommendDelegatedRouteInput,
): OrchestrationRecommendation {
  const availableProviders = input.providers.filter((provider) => provider.available);
  if (availableProviders.length === 0) {
    throw new Error('No providers are currently available for orchestration.');
  }

  const requiredTools = normalizeRequiredTools(input.requiredTools);
  if (requiredTools.length > 0) {
    const baseRecommendation = recommendProviderRoute({
      prompt: input.prompt,
      workspacePath: input.workspacePath,
      providers: input.providers,
      preferredProviderId: input.preferredProviderId ?? null,
      requiredTools,
      toolPlane: input.toolPlane ?? null,
    });
    return {
      ...baseRecommendation,
      reason: `${baseRecommendation.reason} Delegated role: ${input.role}.`,
    };
  }

  const qwen = availableProviders.find((provider) => provider.providerId === 'qwen');
  const gemini = availableProviders.find(
    (provider) => provider.providerId === 'gemini',
  );

  if (input.role === 'planner' || input.role === 'researcher') {
    const preferred = gemini ?? qwen ?? availableProviders[0];
    if (!preferred) {
      throw new Error('No providers are currently available for delegation.');
    }
    return buildRecommendation(
      {
        prompt: input.prompt,
        workspacePath: input.workspacePath,
        providers: input.providers,
        preferredProviderId: input.preferredProviderId ?? null,
        requiredTools: input.requiredTools ?? [],
        toolPlane: input.toolPlane ?? null,
      },
      preferred.providerId,
      'analysis-first',
      0.86,
      `${preferred.providerId} is preferred for ${input.role} delegation because that role is analysis-heavy and benefits from an explicit subtask boundary.`,
    );
  }

  if (input.role === 'verifier') {
    const preferred = qwen ?? gemini ?? availableProviders[0];
    if (!preferred) {
      throw new Error('No providers are currently available for delegation.');
    }
    return buildRecommendation(
      {
        prompt: input.prompt,
        workspacePath: input.workspacePath,
        providers: input.providers,
        preferredProviderId: input.preferredProviderId ?? null,
        requiredTools: input.requiredTools ?? [],
        toolPlane: input.toolPlane ?? null,
      },
      preferred.providerId,
      'tool-first',
      0.87,
      `${preferred.providerId} is preferred for verifier delegation because verification often needs the stronger implementation and tool-execution path.`,
    );
  }

  const preferred = qwen ?? gemini ?? availableProviders[0];
  if (!preferred) {
    throw new Error('No providers are currently available for delegation.');
  }
  return buildRecommendation(
      {
        prompt: input.prompt,
        workspacePath: input.workspacePath,
        providers: input.providers,
        preferredProviderId: input.preferredProviderId ?? null,
        requiredTools: input.requiredTools ?? [],
        toolPlane: input.toolPlane ?? null,
      },
    preferred.providerId,
    'tool-first',
    0.82,
    `${preferred.providerId} is preferred for ${input.role} delegation because this subtask looks implementation-oriented.`,
  );
}

export function buildDelegatedPrompt(
  input: BuildDelegatedPromptInput,
): string {
  const sourceOutput = input.sourceOutput.trim() || 'No final assistant output was captured.';

  return [
    `You are the ${input.role} for a delegated Qwemini subtask.`,
    'Complete only the delegated scope and keep the result concise and inspectable.',
    '',
    `Source provider: ${input.sourceProviderId}`,
    `Original task: ${input.sourceRun.prompt}`,
    `Delegated subtask: ${input.prompt}`,
    '',
    'Source result:',
    sourceOutput,
  ].join('\n');
}

export function recommendHandoffRoute(
  input: RecommendHandoffRouteInput,
): OrchestrationRecommendation {
  return recommendProviderRoute({
    prompt: input.prompt,
    workspacePath: input.workspacePath,
    providers: input.providers,
    preferredProviderId: input.preferredProviderId ?? null,
    requiredTools: input.requiredTools ?? [],
    toolPlane: input.toolPlane ?? null,
  });
}

export function buildHandoffPrompt(
  input: BuildHandoffPromptInput,
): string {
  const sourceOutput = input.sourceOutput.trim() || 'No final assistant output was captured.';

  return [
    'You are continuing a handed-off Qwemini task in a new main session.',
    'Continue from the prior result instead of restarting from scratch.',
    '',
    `Source provider: ${input.sourceProviderId}`,
    `Original task: ${input.sourceRun.prompt}`,
    `Handoff instruction: ${input.prompt}`,
    '',
    'Prior result:',
    sourceOutput,
  ].join('\n');
}
