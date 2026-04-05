import readline from 'node:readline';

const args = process.argv.slice(2);
const runtimeTools = (process.env.QWEMINI_FAKE_QWEN_RUNTIME_TOOLS ?? 'run_shell_command,read_file')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const shouldFailMcpList =
  process.env.QWEMINI_FAKE_QWEN_MCP_LIST_FAIL === '1' ||
  process.env.QWEMINI_FAKE_QWEN_MCP_LIST_FAIL === 'true';
const shouldTimeoutMcpList =
  process.env.QWEMINI_FAKE_QWEN_MCP_LIST_TIMEOUT === '1' ||
  process.env.QWEMINI_FAKE_QWEN_MCP_LIST_TIMEOUT === 'true';
const mcpListTimeoutMs = Math.max(
  1000,
  Number(process.env.QWEMINI_FAKE_QWEN_MCP_LIST_TIMEOUT_MS ?? 5000) || 5000,
);

function writeLine(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function handleCommandMode() {
  if (args.includes('--version')) {
    process.stdout.write('0.0.0-fake-qwen\n');
    process.exit(0);
    return true;
  }

  if (args[0] === 'auth' && args[1] === 'status') {
    process.stdout.write('Qwen OAuth\n');
    process.exit(0);
    return true;
  }

  if (args[0] === 'mcp' && args[1] === 'list') {
    if (shouldFailMcpList) {
      process.stderr.write('deterministic fake qwen mcp list failure\n');
      process.exit(1);
      return true;
    }

    if (shouldTimeoutMcpList) {
      setTimeout(() => {
        process.stdout.write('deterministic fake qwen mcp list timeout release\n');
        process.exit(0);
      }, mcpListTimeoutMs);
      return true;
    }

    process.stdout.write('No MCP servers configured\n');
    process.exit(0);
    return true;
  }

  return false;
}

function startStreamRuntime() {
  const sessionId = 'fake-qwen-session';
  let initialized = false;
  let completed = false;

  const input = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  input.on('line', (line) => {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }

    if (parsed?.type === 'control_request') {
      const requestId =
        typeof parsed.request_id === 'string' ? parsed.request_id : 'missing-request-id';
      const subtype = parsed.request?.subtype;

      if (subtype === 'initialize') {
        writeLine({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: requestId,
            response: {
              subtype: 'initialize',
              session_id: sessionId,
            },
          },
        });

        if (!initialized) {
          initialized = true;
          writeLine({
            type: 'system',
            subtype: 'runtime_tools',
            session_id: sessionId,
            tools: runtimeTools,
            capabilities: {
              deterministic: true,
            },
          });
        }
        return;
      }

      if (subtype === 'interrupt') {
        writeLine({
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: requestId,
            response: {
              subtype: 'interrupt',
            },
          },
        });
      }

      return;
    }

    if (parsed?.type === 'user' && !completed) {
      writeLine({
        type: 'assistant',
        session_id: sessionId,
        message: {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Deterministic fake Qwen response.',
            },
          ],
        },
        parent_tool_use_id: null,
      });

      writeLine({
        type: 'result',
        subtype: 'success',
        session_id: sessionId,
        is_error: false,
        result: 'deterministic-qwen-complete',
        usage: {
          input_tokens: 1,
          output_tokens: 1,
        },
        permission_denials: [],
      });

      completed = true;
      setTimeout(() => process.exit(0), 25);
    }
  });

  input.on('close', () => {
    if (!completed) {
      process.exit(0);
    }
  });
}

if (handleCommandMode()) {
  // Command mode exits in place.
} else if (args.includes('--input-format') && args.includes('stream-json')) {
  startStreamRuntime();
} else {
  process.stderr.write(`fake-qwen-runtime received unsupported args: ${args.join(' ')}\n`);
  process.exit(1);
}
