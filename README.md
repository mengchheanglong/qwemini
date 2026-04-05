# Qwemini

**One workspace for Qwen and Gemini**

Qwemini is an open-source agent workspace that brings **Qwen CLI** and **Gemini CLI** into one unified environment. Instead of using each tool separately in raw terminal flows, Qwemini provides a shared workspace for sessions, tools, context, and orchestration, so both engines can work inside the same system with a cleaner developer experience.

Qwemini is designed to be:

- **Open-source** — lightweight, hackable, and community-friendly  
- **Unified** — one place to run and manage both Qwen and Gemini  
- **Extensible** — ready for more tools, plugins, and providers over time  
- **Practical** — focused on real developer workflows, not just chat  

---

## Overview

Today, Qwen CLI and Gemini CLI are powerful on their own, but using them separately can feel fragmented. Qwemini aims to solve that by creating a shared environment where multiple agent backends can operate inside one workspace.

The goal is not just to wrap two CLIs in a thin shell, but to build a real developer environment with:

- shared sessions
- shared context
- shared tools
- orchestration across engines
- room for plugins and future providers

---

## Vision

Qwemini starts with **Qwen** and **Gemini**, but the long-term direction is bigger:

- a unified agent workspace
- a shared protocol for tools and events
- orchestration across multiple coding agents
- local-first and open by default
- extensible enough to support future engines and plugins

---

## Core Idea

Instead of thinking of Qwen CLI and Gemini CLI as separate tools, Qwemini treats them as **engines inside one workspace**.

That workspace can provide:

- a common session layer
- a shared tool plane
- orchestration and routing
- persistent state and history
- a better interface than raw terminal-only workflows

---

## Initial Goals

- Integrate **Qwen CLI** and **Gemini CLI** into one environment
- Provide a shared session and context model
- Support tool integration through a common interface
- Build an orchestration layer for switching or routing work between engines
- Keep the system lightweight, local-first, and easy to extend

---

## Planned Architecture

Qwemini will likely be structured around a few core layers:

### 1. Provider Adapters
Adapters for each backend engine, starting with:

- Qwen
- Gemini

### 2. Shared Workspace Layer
A common runtime for:

- session management
- state
- history
- artifacts
- approvals

### 3. Tool / MCP Layer
A shared place to connect tools and external capabilities.

### 4. Orchestration Layer
Logic for deciding how work flows between engines, tools, and future agents.

### 5. UI / Shell
A cleaner environment than raw terminal usage, while still keeping CLI power.

---

## Why Qwemini

Because powerful open tools should not feel isolated.

Qwemini is about making free and open agent tooling feel like a real environment:
simple, composable, and built for experimentation.

---

## Status

**First executable slice in progress**

The repo now includes:

- a minimal local daemon
- a React + TypeScript + Vite local web shell, with daemon-owned static hosting from built assets
- a shared protocol package
- a SQLite-backed state package
- a first Qwen provider seam that uses Qwen's stream-json SDK/control path
- a first Gemini provider seam that uses Gemini CLI stream-json output
- daemon-owned approval records and approval resolution API
- an approvals pane in the local shell
- an explicit approval-wait run state in the daemon and shell
- persisted provider session IDs for Qwen resume
- persisted provider session IDs for Gemini resume
- persisted checkpoint records in the shared state layer
- an explicit recovery action that can fork a new session from saved provider context
- a richer run inspector that separates live transcript deltas from final assistant messages
- a typed React shell-state bridge for run history, session/archive/orchestration, checkpoints, approvals, artifacts, tool-plane panels, shell summary/status surfaces, and shell control/form state, while keeping daemon/API ownership unchanged
- a Panes-derived shell layout reset with a thin top menu bar, a left project/session rail, a dominant center conversation pane, a right inspector rail, a bottom-docked composer, persisted resizable columns, grouped quick-open, keyboard shell controls, a collapsible utility rail, and the same daemon/controller contract underneath
- a tighter Panes donor-alignment pass that removes more of the old accent-heavy dashboard chrome, adds a sparse empty conversation state, and makes the shell read more like a flat desktop workbench than stacked cards
- a more literal Panes frontend donor port for the shell frame, with a donor-style left rail section model, a calmer inspector header/navigation frame, and donor-driven rail proportions while preserving the same Qwemini controller/daemon behavior underneath
- a donor-style rail/body refinement that makes session/run/archive rows and inspector cards follow the Panes project-thread and Changes-panel rhythm more closely, instead of generic stacked list cards
- a terminal-style center-pane refinement that makes the main workspace read closer to the Panes terminal layout, with a flatter tab strip, darker canvas, mono output lines, and tighter integrated composer spacing
- a tighter center-pane proportion pass that moves runtime status into a bottom terminal footer and brings the header, tab strip, canvas, and composer spacing closer to the donor proportions
- a compact donor-style center-header control group that replaces labeled action buttons with a tighter icon-only cluster while keeping the same Qwemini actions underneath
- a tighter donor-style header pass that flattens the center breadcrumb row and right inspector header into compact single-row bars with inline notes and calmer spacing
- a denser donor-style tab and inspector pass that turns the right rail into flatter changes-list rows and tightens the center/utility tab strips toward the donor terminal and git-panel rhythm
- a compact rail-and-composer pass that shrinks session setup into project-rail controls and turns the bottom prompt footer into a denser donor-style chat dock with pill controls and a circular send action
- a flatter tree-rhythm pass for the left rail that makes session/run/archive/flow rows read more like a donor project/thread tree, while further reducing composer control weight in the bottom dock
- a quieter center-canvas and dock pass that removes the extra composer header block, folds status hints into the bottom dock, and shrinks the empty-state treatment toward the donor's blank-workspace behavior
- a frame-spacing fidelity pass that tightens default rail widths, resize seams, header gutters, and center/inspector padding so the whole shell sits closer to the donor proportions
- a collapsed-inspector and type-scale pass that removes truncated right-rail header text when collapsed and reduces the shell font sizing toward the donor's denser desktop rhythm
- a center-palette pass that removes the earlier blue/teal tint from the middle workspace and aligns the canvas, header strip, and dock to the donor's neutral near-black colors
- a legacy-gradient cleanup that removes the last blue center backgrounds from shared panel surfaces so the middle pane actually stays neutral black under the donor shell
- a dark native-select pass that makes provider and policy dropdown popups follow the shell's dark donor palette instead of bright Windows-native menu colors
- a first-class persisted tool invocation ledger instead of a tool pane derived only from events
- a minimal archive summary view with per-session run history
- a vendoring-ready Qwen launch seam that can prefer a bounded in-repo donor build when present
- a first bounded Qwen vendor import for the stream-json wire contract and parser helper used by the provider
- a deeper bounded Qwen control-path import for the stream-json output adapter and control dispatcher shape used by the provider
- a session-scoped Qwen control context import that carries input-closed state through the vendored dispatcher path
- a non-blocking Qwen incoming control dispatch path so approval waits no longer stop later stdout events from being normalized
- a product-owned cancel flow that interrupts Qwen through the control channel before falling back to process kill
- a Windows Qwen direct-entrypoint launch path that resolves the global `qwen` shim to its Node entrypoint, so Qwemini no longer depends on shelling through `qwen.cmd`
- a Qwen session-metadata refresh path that now promotes later provider `session_id` updates into the daemon-owned session and checkpoint ledger instead of keeping only the bootstrap ID
- a session-level approval policy surface owned by the daemon/session ledger instead of only an env default
- archive/session summaries that now preserve whether a session was recovered from another session or from a checkpoint
- explicit provider capability flags in runtime health so Qwen/Gemini approval, resume, and checkpoint differences are visible in the product
- capability-aware shell guardrails so Gemini sessions no longer imply daemon-enforced approvals or provider checkpoint support that do not exist yet
- daemon-level capability enforcement so unsupported approval policies are rejected at the API boundary instead of only being disabled in the shell
- daemon run preflight plus shell availability guardrails so known-unavailable providers are blocked before a run starts instead of failing only inside adapter launch
- a Gemini ACP default path that routes Gemini permission requests through the daemon and shared approval ledger, with `QWEMINI_GEMINI_MODE=stream-json` retained as the fallback path
- a hardened Gemini ACP adapter that now preserves tool titles/output in the shared ledger, keeps cancellation terminal, and fails cleanly on the current Windows terminal-helper crash instead of leaving runs stuck forever
- a Qwemini-owned Windows Gemini runtime patch that preloads a bounded `node-pty` fix for Gemini ACP shell-command runs instead of requiring manual edits to the global Gemini install
- a first shared orchestration package above both providers, with daemon-owned `recommend` and `route` APIs plus a shell `Route Prompt` flow that can fork a new session onto the recommended runtime
- daemon-owned review and verify follow-up runs that can fork a completed run into explicit reviewer or verifier sessions, with orchestration lineage preserved in the session ledger and run timeline
- daemon-owned delegate and handoff runs that can fork a completed run into planner/research/verifier subtasks or a new main-session continuation, with orchestration role/kind preserved in the session ledger and run timeline
- MCP-aware routing signals in the daemon and shell, so orchestration can route on explicit tool requirements like `mcp`, `shell`, or `workspace-write` instead of relying only on prompt wording
- a daemon-backed orchestration board that groups routed and child sessions into inspectable flows, so review, verify, delegate, and handoff chains are visible as one product-owned lineage instead of isolated session rows
- a first shared `mcp-hub` signal layer that snapshots normalized tool readiness from provider availability plus recent tool-ledger history, so routing can cite concrete daemon-owned evidence instead of only prompt heuristics
- a workspace-scoped tool registry in `.qwemini/mcp.json` or `.mcp.json`, so MCP readiness now depends on actual configured servers for that workspace instead of only provider defaults
- provider-owned tool catalogs feeding the shared tool plane, so shell/write/network/MCP readiness is now declared by adapters and then filtered by workspace registry plus workspace-local observed history
- a session-aware tool-plane scope, so the daemon can answer both “what this workspace has used” and “what this active session has actually touched” when routing follow-up work
- daemon-owned live session tool registration signals, so session-scoped recommendations can include tools observed and registered in the active session, not just workspace-level history
- provider-connected Qwen/Gemini tool enumeration at run start, so explicit session registration records can represent provider-reported connected tools in addition to inferred event history
- provider-runtime registration ingestion from Qwen `system.tools` messages and Gemini ACP tool metadata through normalized `tool.registered` events, so live session registration evidence is no longer limited to startup CLI probes
- hardened requirement inference across daemon/provider/tool-plane paths, so shell-like registrations such as `run_shell_command` now classify as `shell` instead of accidental read-only matches
- a shared protocol-owned requirement classifier consumed by daemon, providers, and `mcp-hub`, so registration requirement inference no longer drifts across copied regex logic
- a deterministic registration validation script (`npm run check:registrations`) backed by fake Qwen runtime and fake Gemini ACP fixtures under `scripts/`, so runtime registration checks are repeatable without ad hoc temp harnesses
- a hardened Gemini launch path that accepts direct Node script command overrides (`.js/.mjs/.cjs`), avoiding fragile Windows `.cmd` quoting in provider health and probe flows
- a Windows Gemini global-install resolution fix that detects the current bundled CLI entrypoint layout (`bundle/gemini.js` as well as older `dist/index.js` layouts), so Gemini health checks and daemon launches now work on this machine without falling back to broken `.cmd --version` probing
- provider-cli connected-tool registrations now carry explicit `mcp list` probe metadata (`mcpListProbeStatus`, `mcpListProbeSurface`, `mcpListProbeDetail`), so startup probe fallback evidence is inspectable and distinct from provider-runtime `tool.registered` evidence
- expanded deterministic registration coverage now validates shell/workspace-read/mcp mappings and unclassified-name exclusion while forcing both `mcp list` failure and timeout fallback paths in fake Qwen and fake Gemini fixtures, including both mixed-outcome permutations where one provider times out while the other fails, plus an expected-vs-observed JSON scenario matrix that preserves provider-runtime, provider-cli fallback, and event-observed evidence partitions
- a dedicated shell Tool Plane evidence panel (backed by `apps/web/src/tool-plane.js`) that shows `provider-enumerated` vs `event-observed` registration signals per provider
- typed React inspector/archive panels, so those shell surfaces are no longer rendered through imperative helper modules hanging off the controller
- a validated end-to-end usability pass where Qwen and Gemini both complete real daemon-owned file-writing tasks in a disposable workspace, and Qwen manual-approval runs pause, accept a daemon approval decision, and resume to completion
- a first-run shell path that no longer needs a pre-created session before the composer works: send can create the session on demand, route can operate from draft workspace/provider state, and recommendation previews can run before session creation
- a deterministic shell usability validation script (`npm run check:shell`) that locks in first-run send/route behavior so the composer cannot silently regress back into a static pre-session UI
- a clearer composer interaction model with a visible `Send` button, inline send guidance, and `Enter` to send / `Shift+Enter` for newline behavior, so the primary run action is no longer hidden behind an unlabeled icon
- a readable run conversation view that groups streamed assistant output into paragraphs, renders Qwen thinking in a subdued style, and shows the original user prompt in the conversation flow instead of only assistant fragments
- a simplified main run surface that now centers on a single `Chat` view plus `Events`, removing the duplicate `Terminal` / `Output` split and styling the conversation closer to Codex/Claude thread UX
- a cleaner composer hierarchy where `Send` remains the obvious primary action and secondary orchestration actions (`Route`, `Delegate`, `Handoff`) sit behind a compact actions menu instead of competing in the main button row
- a more Codex-like composer footer with a compact `+` config menu, visible model/provider pill, visible access/permissions pill, and a quieter guidance row instead of the earlier dashboard-style footer clutter
- a closer Codex-style thread shell where the main tab is now `Thread`, assistant replies read as plain paragraphs, user prompts render as compact bubbles, thinking stays muted gray, advanced orchestration actions live inside the `+` menu, and the bottom footer strip now uses provider/access pill menus plus a simpler local-status bar
- a closer Codex-style message layout where user prompts render on the right side, and a denser Codex-like right inspector rail with compact section chips, darker utility cards, and calmer utility panel chrome
- a closer Codex-style composer surface with a larger rounded chat box, sans-serif prompt text, calmer placeholder text, and a less terminal-like input area
- a closer Codex-style left rail with denser thread/workspace rows, softer setup chrome, simpler thread metadata, and a calmer workspace/thread navigation hierarchy
- a closer Codex-style top shell and header strip, with a simpler workspace header, tighter action buttons, and a calmer `Context` utility heading
- a further left-rail/top-shell cleanup that removes the loud runtime status chrome, narrows the sidebar, flattens thread rows, and reduces the boxed dashboard feel
- a more literal Codex-style shell rewrite for the menu bar, left thread rail, centered thread rhythm, and bottom composer arrangement, while keeping the same daemon/controller behavior underneath

Current limitation:

- Gemini now defaults to ACP because that is the stronger Codex-like product seam, but `QWEMINI_GEMINI_MODE=stream-json` is still available as a fallback if ACP behavior regresses on another machine
- the Qwen bridge still runs the external CLI today, even though the provider can now prefer vendored build candidates under `vendor/qwen-code/` once that bounded donor slice is imported

## Development

```bash
npm install
npm run build:web
npm run dev
```

`npm run dev` now builds the web shell and starts the daemon so `http://127.0.0.1:4120` stays daemon-served.

Frontend-only iteration is also available:

```bash
npm run dev:web
```

Then open `http://127.0.0.1:4120`.

Validation:

```bash
npm run check
npm run check:shell
npm run check:registrations
# Optional CI-friendly JSON summary artifact:
npm run check:registrations:json
```

---

## Name

**Qwemini** = **Qwen + Gemini**

A simple open-source name for a shared workspace built around both.

---

## License

TBD
