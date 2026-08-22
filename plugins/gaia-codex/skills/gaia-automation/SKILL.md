---
name: gaia-automation
description: 'Use when Codex needs live Gaia feedback through the Gaia extension, with or without a repository project binding.'
---

# Gaia Automation

Use this skill whenever Codex needs live Gaia data or actions through the Gaia extension. It supports both project-bound repository work and general Gaia operations from repositories, including the Gaia application repository, that do not contain `gaia.config.json`.

## Operating Modes

- **Bound-project mode:** A root-level `gaia.config.json` selects one default Gaia project. Use this mode for project specs, patches, migrations, project-scoped resources, operational logs, and other calls that require a project id.
- **Unbound general mode:** When `gaia.config.json` is absent, do not stop solely because the repository lacks a binding. Use the Gaia extension's OAuth-backed `gaia` MCP for general or platform operations whose required inputs are available from the request, the URL, trusted repository context, or earlier Gaia MCP results. Discussion lookup is a primary example.
- The Gaia extension provides the global OAuth-backed MCP server named `gaia` for `/api/mcp/gaia?tools=all`. It should expose Project Spec Operations plus discussions, evals, delivery process, project tasks, milestones, project versions, branches, environment promotion, agent/config operations, data model, document folders, governance, workflows, UI layouts, and other Gaia tools.
- Prefer OAuth for Codex. `codex mcp add gaia --url "https://thegaia.ai/api/mcp/gaia?tools=all"` starts the OAuth flow when Gaia advertises OAuth support. Use project-bound service-account keys only for legacy clients or non-interactive setups that cannot use OAuth.
- The Gaia MCP endpoint `/api/mcp/gaia?tools=all` is the default Codex route. Pass a project id when the exposed tool schema requires one, but only when it comes from `gaia.config.json`, an explicit user-provided value, a trusted Gaia URL/context, or a Gaia MCP result. Never invent a project id or substitute an unrelated project binding.
- Gaia maintainers may also configure a local Gaia server with `localGaiaBaseUrl` and `localProjectId` in `gaia.config.json`, plus an MCP server named `gaia-local` pointing at `https://gaia.localhost:1443/api/mcp/gaia?tools=all`. Use this local target only when the user explicitly asks to work against the local Gaia server and `localProjectId` is present and non-empty.
- Local CLI credentials or fallback config may live in `.env` or `.codex/config.toml`. Treat both files as secret-capable local material and never print or commit their values.

## Setup Check

Before using Gaia MCP tools:

1. Check whether root-level `gaia.config.json` exists.
2. If it exists, select the bound target. Use default `gaiaBaseUrl`, `projectId`, and the `gaia` MCP server unless the user explicitly asks for the local Gaia server.
3. If it does not exist, enter unbound general mode. Use the Gaia extension's `gaia` MCP server and inspect the exposed Gaia tools before trying browser login, direct database access, or asking the user for a project binding.
4. For a discussion URL or topic id, call `discussion_topic_get` with the extracted `topicId` and include comments when supported. For discussion discovery, use `discussion_topic_list` with the appropriate global/platform scope. Do this before treating authentication in a browser as the only access path.
5. In unbound general mode, use `gaia_mcp_skill_catalog` or `gaia_capability_inventory_get` when available to discover the native tool. If its schema still requires a project id, use only a trusted id already present in the request or returned by Gaia; otherwise report that specific scoped requirement after general Gaia tools have been exhausted.
6. For local Gaia server work, require a non-empty `localProjectId`, use `localGaiaBaseUrl` when present and non-empty or `https://gaia.localhost:1443`, and use the `gaia-local` MCP server. If `localProjectId` is missing or empty, stop and ask the user to add it to `gaia.config.json`; do not fall back to the default `projectId`.
7. Confirm the selected MCP server points at the matching `/api/mcp/gaia?tools=all` endpoint.
8. If MCP is not connected, tell the user to run:

```bash
codex mcp add gaia --url "https://thegaia.ai/api/mcp/gaia?tools=all"
```

For local Gaia server work, tell maintainers to run:

```bash
codex mcp add gaia-local --url "https://gaia.localhost:1443/api/mcp/gaia?tools=all"
```

If the user previously configured the older `gaia-project` server, tell them to remove it separately with `codex mcp remove gaia-project`. A successful Gaia Codex OAuth login uses 24-hour access tokens and a rolling 90-day refresh window, so active Codex sessions should renew silently. Another login is expected only after 90 days without a successful refresh, explicit revocation, or account/client disablement.

Use the actual active Gaia base URL from `gaia.config.json` in bound-project mode. In unbound general mode, use the Gaia extension's configured `gaia` server.

## Connection Recovery

Treat an OAuth challenge, `401`, `invalid_grant`, or an unavailable Gaia tool catalogue as a recoverable authentication event before describing the Gaia connection as lost.

1. Run `codex mcp get gaia` to confirm the existing server configuration. Do not remove a correctly configured server as the first recovery step.
2. If the server exists, run `codex mcp login gaia`, tell the user that Gaia browser approval is needed, and wait for that login flow to finish. If shell execution is unavailable, give the user that exact command instead.
3. After a successful login, retry the original Gaia MCP call once in the same task. Codex 0.148.0 and newer can recover the MCP server after OAuth reauthentication without restarting. If the installed Codex is older, recommend upgrading; when the current task still retains the stale connection, ask the user to start a new task after login.
4. Use `codex mcp add gaia --url "https://thegaia.ai/api/mcp/gaia?tools=all"` only when the `gaia` server is missing or its URL is incorrect.
5. If the retry fails with the same authentication error, report the exact failed recovery step and required user action. Do not fall back to browser scraping or direct database access for data the Gaia MCP should provide.

## Freshness and Patch Base Discipline

Treat the live Gaia project spec as authoritative and every repo export as a cache.

- Before drafting, editing, previewing, or applying any patch, call `project_spec_get_current` through the active MCP server with the active project id selected from `gaia.config.json`.
- Compare the live spec to `gaia/current-export.json` before trusting local patches. At minimum compare `project.id`, `version`, `exportedAt` when present, and a SHA-256 hash of the canonical JSON payload.
- If the live spec differs from `gaia/current-export.json`, stop and either refresh `gaia/current-export.json` from the live spec or explicitly mark the existing patch set as stale and rebase it.
- Generate RFC 6902 patches against the exact live export or refreshed local export you just inspected. Include `test` operations for the project id and the strongest available base markers.
- Before any live apply, run both checks: apply the patch locally to the same base export, then call `project_spec_patch_preview` against the bound project.
- After a live apply, call `project_spec_get_current` again, update `gaia/current-export.json`, record the new hash in `notes/session-log.md`, and only then prepare follow-up patches.

## Workflow

1. Detect bound-project or unbound general mode from the presence of `gaia.config.json`.
2. In unbound general mode, try the Gaia extension's native general/platform tool first. For discussions, use `discussion_topic_get` or `discussion_topic_list`; do not begin with browser login or direct database access.
3. In bound-project mode, call `project_spec_get_current` with the selected project id and establish the current live export hash before drafting or applying any patch.
4. Rebase or refresh local patch files when the live export and `gaia/current-export.json` differ.
5. Preview live project changes with `project_spec_patch_preview` before any apply step and keep every preview and apply scoped to the same active project id.
6. Use `project_spec_plan_migration` and `project_spec_apply_migration` only when the task explicitly calls for live project changes.
7. Use `gaia_mcp_skill_catalog` to understand available tool groups in either mode.
8. For evals, delivery process, project tasks, milestones, project versions, branches, environment promotion, governance, document folders, workflows, UI layouts, and agent/config operations, use the native tools exposed by the selected server whenever they are available. Pass the active project id for project-scoped tools.
9. For workflow end-to-end checks, prefer `workflow_run_with_context_seed` when the workflow expects assistant/tool input. Inspect results with `workflow_run_get`, `workflow_run_logs_get`, and `workflow_action_request_list`; use `workflow_action_request_ui_layout_get` to verify custom human-in-the-loop layouts.
10. If only `project_spec_*` tools are visible in Codex, treat the MCP binding as incomplete: update the server URL to include `tools=all` and restart/reload the Codex session.
11. Use Browser or Playwright tools for UI and canvas interactions when needed, after trying the native Gaia MCP operation for semantic reads.
12. For production support and debugging, call `read_operational_logs` with a trusted active project id, the user's IANA `timeZone`, and either `latestMinutes`/`latestHours` or a `start` and `end` window. Offset-free date-times are interpreted in the supplied time zone.

## Tool Notes

- `project_spec_get_current` returns the canonical spec for the bound live project.
- `project_spec_patch_preview` accepts an RFC 6902 operation array or a merge-style project-spec patch object.
- `project_spec_draft` can build a desired spec from a partial draft, but prefer RFC 6902 patch previews for assistant-authored changes unless the user explicitly asks for a full desired spec.
- `gaia_mcp_skill_catalog` lists focused Gaia MCP skill slugs, descriptions, and tool groups.
- `gaia_capability_inventory_get`, when exposed by the Gaia server, helps discover resource families and tool names.
- `discussion_topic_get` retrieves a known discussion topic and should include comments for investigations when supported.
- `discussion_topic_list` finds global/platform or project discussions when the requested scope and any required project context are available.
- `eval_*` tools manage eval datasets, tasks, graders, runs, trials, metrics, and reviews.
- `delivery_process_*`, `project_task_*`, and `project_milestone_*` tools manage delivery evidence and execution tracking.
- `project_version_*`, `project_branch_*`, `project_environment_*`, and `project_promotion_*` tools manage saved versions, branch workspaces, environment links, promotion previews, apply runs, and rollbacks.
- `workflow_run_with_context_seed` starts or synchronously executes workflows with a seeded context payload. A `paused` result is expected evidence for human-in-the-loop workflows.
- `workflow_run_get`, `workflow_run_list`, and `workflow_run_logs_get` inspect run status and logs without relying on an authenticated browser session.
- `workflow_action_request_*` tools list, inspect, claim, resolve, and verify UI layout data for human-in-the-loop workflow nodes.
- `read_operational_logs` returns recent platform warning/error/fatal entries for the project, including resolved project/conversation/user names where available.
- Generate RFC 6902 patches against the actual live project spec or exported payload you are inspecting. Do not invent target paths from memory.

## Browser Canvas Checks

When validating canvas behavior, keep server-side and browser-side checks separate:

- Use MCP tools for project state, conversations, and artifacts.
- Use Browser/Playwright to open returned deep links and perform UI interactions.
- If the local browser is not authenticated, open `/login?animation=false`, sign in, then open `/dev/browser-validation` when a reusable workspace is needed.
