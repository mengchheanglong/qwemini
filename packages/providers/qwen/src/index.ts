import { randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type {
  ProviderAdapter,
  ProviderCapabilities,
  ProviderConnectedTool,
  ProviderConnectedToolQuery,
  ProviderHealth,
  ProviderRunContext,
  ProviderRunHandle,
  RoutingToolRequirement,
  ToolDescriptorSource,
  ProviderToolCapability,
  WorkbenchEvent,
} from '@qwemini/protocol';
import { inferRoutingToolRequirement } from '@qwemini/protocol';
import {
  type CLIAssistantMessage,
  type ControlCancelRequest,
  type CLIControlRequest,
  type CLIControlResponse,
  type CLIResultMessage,
  type CLISystemMessage,
  type CLIUserMessage,
  type CLIPartialAssistantMessage,
  type ControlRequestPayload,
  isCLIAssistantMessage,
  isCLIPartialAssistantMessage,
  isCLIResultMessage,
  isCLISystemMessage,
  isCLIUserMessage,
  isControlCancel,
  isControlRequest,
  isControlResponse,
  isToolResultBlock,
  isToolUseBlock,
} from '../../../../vendor/qwen-code/packages/cli/src/nonInteractive/types.js';
import {
  StreamJsonParseError,
  parseStreamJsonLine,
} from '../../../../vendor/qwen-code/packages/cli/src/nonInteractive/io/StreamJsonInputReader.js';
import { StreamJsonOutputAdapter } from '../../../../vendor/qwen-code/packages/cli/src/nonInteractive/io/StreamJsonOutputAdapter.js';
import {
  ControlDispatcher,
  isCanUseToolRequest,
} from '../../../../vendor/qwen-code/packages/cli/src/nonInteractive/control/ControlDispatcher.js';
import { ControlContext } from '../../../../vendor/qwen-code/packages/cli/src/nonInteractive/control/ControlContext.js';

type CommandResult = {
  code: number | null;
  output: string;
  errorMessage: string | null;
};

const DEFAULT_CONNECTED_TOOL_PROBE_TIMEOUT_MS = 2500;

function getConnectedToolProbeTimeoutMs(): number {
  const configured = Number(process.env.QWEMINI_CONNECTED_TOOL_PROBE_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_CONNECTED_TOOL_PROBE_TIMEOUT_MS;
  }

  return Math.max(250, Math.trunc(configured));
}

type QwenLaunchSpec = {
  command: string;
  argsPrefix: string[];
  description: string;
  source: 'override' | 'vendored' | 'external';
};

type QwenCliProviderOptions = {
  command?: string;
  nodeCommand?: string;
  rootPath?: string;
};

const VENDORED_QWEN_CANDIDATES = [
  ['vendor', 'qwen-code', 'packages', 'cli', 'dist', 'index.js'],
  ['vendor', 'qwen-code', 'dist', 'cli.js'],
  ['vendor', 'qwen-code', 'packages', 'cli', 'dist', 'cli.js'],
];
const QWEN_CAPABILITIES: ProviderCapabilities = {
  daemonApprovalMediation: true,
  resumableSessions: true,
  checkpointEvents: true,
};
const QWEN_TOOL_CATALOG: ProviderToolCapability[] = [
  {
    name: 'workspace-read',
    requirement: 'workspace-read',
    source: 'provider',
    permissionModel: 'auto',
    detail: 'Qwen exposes strong local workspace inspection behavior through the daemon-owned runtime path.',
  },
  {
    name: 'workspace-write',
    requirement: 'workspace-write',
    source: 'provider',
    permissionModel: 'ask',
    detail: 'Qwen is the stronger write-oriented provider path in the current daemon runtime.',
  },
  {
    name: 'shell',
    requirement: 'shell',
    source: 'provider',
    permissionModel: 'ask',
    detail: 'Qwen has the stronger daemon-controlled shell and checkpoint path today.',
  },
];

type McpListProbeStatus = 'failed' | 'timeout' | 'empty' | 'configured';

function isTimeoutCommandResult(result: CommandResult): boolean {
  return (
    result.code === null &&
    typeof result.errorMessage === 'string' &&
    /timed out/i.test(result.errorMessage)
  );
}

function applyMcpListProbeMetadata(
  tools: ProviderConnectedTool[],
  status: McpListProbeStatus,
  detail: string | null,
): ProviderConnectedTool[] {
  return tools.map((tool) => ({
    ...tool,
    metadata: {
      ...(tool.metadata ?? {}),
      mcpListProbeStatus: status,
      mcpListProbeSurface: 'qwen.mcp.list',
      ...(detail ? { mcpListProbeDetail: detail } : {}),
    },
  }));
}

function parseConfiguredMcpServers(output: string): string[] {
  if (!output || /No MCP servers configured/i.test(output)) {
    return [];
  }

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) {
        return false;
      }
      if (/^Loaded cached credentials\.?$/i.test(line)) {
        return false;
      }
      if (/^Configured MCP servers/i.test(line)) {
        return false;
      }
      return true;
    })
    .map((line) =>
      line
        .replace(/^[\-\*\d\.\)\s]+/, '')
        .split(/\s+/)[0] ?? line,
    )
    .filter(Boolean);
}

function parseToolContent(content: unknown): CLIUserMessage['message']['content'][] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content;
}

function inferRequirementFromToolName(
  toolName: string,
): RoutingToolRequirement | null {
  return inferRoutingToolRequirement({
    toolName,
  });
}

function inferSourceFromRequirement(
  requirement: RoutingToolRequirement,
): ToolDescriptorSource {
  return requirement === 'mcp' ? 'mcp' : 'provider';
}

function extractText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((block) => {
      if (isToolUseBlock(block) || isToolResultBlock(block)) {
        return '';
      }

      if ('text' in block && typeof block.text === 'string') {
        return block.text;
      }

      if ('thinking' in block && typeof block.thinking === 'string') {
        return block.thinking;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function createEvent(
  context: ProviderRunContext,
  type: WorkbenchEvent['type'],
  payload: Record<string, unknown>,
): WorkbenchEvent {
  return {
    id: randomUUID(),
    sessionId: context.session.id,
    runId: context.run.id,
    timestamp: new Date().toISOString(),
    source: 'qwen',
    type,
    payload,
  };
}

async function syncProviderSessionId(
  context: ProviderRunContext,
  state: { providerSessionId: string | null },
  providerSessionId: string | null | undefined,
): Promise<void> {
  const nextProviderSessionId =
    typeof providerSessionId === 'string' && providerSessionId.length > 0
      ? providerSessionId
      : null;
  if (!nextProviderSessionId || nextProviderSessionId === state.providerSessionId) {
    return;
  }

  state.providerSessionId = nextProviderSessionId;
  await context.updateSession({
    providerSessionId: nextProviderSessionId,
  });
}

function resolveCommand(command: string): string {
  if (process.platform === 'win32' && command === 'qwen') {
    return 'qwen.cmd';
  }

  return command;
}

function shouldUseShell(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function isNodeScript(candidate: string): boolean {
  return /\.(c|m)?js$/i.test(candidate);
}

function resolveQwenNodeInvocation(
  spec: QwenLaunchSpec,
): { command: string; argsPrefix: string[] } | null {
  if (process.platform !== 'win32') {
    return null;
  }

  const executable = resolveCommand(spec.command);
  const basename = path.basename(executable).toLowerCase();
  if (basename !== 'qwen' && basename !== 'qwen.cmd') {
    return null;
  }

  let shimPath = executable;
  if (!/^[a-zA-Z]:\\|^\\\\/.test(shimPath)) {
    const lookup = spawnSync('where.exe', [executable], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
    });
    const firstMatch = lookup.stdout
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (!firstMatch) {
      return null;
    }
    shimPath = firstMatch;
  }

  const scriptPath = path.join(
    path.dirname(shimPath),
    'node_modules',
    '@qwen-code',
    'qwen-code',
    'cli.js',
  );
  if (!existsSync(scriptPath)) {
    return null;
  }

  return {
    command: 'node',
    argsPrefix: [scriptPath, ...spec.argsPrefix],
  };
}

function buildSpawnSpec(spec: QwenLaunchSpec, args: string[]): {
  executable: string;
  args: string[];
  shell: boolean;
} {
  const nodeInvocation = resolveQwenNodeInvocation(spec);
  if (nodeInvocation) {
    return {
      executable: nodeInvocation.command,
      args: [...nodeInvocation.argsPrefix, ...args],
      shell: false,
    };
  }

  const executable = resolveCommand(spec.command);
  return {
    executable,
    args: [...spec.argsPrefix, ...args],
    shell: shouldUseShell(executable),
  };
}

function describeLaunchPath(spec: QwenLaunchSpec): string {
  return resolveQwenNodeInvocation(spec)
    ? `${spec.description} via direct node entrypoint`
    : spec.description;
}

function describeRuntime(spec: QwenLaunchSpec, versionLabel: string): string {
  if (spec.source === 'vendored') {
    return `Vendored Qwen runtime ${versionLabel} ready (${describeLaunchPath(spec)}).`;
  }

  return `Qwen CLI ${versionLabel} ready (${describeLaunchPath(spec)}).`;
}

function describeInstalledRuntime(
  spec: QwenLaunchSpec,
  versionLabel: string,
): string {
  if (spec.source === 'vendored') {
    return `Vendored Qwen runtime ${versionLabel} installed (${describeLaunchPath(spec)}).`;
  }

  return `Qwen CLI ${versionLabel} installed (${describeLaunchPath(spec)}).`;
}

async function runCommand(
  spec: QwenLaunchSpec,
  args: string[],
  timeoutMs = 0,
): Promise<CommandResult> {
  const spawnSpec = buildSpawnSpec(spec, args);
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(spawnSpec.executable, spawnSpec.args, {
      env: process.env,
      shell: spawnSpec.shell,
      windowsHide: true,
    });

    let output = '';
    const resolveOnce = (result: CommandResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    const timeout =
      timeoutMs > 0
        ? setTimeout(() => {
            if (child.exitCode === null && !child.killed) {
              child.kill();
            }

            resolveOnce({
              code: null,
              output: output.trim(),
              errorMessage: `Command timed out after ${timeoutMs}ms.`,
            });
          }, timeoutMs)
        : null;

    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('error', (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      resolveOnce({
        code: null,
        output: output.trim(),
        errorMessage: error.message,
      });
    });

    child.on('close', (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      resolveOnce({
        code,
        output: output.trim(),
        errorMessage: null,
      });
    });
  });
}

async function probeCommand(spec: QwenLaunchSpec): Promise<ProviderHealth> {
  const version = await runCommand(spec, ['--version']);
  if (version.code !== 0) {
    return {
      providerId: 'qwen',
      available: false,
      detail:
        version.errorMessage ??
        version.output ??
        `Qwen runtime is not available (${spec.description}).`,
      capabilities: QWEN_CAPABILITIES,
    };
  }

  const versionLabel = version.output.split(/\r?\n/, 1)[0]?.trim() || 'unknown';
  const auth = await runCommand(spec, ['auth', 'status']);
  const authMissing = /No authentication method configured/i.test(auth.output);

  if (auth.errorMessage) {
    return {
      providerId: 'qwen',
      available: false,
      detail: `${describeInstalledRuntime(spec, versionLabel)} Auth status could not be checked: ${auth.errorMessage}`,
      capabilities: QWEN_CAPABILITIES,
    };
  }

  if (authMissing) {
    return {
      providerId: 'qwen',
      available: false,
      detail: `${describeInstalledRuntime(spec, versionLabel)} Headless auth is not configured.`,
      capabilities: QWEN_CAPABILITIES,
    };
  }

  return {
    providerId: 'qwen',
    available: true,
    detail: describeRuntime(spec, versionLabel),
    capabilities: QWEN_CAPABILITIES,
  };
}

export class QwenCliProvider implements ProviderAdapter {
  readonly id = 'qwen';
  readonly displayName = 'Qwen CLI';

  private readonly commandOverride: string | null;
  private readonly nodeCommand: string;
  private readonly rootPath: string;

  constructor(options: QwenCliProviderOptions = {}) {
    const commandOverride = options.command ?? process.env.QWEMINI_QWEN_COMMAND;
    this.commandOverride = commandOverride?.trim() || null;
    this.nodeCommand =
      options.nodeCommand ?? process.env.QWEMINI_NODE_COMMAND ?? 'node';
    this.rootPath = path.resolve(options.rootPath ?? process.cwd());
  }

  async capabilities(): Promise<ProviderCapabilities> {
    return QWEN_CAPABILITIES;
  }

  async healthCheck(): Promise<ProviderHealth> {
    return probeCommand(this.resolveLaunchSpec());
  }

  async toolCatalog(): Promise<ProviderToolCapability[]> {
    return QWEN_TOOL_CATALOG;
  }

  async enumerateConnectedTools(
    _query: ProviderConnectedToolQuery,
  ): Promise<ProviderConnectedTool[]> {
    const launchSpec = this.resolveLaunchSpec();
    const connected: ProviderConnectedTool[] = QWEN_TOOL_CATALOG.map((tool) => ({
      name: tool.name,
      requirement: tool.requirement,
      source: tool.source,
      detail: tool.detail,
      metadata: {
        confirmedBy: 'provider-cli',
        providerSurface: 'qwen.toolCatalog',
      },
    }));

    const mcp = await runCommand(
      launchSpec,
      ['mcp', 'list'],
      getConnectedToolProbeTimeoutMs(),
    );
    if (mcp.code !== 0) {
      const probeStatus: McpListProbeStatus = isTimeoutCommandResult(mcp)
        ? 'timeout'
        : 'failed';
      return applyMcpListProbeMetadata(
        connected,
        probeStatus,
        mcp.errorMessage ??
          mcp.output ??
          `qwen mcp list exited with code ${mcp.code ?? 'unknown'}.`,
      );
    }

    const servers = parseConfiguredMcpServers(mcp.output);
    if (servers.length === 0) {
      return applyMcpListProbeMetadata(
        connected,
        'empty',
        'Qwen CLI reported no configured MCP servers.',
      );
    }

    const withMcpProbe = applyMcpListProbeMetadata(
      connected,
      'configured',
      'Qwen CLI reported configured MCP servers.',
    );

    withMcpProbe.push({
      name: 'mcp',
      requirement: 'mcp',
      source: 'mcp',
      detail:
        'Qwen CLI reports configured MCP servers through `qwen mcp list` for this runtime.',
      metadata: {
        confirmedBy: 'provider-cli',
        providerSurface: 'qwen.mcp.list',
        servers,
        mcpListProbeStatus: 'configured',
        mcpListProbeSurface: 'qwen.mcp.list',
        mcpListProbeDetail: 'Qwen CLI reported configured MCP servers.',
      },
    });

    return withMcpProbe;
  }

  async startRun(context: ProviderRunContext): Promise<ProviderRunHandle> {
    const seenToolStarts = new Set<string>();
    const seenToolRegistrations = new Set<string>();
    const sessionState = {
      providerSessionId: context.session.providerSessionId,
    };
    let finished = false;
    const launchSpec = this.resolveLaunchSpec();
    const extraArgs = (process.env.QWEMINI_QWEN_ARGS ?? '')
      .split(' ')
      .map((value) => value.trim())
      .filter(Boolean);
    const spawnSpec = buildSpawnSpec(launchSpec, [
      ...(context.session.providerSessionId
        ? ['--resume', context.session.providerSessionId]
        : []),
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--approval-mode',
      'default',
      '--channel',
      'SDK',
      ...extraArgs,
    ]);

    const child = spawn(
      spawnSpec.executable,
      spawnSpec.args,
      {
        cwd: context.session.workspacePath,
        env: process.env,
        shell: spawnSpec.shell,
        windowsHide: true,
      },
    );
    const streamJson = new StreamJsonOutputAdapter(child.stdin!);
    const controlAbortController = new AbortController();
    const controlContext = new ControlContext({
      streamJson,
      sessionId: context.session.providerSessionId ?? context.session.id,
      abortSignal: controlAbortController.signal,
    });
    const controlDispatcher = new ControlDispatcher(controlContext, {
      handleRequest: async (payload) =>
        this.handleControlRequest({
          context,
          payload,
        }),
    });

    const publish = async (
      type: WorkbenchEvent['type'],
      payload: Record<string, unknown>,
    ): Promise<void> => {
      if (type === 'run.completed' || type === 'run.failed') {
        finished = true;
      }

      await context.emitEvent(createEvent(context, type, payload));
    };

    child.on('error', async (error) => {
      controlAbortController.abort();
      controlDispatcher.markInputClosed();
      controlDispatcher.shutdown(
        `Failed to launch Qwen runtime: ${error.message}`,
      );
      await publish('run.failed', {
        message: 'Failed to launch Qwen runtime',
        detail: `${launchSpec.description}: ${error.message}`,
      });
    });

    readline
      .createInterface({ input: child.stdout! })
      .on('line', (line) => {
        void this
          .handleStdoutLine({
            context,
            line,
            seenToolStarts,
            seenToolRegistrations,
            publish,
            controlDispatcher,
            sessionState,
          })
          .catch(async (error) => {
            await publish('run.output.delta', {
              stream: 'stderr',
              text: `Qwen control bridge error: ${error instanceof Error ? error.message : String(error)}`,
            });
          });
      });

    readline
      .createInterface({ input: child.stderr! })
      .on('line', (line) => {
        void publish('run.output.delta', {
          stream: 'stderr',
          text: line,
        });
      });

    child.on('close', async (code) => {
      controlAbortController.abort();
      controlDispatcher.markInputClosed();
      controlDispatcher.shutdown(
        code === 0
          ? 'Qwen runtime closed.'
          : `Qwen runtime exited with code ${code ?? 'unknown'}.`,
      );
      if (code === 0) {
        return;
      }

      if (!finished) {
        await publish('run.failed', {
          message: 'Qwen runtime exited unexpectedly',
          detail: launchSpec.description,
          exitCode: code,
        });
      }
    });

    try {
      const initializeResponse = await controlDispatcher.sendControlRequest({
        subtype: 'initialize',
      });
      const initializePayload =
        initializeResponse.response &&
        typeof initializeResponse.response === 'object' &&
        'subtype' in initializeResponse.response &&
        initializeResponse.response.subtype === 'initialize'
          ? initializeResponse.response
          : null;
      const providerSessionId =
        initializePayload &&
        'session_id' in initializePayload &&
        typeof initializePayload.session_id === 'string' &&
        initializePayload.session_id.length > 0
          ? initializePayload.session_id
          : null;
      if (providerSessionId) {
        await context.updateSession({
          providerSessionId,
        });
        sessionState.providerSessionId = providerSessionId;
      }

      await streamJson.send({
        type: 'user',
        message: {
          role: 'user',
          content: context.run.prompt,
        },
        parent_tool_use_id: null,
      });
    } catch (error) {
      await publish('run.failed', {
        message: 'Failed to bootstrap Qwen SDK session',
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      cancel: async () => {
        if (finished || child.exitCode !== null || child.killed) {
          return;
        }

        try {
          await controlDispatcher.sendControlRequest(
            {
              subtype: 'interrupt',
            },
            1500,
            controlAbortController.signal,
          );
        } catch {
          // Fall through to process termination if the control channel is unavailable.
        }

        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            if (child.exitCode === null && !child.killed) {
              child.kill();
            }
            resolve();
          }, 1500);

          child.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      },
    };
  }

  private async handleStdoutLine({
    context,
    line,
    seenToolStarts,
    seenToolRegistrations,
    publish,
    controlDispatcher,
    sessionState,
  }: {
    context: ProviderRunContext;
    line: string;
    seenToolStarts: Set<string>;
    seenToolRegistrations: Set<string>;
    publish: (
      type: WorkbenchEvent['type'],
      payload: Record<string, unknown>,
    ) => Promise<void>;
    controlDispatcher: ControlDispatcher;
    sessionState: { providerSessionId: string | null };
  }): Promise<void> {
    if (!line.trim()) {
      return;
    }

    let message:
      | CLIAssistantMessage
      | ControlCancelRequest
      | CLIControlRequest
      | CLIControlResponse
      | CLIResultMessage
      | CLISystemMessage
      | CLIUserMessage
      | CLIPartialAssistantMessage;
    try {
      message = parseStreamJsonLine(line);
    } catch (error) {
      if (error instanceof StreamJsonParseError) {
        await publish('run.output.delta', {
          stream: 'stdout',
          text: line,
        });
        return;
      }

      await publish('run.output.delta', {
        stream: 'stdout',
        text: line,
      });
      return;
    }

    await syncProviderSessionId(
      context,
      sessionState,
      'session_id' in message ? message.session_id : null,
    );

    if (isControlRequest(message)) {
      void controlDispatcher.dispatch(message).catch(async (error) => {
        await publish('run.output.delta', {
          stream: 'stderr',
          text: `Qwen control dispatch error: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
      return;
    }

    if (isControlResponse(message)) {
      controlDispatcher.handleControlResponse(message);
      return;
    }

    if (isControlCancel(message)) {
      controlDispatcher.handleCancel(message.request_id);
      return;
    }

    if (isCLIPartialAssistantMessage(message)) {
      const event = message.event;
      if (
        event.type === 'content_block_delta' &&
        ('text' in event.delta || 'thinking' in event.delta)
      ) {
        let stream: 'assistant' | 'thinking';
        let text: string | null = null;

        if ('thinking' in event.delta) {
          stream = 'thinking';
          text = event.delta.thinking;
        } else {
          stream = 'assistant';
          text = event.delta.text;
        }

        if (text) {
          await publish('run.output.delta', {
            stream,
            text,
          });
        }
      }

      if (
        event.type === 'content_block_start' &&
        isToolUseBlock(event.content_block)
      ) {
        await publish('tool.requested', {
          toolUseId: event.content_block.id,
          toolName: event.content_block.name,
          input: event.content_block.input ?? {},
        });
      }

      if (event.type === 'tool_progress' && event.tool_use_id) {
        if (!seenToolStarts.has(event.tool_use_id)) {
          seenToolStarts.add(event.tool_use_id);
          await publish('tool.started', {
            toolUseId: event.tool_use_id,
            progress: event.content ?? {},
          });
        } else {
          await publish('run.output.delta', {
            stream: 'tool',
            text: JSON.stringify(event.content ?? {}),
          });
        }
      }

      return;
    }

    if (isCLIAssistantMessage(message)) {
      const content = message.message?.content;
      const text = extractText(content);
      if (text) {
        await publish('message.created', {
          role: 'assistant',
          content: text,
        });
      }

      return;
    }

    if (isCLIUserMessage(message)) {
      const blocks = parseToolContent(message.message?.content);
      for (const block of blocks) {
        if (isToolResultBlock(block)) {
          await publish('tool.completed', {
            toolUseId: block.tool_use_id,
            isError: Boolean(block.is_error),
            output:
              typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content ?? {}),
          });
        }
      }
      return;
    }

    if (isCLISystemMessage(message)) {
      const runtimeTools = Array.isArray(message.tools)
        ? message.tools
            .filter((tool): tool is string => typeof tool === 'string')
            .map((tool) => tool.trim())
            .filter(Boolean)
        : [];

      for (const toolName of runtimeTools) {
        if (seenToolRegistrations.has(toolName)) {
          continue;
        }

        const requirement = inferRequirementFromToolName(toolName);
        if (!requirement) {
          continue;
        }

        seenToolRegistrations.add(toolName);
        await publish('tool.registered', {
          toolName,
          requirement,
          source: inferSourceFromRequirement(requirement),
          detail:
            'Qwen runtime reported this connected tool through stream-json system metadata.',
          metadata: {
            confirmedBy: 'provider-runtime',
            providerSurface: 'qwen.system.tools',
            systemSubtype: message.subtype,
            ...(message.capabilities && typeof message.capabilities === 'object'
              ? {
                  capabilities: message.capabilities,
                }
              : {}),
          },
        });
      }

      if (message.subtype?.includes('checkpoint')) {
        await publish('checkpoint.saved', {
          detail: message.subtype,
          providerSessionId: message.session_id ?? null,
        });
      }
      return;
    }

    if (isCLIResultMessage(message)) {
      if (Array.isArray(message.permission_denials)) {
        for (const denial of message.permission_denials) {
          await publish('tool.denied', {
            toolUseId: denial.tool_use_id ?? null,
            toolName: denial.tool_name ?? 'unknown',
            input: denial.tool_input ?? {},
          });
        }
      }

      if (message.is_error) {
        await publish('run.failed', {
          message: message.error?.message ?? 'Qwen run failed',
          detail: message.error?.type ?? null,
          usage: message.usage ?? {},
        });
        return;
      }

      await publish('run.completed', {
        result: message.result ?? '',
        usage: message.usage ?? {},
      });
    }
  }

  private async handleControlRequest({
    context,
    payload,
  }: {
    context: ProviderRunContext;
    payload: ControlRequestPayload;
  }): Promise<Record<string, unknown>> {
    if (!isCanUseToolRequest(payload)) {
      throw new Error(
        `Unsupported control request subtype: ${payload.subtype ?? 'unknown'}`,
      );
    }

    const toolName = payload.tool_name?.trim();
    if (!toolName) {
      return {
        subtype: 'can_use_tool',
        behavior: 'deny',
        message: 'Missing tool name in control request.',
      };
    }

    const input =
      payload.input && typeof payload.input === 'object'
        ? (payload.input as Record<string, unknown>)
        : {};

    const metadata: Record<string, unknown> = {
      blockedPath: payload.blocked_path ?? null,
    };

    if (payload.permission_suggestions !== undefined) {
      metadata.permissionSuggestions = payload.permission_suggestions;
    }

    const decision = await context.requestApproval({
      toolName,
      toolUseId: payload.tool_use_id ?? null,
      input,
      metadata,
    });

    return {
      subtype: 'can_use_tool',
      behavior: decision.behavior,
      ...(decision.message ? { message: decision.message } : {}),
      ...(decision.updatedInput ? { updatedInput: decision.updatedInput } : {}),
    };
  }

  private resolveLaunchSpec(): QwenLaunchSpec {
    if (this.commandOverride) {
      if (isNodeScript(this.commandOverride)) {
        return {
          command: this.nodeCommand,
          argsPrefix: [this.commandOverride],
          description: `command override via ${this.commandOverride}`,
          source: 'override',
        };
      }

      return {
        command: this.commandOverride,
        argsPrefix: [],
        description: `command override via ${this.commandOverride}`,
        source: 'override',
      };
    }

    for (const segments of VENDORED_QWEN_CANDIDATES) {
      const candidatePath = path.join(this.rootPath, ...segments);
      if (!existsSync(candidatePath)) {
        continue;
      }

      return {
        command: this.nodeCommand,
        argsPrefix: [candidatePath],
        description: `vendored build at ${candidatePath}`,
        source: 'vendored',
      };
    }

    return {
      command: 'qwen',
      argsPrefix: [],
      description: 'external qwen on PATH',
      source: 'external',
    };
  }
}
