---
name: gaia-automation
description: 'Use when Codex needs real Gaia feedback while editing a repository bound to one Gaia project through Gaia MCP.'
---

# Gaia Automation

Use this skill from a project-specific repository, not from the Gaia application repository. It closes the loop against a Gaia server while working on live Gaia project patches, resource updates, review notes, or QA evidence.

## Preconditions

- The project repository is bound to one Gaia project through a root-level `gaia.config.json` file.
- The repository has a configured MCP server named `gaia-project` for `/api/mcp/gaia?projectId=<project-id>&tools=all`.
- Prefer OAuth login for Codex: `codex mcp login gaia-project`. Use service-account keys only for legacy clients or non-interactive setups that cannot use OAuth.
- The project-bound Gaia MCP endpoint `/api/mcp/gaia?projectId=<project-id>&tools=all` is the default route for real project work.
- Local CLI credentials or fallback config may live in `.env` or `.codex/config.toml`. Treat both files as secret-capable local material and never print or commit their values.

## Setup Check

Before using Gaia MCP tools:

1. Read `gaia.config.json` and treat its `projectId` and `gaiaBaseUrl` as the authoritative target.
2. Confirm the local MCP server is named `gaia-project` and points at `${gaiaBaseUrl}/api/mcp/gaia?projectId=${projectId}&tools=all`.
3. If MCP is not connected, tell the user to run:

```bash
codex mcp add gaia-project --url "https://thegaia.ai/api/mcp/gaia?projectId=<project-id>&tools=all"
codex mcp login gaia-project
```

Use the actual `gaiaBaseUrl` and `projectId` from `gaia.config.json`.

## Freshness and Patch Base Discipline

Treat the live Gaia project spec as authoritative and every repo export as a cache.

- Before drafting, editing, previewing, or applying any patch, call `project_spec_get_current` through the `gaia-project` MCP server for the `projectId` in `gaia.config.json`.
- Compare the live spec to `gaia/current-export.json` before trusting local patches. At minimum compare `project.id`, `version`, `exportedAt` when present, and a SHA-256 hash of the canonical JSON payload.
- If the live spec differs from `gaia/current-export.json`, stop and either refresh `gaia/current-export.json` from the live spec or explicitly mark the existing patch set as stale and rebase it.
- Generate RFC 6902 patches against the exact live export or refreshed local export you just inspected. Include `test` operations for the project id and the strongest available base markers.
- Before any live apply, run both checks: apply the patch locally to the same base export, then call `project_spec_patch_preview` against the bound project.
- After a live apply, call `project_spec_get_current` again, update `gaia/current-export.json`, record the new hash in `notes/session-log.md`, and only then prepare follow-up patches.

## Workflow

1. Read `gaia.config.json` if it exists and treat that `projectId` as the authoritative target.
2. Use the `gaia-project` server to call `project_spec_get_current` and establish the current live export hash before drafting or applying any patch.
3. Rebase or refresh local patch files when the live export and `gaia/current-export.json` differ.
4. Preview live project changes with `project_spec_patch_preview` before any apply step.
5. Keep every preview and apply action scoped to the same bound `projectId`.
6. Use `project_spec_plan_migration` and `project_spec_apply_migration` only when the task explicitly calls for live project changes.
7. Use `gaia_mcp_skill_catalog` to understand available project-scoped tool groups.
8. For evals, delivery process, project tasks, milestones, governance, document folders, workflows, UI layouts, and agent/config operations, use the native tools exposed by the same `gaia-project` server whenever they are available.
9. If only `project_spec_*` tools are visible in Codex, treat the MCP binding as incomplete: update the server URL to include `tools=all` and restart/reload the Codex session.
10. Use Browser or Playwright tools for UI and canvas interactions when needed.

## Tool Notes

- `project_spec_get_current` returns the canonical spec for the bound live project.
- `project_spec_patch_preview` accepts an RFC 6902 operation array or a merge-style project-spec patch object.
- `project_spec_draft` can build a desired spec from a partial draft, but prefer RFC 6902 patch previews for assistant-authored changes unless the user explicitly asks for a full desired spec.
- `gaia_mcp_skill_catalog` lists focused Gaia MCP skill slugs, descriptions, and tool groups.
- `gaia_capability_inventory_get`, when exposed by the project-bound server, helps discover resource families and tool names.
- Generate RFC 6902 patches against the actual live project spec or exported payload you are inspecting. Do not invent target paths from memory.

## Browser Canvas Checks

When validating canvas behavior, keep server-side and browser-side checks separate:

- Use MCP tools for project state, conversations, and artifacts.
- Use Browser/Playwright to open returned deep links and perform UI interactions.
- If the local browser is not authenticated, open `/login?animation=false`, sign in, then open `/dev/browser-validation` when a reusable workspace is needed.
