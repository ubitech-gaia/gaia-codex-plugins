---
name: gaia-automation
description: 'Use when Codex needs real Gaia feedback while editing a repository bound to one Gaia project through Gaia MCP.'
---

# Gaia Automation

Use this skill from a project-specific repository, not from the Gaia application repository. It closes the loop against a Gaia server while working on live Gaia project patches, resource updates, review notes, or QA evidence.

## Preconditions

- The project repository is bound to one default Gaia project through a root-level `gaia.config.json` file.
- The repository has access to one global OAuth-backed MCP server named `gaia` for `/api/mcp/gaia?tools=all`. This server should expose Project Spec Operations plus evals, delivery process, project tasks, milestones, project versions, branches, environment promotion, agent/config operations, data model, document folders, governance, workflows, UI layouts, and other project-scoped Gaia tools.
- Prefer OAuth for Codex. `codex mcp add gaia --url "https://thegaia.ai/api/mcp/gaia?tools=all"` starts the OAuth flow when Gaia advertises OAuth support. Use project-bound service-account keys only for legacy clients or non-interactive setups that cannot use OAuth.
- The Gaia MCP endpoint `/api/mcp/gaia?tools=all` is the default Codex route; each Gaia tool call must include the active project id selected from `gaia.config.json`.
- Gaia maintainers may also configure a local Gaia server with `localGaiaBaseUrl` and `localProjectId` in `gaia.config.json`, plus an MCP server named `gaia-local` pointing at `https://gaia.localhost:1443/api/mcp/gaia?tools=all`. Use this local target only when the user explicitly asks to work against the local Gaia server and `localProjectId` is present and non-empty.
- Local CLI credentials or fallback config may live in `.env` or `.codex/config.toml`. Treat both files as secret-capable local material and never print or commit their values.

## Setup Check

Before using Gaia MCP tools:

1. Read `gaia.config.json` and select the active target. Use default `gaiaBaseUrl`, `projectId`, and the `gaia` MCP server unless the user explicitly asks for the local Gaia server.
2. For local Gaia server work, require a non-empty `localProjectId`, use `localGaiaBaseUrl` when present and non-empty or `https://gaia.localhost:1443`, and use the `gaia-local` MCP server. If `localProjectId` is missing or empty, stop and ask the user to add it to `gaia.config.json`; do not fall back to the default `projectId`.
3. Confirm the active MCP server points at `${activeGaiaBaseUrl}/api/mcp/gaia?tools=all`.
4. If MCP is not connected, tell the user to run:

```bash
codex mcp add gaia --url "https://thegaia.ai/api/mcp/gaia?tools=all"
```

For local Gaia server work, tell maintainers to run:

```bash
codex mcp add gaia-local --url "https://gaia.localhost:1443/api/mcp/gaia?tools=all"
```

If the user previously configured the older `gaia-project` server, tell them to remove it separately with `codex mcp remove gaia-project`. If the `gaia` server already exists and only needs a refreshed OAuth grant, tell them to run `codex mcp login gaia`. A successful Gaia Codex OAuth login is intended to stay usable for about 30 days before another login is required.

Use the actual active Gaia base URL from `gaia.config.json`.

## Freshness and Patch Base Discipline

Treat the live Gaia project spec as authoritative and every repo export as a cache.

- Before drafting, editing, previewing, or applying any patch, call `project_spec_get_current` through the active MCP server with the active project id selected from `gaia.config.json`.
- Compare the live spec to `gaia/current-export.json` before trusting local patches. At minimum compare `project.id`, `version`, `exportedAt` when present, and a SHA-256 hash of the canonical JSON payload.
- If the live spec differs from `gaia/current-export.json`, stop and either refresh `gaia/current-export.json` from the live spec or explicitly mark the existing patch set as stale and rebase it.
- Generate RFC 6902 patches against the exact live export or refreshed local export you just inspected. Include `test` operations for the project id and the strongest available base markers.
- Before any live apply, run both checks: apply the patch locally to the same base export, then call `project_spec_patch_preview` against the bound project.
- After a live apply, call `project_spec_get_current` again, update `gaia/current-export.json`, record the new hash in `notes/session-log.md`, and only then prepare follow-up patches.

## Workflow

1. Read `gaia.config.json` if it exists and select the active target. Use default `projectId` unless the user explicitly asks for the local Gaia server and `localProjectId` is present.
2. Use the active MCP server to call `project_spec_get_current` with the selected project id and establish the current live export hash before drafting or applying any patch.
3. Rebase or refresh local patch files when the live export and `gaia/current-export.json` differ.
4. Preview live project changes with `project_spec_patch_preview` before any apply step.
5. Keep every preview and apply action scoped to the same active project id.
6. Use `project_spec_plan_migration` and `project_spec_apply_migration` only when the task explicitly calls for live project changes.
7. Use `gaia_mcp_skill_catalog` to understand available project-scoped tool groups.
8. For evals, delivery process, project tasks, milestones, project versions, branches, environment promotion, governance, document folders, workflows, UI layouts, and agent/config operations, use the native tools exposed by the active MCP server whenever they are available, always passing the active project id.
9. For workflow end-to-end checks, prefer `workflow_run_with_context_seed` when the workflow expects assistant/tool input. Inspect results with `workflow_run_get`, `workflow_run_logs_get`, and `workflow_action_request_list`; use `workflow_action_request_ui_layout_get` to verify custom human-in-the-loop layouts.
10. If only `project_spec_*` tools are visible in Codex, treat the MCP binding as incomplete: update the server URL to include `tools=all` and restart/reload the Codex session.
11. Use Browser or Playwright tools for UI and canvas interactions when needed.
12. For production support and debugging, call `read_operational_logs` with the active project id, the user's IANA `timeZone`, and either `latestMinutes`/`latestHours` or a `start` and `end` window. Offset-free date-times are interpreted in the supplied time zone.

## Tool Notes

- `project_spec_get_current` returns the canonical spec for the bound live project.
- `project_spec_patch_preview` accepts an RFC 6902 operation array or a merge-style project-spec patch object.
- `project_spec_draft` can build a desired spec from a partial draft, but prefer RFC 6902 patch previews for assistant-authored changes unless the user explicitly asks for a full desired spec.
- `gaia_mcp_skill_catalog` lists focused Gaia MCP skill slugs, descriptions, and tool groups.
- `gaia_capability_inventory_get`, when exposed by the Gaia server, helps discover resource families and tool names.
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
