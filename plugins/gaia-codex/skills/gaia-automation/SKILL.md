---
name: gaia-automation
description: 'Use for live Gaia work and setting up or checking independent environment connections through Gaia MCP, with or without a repository project binding.'
---

# Gaia Automation

Use this skill whenever Codex needs live Gaia data or actions through the Gaia extension. It supports both project-bound repository work and general Gaia operations from repositories, including the Gaia application repository, that do not contain `gaia.config.json`.

## Operating Modes

- **Bound-project mode:** A root-level `gaia.config.json` selects a default named environment. Each environment has its own Gaia origin, project ID, and MCP server. Legacy flat bindings remain supported. Use this mode for project specs, patches, migrations, project-scoped resources, and operational logs.
- **Unbound general mode:** When `gaia.config.json` is absent, use the Gaia extension's OAuth-backed `gaia` MCP for platform operations. Omit `projectId`; do not supply a placeholder, empty string, unrelated project, or create configuration just to read platform data. Global discussions and platform tasks are separate from project discussions and project tasks.
- The Gaia extension provides the global OAuth-backed MCP server named `gaia` for the canonical queryless endpoint `/api/mcp/gaia`. It exposes Project Spec Operations plus discussions, evals, delivery process, project tasks, milestones, project versions, branches, environment promotion, agent/config operations, data model, document folders, governance, workflows, UI layouts, and other Gaia tools.
- Prefer OAuth for Codex. `codex mcp add gaia --url "https://thegaia.ai/api/mcp/gaia"` starts the OAuth flow when Gaia advertises OAuth support. Use project-bound service-account keys only for legacy clients or non-interactive setups that cannot use OAuth.
- The Gaia MCP endpoint `/api/mcp/gaia` is the default Codex route. Do not append legacy tool-selection query parameters such as `tools=all`; the queryless endpoint exposes the complete supported tool catalogue and must match Gaia's protected-resource metadata exactly. Pass a project id when the exposed tool schema requires one, but only when it comes from `gaia.config.json`, an explicit user-provided value, a trusted Gaia URL/context, or a Gaia MCP result. Never invent a project id or substitute an unrelated project binding.
- Gaia maintainers may also configure a local Gaia server with `localGaiaBaseUrl` and `localProjectId` in `gaia.config.json`, plus an MCP server named `gaia-local` pointing at `https://gaia.localhost:1443/api/mcp/gaia`. Use this local target only when the user explicitly asks to work against the local Gaia server. Local platform calls can omit `projectId`; local project calls require a trusted local project id.
- Local CLI credentials or fallback config may live in `.env` or `.codex/config.toml`. Treat both files as secret-capable local material and never print or commit their values.

## Setup Check

Before using Gaia MCP tools:

1. Check whether root-level `gaia.config.json` exists.
2. If it exists, use the environment resolver below. Honor an explicit environment name; otherwise use its default. Never substitute another target when the selected connection or project binding is missing. For connection setup, login, or status requests, follow [environment connections](references/environment-connections.md) and use the bundled `scripts/connections.mjs` helper.
3. If it does not exist, enter unbound general mode. Use the Gaia extension's `gaia` MCP server and inspect the exposed Gaia tools before trying browser login, direct database access, or asking the user for a project binding.
4. For a discussion URL or topic id, call `discussion_topic_get` with the extracted `topicId` and `includeComments: true`, omitting `projectId` when no project context is needed. For platform discussion discovery, call `discussion_topic_list` with `scope: "global"`. Project discussion lists use `scope: "project"` (the default) and require a trusted `projectId`.
5. Call `gaia_mcp_skill_catalog` without `projectId` to discover native tools and inspect `usage.projectOptionalTools`. `gaia_capability_inventory_get` also works without a project. Platform tasks use `platform_task_*` without `projectId`; project tasks use `project_task_*` with the target project's trusted id. Resource-specific permissions apply in both modes.
6. For named local environments, use the resolved entry. For legacy local work, use `localGaiaBaseUrl` or `https://gaia.localhost:1443`, `localProjectId`, and `gaia-local`. Local platform calls may omit the project ID; project work must have a trusted local project ID.
7. Confirm the selected MCP server points at the matching queryless `/api/mcp/gaia` endpoint.
8. If MCP is not connected, tell the user to run:

```bash
codex mcp add gaia --url "https://thegaia.ai/api/mcp/gaia"
```

For local Gaia server work, tell maintainers to run:

```bash
codex mcp add gaia-local --url "https://gaia.localhost:1443/api/mcp/gaia"
```

If the user previously configured the older `gaia-project` server, tell them to remove it separately with `codex mcp remove gaia-project`. A successful Gaia Codex OAuth login uses 24-hour access tokens and a rolling 90-day refresh window, so active Codex sessions should renew silently. Another login is expected only after 90 days without a successful refresh, explicit revocation, or account/client disablement.

Use the actual active Gaia base URL from `gaia.config.json` in bound-project mode. In unbound general mode, use the Gaia extension's configured `gaia` server.

## Named Environments and Transfers

Use the bundled `scripts/environments.mjs` resolver (relative to this skill directory), or the
identical `gaia/environments.mjs` in a generated workspace:

```text
node <skill-directory>/scripts/environments.mjs gaia.config.json list
node <skill-directory>/scripts/environments.mjs gaia.config.json resolve customer-uat
node <skill-directory>/scripts/environments.mjs gaia.config.json transfer local customer-prod
```

Version 2 config has `schemaVersion: 2`, `defaultEnvironment`, and an `environments` object keyed
by arbitrary names. Each entry has `kind` (`thegaia`, `local`, or `customer`), optional `stage`,
`gaiaBaseUrl`, `projectId`, and `mcpServer`. There is no three-environment limit. Legacy top-level
`projectId`/`gaiaBaseUrl`, `localProjectId`/`localGaiaBaseUrl`, and
`customerProjectId`/`customerGaiaBaseUrl` normalize without rewriting the config. Named entries
take precedence over legacy fields. `defaultEnvironment`, then legacy `activeEnvironment` or
`environment`, select the default. Do not infer which customer environment the user means when
multiple named targets exist.

The resolver returns only non-secret routing data and a separate `cachePath` per named target.
Authenticate each distinct configured MCP connection independently. Config entries do not create
connections. Check the actual endpoint matches the resolved origin plus `/api/mcp/gaia`; use the
resolved server name in login/setup/recovery commands. Multiple projects on one origin may share
a server; one server must never route to different origins.

For setup and per-environment connection status, use [environment connections](references/environment-connections.md).
Stored OAuth credentials are not proof of live connectivity or access to a particular project.

For a cross-environment transfer:

1. Resolve explicit FROM and TO names together. Keep these immutable for the operation; never
   change the default environment to alternate between endpoints. Verify both deployed catalogs
   expose the new transfer tools before doing work.
2. On FROM, fetch the current spec. Call `project_spec_change_export` with its project ID,
   `sourceEnvironment`, and matching `sourceBaseUrl`. Supply a patch against the current source,
   or a `baseSnapshotId` from before already-applied changes. With neither, the export includes
   all configuration resources for initial adoption. Never reapply an old source patch blindly.
3. Save the returned package unchanged under `gaia-patches/changes/<changeId>.json`. Keep its
   change ID and hash across dev → UAT → production. The hash verifies content integrity, not
   source authenticity. Review source provenance using the configured connection.
4. Relay the package as `changePackage` to `project_spec_transfer_preview` on TO. This uses both
   client connections and makes no server-to-server request; localhost can remain private.
5. Inspect `conflicts`, `requiredBindings`, and the migration plan. Supply `keyMap` when logical
   names differ, and destination `bindings` for new environment-specific values. Existing target
   values are preserved. Use credential references, never source credential values. Automatic
   binding detection covers recognized sensitive fields, origins, and unmapped UUID-valued `*Id` fields; known managed resource IDs resolve automatically in the destination. Inline tool and workflow-node IDs remain portable. Use
   `bindingPaths` on export for custom fields, embedded code, or other deployment-specific data.
   Do not edit the immutable package to resolve a conflict; create a fresh scoped change or
   reconcile the destination under the user's authorization and preview again.
6. Apply a ready `sessionId` with `project_spec_transfer_apply` on TO and `confirm: true` when
   authorized. A stale destination requires another preview. An already-applied receipt is a
   no-op, not permission to replay the change under a new ID. Resource removals remain blocked
   by the project-spec migration engine. Runtime records, uploaded files, and histories are not
   included in configuration packages.
7. Fetch TO again, update its resolved cache, and store the receipt under
   `gaia/environments/<name>/transfers/`. Use `project_spec_transfer_history` to inspect failures
   or prior applications. The migration engine is multi-step: after failure inspect live state
   before a new preview. Roll back field changes by exporting the inverse from a saved baseline;
   newly created resource deletion needs the existing supported deletion workflow.

For later sync requests, read destination history and choose the last applied receipt matching the
source origin and project. Pass its `source.snapshotId` as the next export's `baseSnapshotId`.
Exports retain a source snapshot for this purpose. Prospective patch exports capture the state
before the patch; already-present destination fields are treated as no-ops on later previews.
Without a retained baseline, preview an initial full export and resolve differences explicitly.

## Connection Recovery

For named environments, use the resolved `mcpServer` in all connection and recovery commands below. The literal `gaia` examples refer to the legacy default only. Never rewrite a working server to point at another environment.

Treat an OAuth challenge, `401`, `invalid_grant`, or an unavailable Gaia tool catalogue as a recoverable authentication event before describing the Gaia connection as lost.

A `projectId` schema-validation error on a platform tool is a capability mismatch, not an OAuth failure. Confirm the queryless endpoint and reload the MCP catalog once. If the tool still requires `projectId`, report that the deployed Gaia server needs the project-optional MCP update. Do not invent a project binding or repeatedly reauthenticate. Updating this plugin alone cannot change server schemas.

1. Run `codex mcp get gaia` to confirm the existing server configuration. Do not remove a correctly configured server as the first recovery step.
2. If the server exists, run `codex mcp login gaia`, tell the user that Gaia browser approval is needed, and wait for that login flow to finish. If shell execution is unavailable, give the user that exact command instead.
3. After a successful login, retry the original Gaia MCP call once in the same task. Codex 0.148.0 and newer can recover the MCP server after OAuth reauthentication without restarting. If the installed Codex is older, recommend upgrading; when the current task still retains the stale connection, ask the user to start a new task after login.
4. Use `codex mcp add gaia --url "https://thegaia.ai/api/mcp/gaia"` only when the `gaia` server is missing or its URL is incorrect.
5. If the retry fails with the same authentication error, report the exact failed recovery step and required user action. Do not fall back to browser scraping or direct database access for data the Gaia MCP should provide.

## Freshness and Patch Base Discipline

Treat the live Gaia project spec as authoritative and every repo export as a cache.

- Before drafting, editing, previewing, or applying any patch, call `project_spec_get_current` through the active MCP server with the active project id selected from `gaia.config.json`.
- Compare the live spec with the resolved environment's `cachePath` before trusting local patches. Compare the spec version and canonical JSON hash, and keep the resolved origin/project ID alongside the cache. The canonical spec itself does not contain a project ID.
- If the live spec differs, refresh that environment's cache or mark its patch set stale and rebase it. Never load another environment's export as this patch base.
- Generate RFC 6902 patches against the exact live export you inspected. Include `test` operations only for fields actually present, including the strongest available base markers.
- Before any live apply, run both checks: apply the patch locally to the same base export, then call `project_spec_patch_preview` against the bound project.
- After a live apply, call `project_spec_get_current` again on the same environment, update its resolved cache, record the new hash in `notes/session-log.md`, and only then prepare follow-up patches.

## Workflow

When the user asks to update, sync, refresh, adopt, or reconcile the repository's Gaia Codex
integration files, switch to the `$gaia-workspace-update` skill. Do not treat that maintenance task
as a project-spec update.

1. Detect bound-project or unbound general mode from the presence of `gaia.config.json`.
2. In unbound general mode, try the Gaia extension's native platform tool first and omit `projectId`. For discussions, use `discussion_topic_get` or `discussion_topic_list` with `scope: "global"`; for platform tasks, use `platform_task_list` or `platform_task_get`.
3. In bound-project mode, call `project_spec_get_current` with the selected project id and establish the current live export hash before drafting or applying any patch.
4. Rebase or refresh local patch files when the live export and the resolved environment cache differ.
5. Preview live project changes with `project_spec_patch_preview` before any apply step and keep every preview and apply scoped to the same active project id.
6. Use `project_spec_plan_migration` and `project_spec_apply_migration` only when the task explicitly calls for live project changes.
7. Use `gaia_mcp_skill_catalog` to understand available tool groups in either mode.
8. For evals, delivery process, project tasks, milestones, project versions, branches, environment promotion, governance, document folders, workflows, UI layouts, and agent/config operations, use the native tools exposed by the selected server whenever they are available. Pass the active project id for project-scoped tools.
9. For workflow end-to-end checks, prefer `workflow_run_with_context_seed` when the workflow expects assistant/tool input. Inspect results with `workflow_run_get`, `workflow_run_logs_get`, and `workflow_action_request_list`; use `workflow_action_request_ui_layout_get` to verify custom human-in-the-loop layouts.
10. If only `project_spec_*` tools are visible in Codex, treat the MCP binding as stale or incomplete: confirm that the server uses the queryless `/api/mcp/gaia` URL, refresh OAuth with `codex mcp login gaia`, and retry the catalogue once before reporting the remaining mismatch.
11. Use Browser or Playwright tools for UI and canvas interactions when needed, after trying the native Gaia MCP operation for semantic reads.
12. For production support and debugging, call `read_operational_logs` with a trusted active project id, the user's IANA `timeZone`, and either `latestMinutes`/`latestHours` or a `start` and `end` window. Offset-free date-times are interpreted in the supplied time zone.

## Tool Notes

MCP tool schemas come from the connected Gaia server, not this plugin. A server-side tool addition does not require a plugin schema change. After deploying new server capabilities, refresh the MCP connection/catalog (or start a new Codex task) and check the available tools before using them. Updating this plugin supplies workflow guidance; it does not deploy server code or make an unavailable tool callable.

- `project_spec_get_current` returns the canonical spec for the bound live project.
- `codex_workspace_template_get` returns the versioned, read-only payload used by
  `$gaia-workspace-update`; it does not modify the Gaia project or local workspace.
- `project_spec_patch_preview` accepts an RFC 6902 operation array or a merge-style project-spec patch object.
- `project_spec_draft` can build a desired spec from a partial draft, but prefer RFC 6902 patch previews for assistant-authored changes unless the user explicitly asks for a full desired spec.
- `gaia_mcp_skill_catalog` lists focused Gaia MCP skill slugs, descriptions, and tool groups.
- `gaia_capability_inventory_get`, when exposed by the Gaia server, helps discover resource families and tool names.
- `discussion_topic_get` retrieves a known topic without requiring repository project configuration and checks the actual topic's scope and permissions. Include comments for investigations.
- `discussion_topic_list` with `scope: "global"` lists platform discussions without `projectId`. `scope: "project"` requires the target project id. Never omit `scope` for platform discovery because the default is project scope.
- `platform_task_*` operates on platform tasks without project context. `project_task_*` operates on project tasks and requires a trusted project id.
- Capability discovery, help/handbook reads, workspace-template retrieval, UI component help/validation, and Gaia design sessions also accept calls without `projectId`. Design sessions still require access to their destination team. Consult the catalog's `usage.projectOptionalTools` for the deployed list.

For example, these platform reads need no `gaia.config.json`:

```json
[
  { "tool": "discussion_topic_list", "arguments": { "scope": "global", "lifecycleStatus": "all" } },
  {
    "tool": "discussion_topic_get",
    "arguments": { "topicId": "<topic-id>", "includeComments": true }
  },
  { "tool": "platform_task_list", "arguments": {} },
  { "tool": "platform_task_get", "arguments": { "taskId": "<task-id>" } }
]
```

For project discussion/task calls, include a trusted `projectId` even when it comes from the request or Gaia context rather than a repository configuration file.

- `eval_*` tools manage eval datasets, tasks, graders, runs, trials, metrics, and reviews.
- `delivery_process_*`, `project_task_*`, and `project_milestone_*` tools manage delivery evidence and execution tracking.
- `project_version_*`, `project_branch_*`, `project_environment_*`, and `project_promotion_*` tools manage saved versions, branch workspaces, environment links, promotion previews, apply runs, and rollbacks.
- `workflow_run_with_context_seed` starts or synchronously executes workflows with a seeded context payload. A `paused` result is expected evidence for human-in-the-loop workflows.
- `workflow_run_get`, `workflow_run_list`, and `workflow_run_logs_get` inspect run status and logs without relying on an authenticated browser session.
- `workflow_action_request_*` tools list, inspect, claim, resolve, and verify UI layout data for human-in-the-loop workflow nodes.
- `read_operational_logs` returns recent platform warning/error/fatal entries for the project, including resolved project/conversation/user names where available.
- Generate RFC 6902 patches against the actual live project spec or exported payload you are inspecting. Do not invent target paths from memory.

## Authorized Development Cleanup

Use this workflow only for explicitly requested cleanup of development outputs. Existing authorization for the same project and exact scope remains valid; do not request it again solely because the connection or tool catalog was refreshed.

1. Inventory exact project-scoped record IDs, artifact IDs, folder memory keys and generated storage paths. Record source uploads and folders/conversations that must survive. Verify all required deletion tools are available before pausing entry points or beginning dependent schema changes.
2. Use `document_folder_memory_delete` with `folderId`, the exact `key`, and `confirm: true` to remove a legacy memory entry. It requires folder editor access and leaves other keys and folder contents intact. List memories again to verify removal; an absent key is not an instruction to delete the folder.
3. Use `artifact_delete` with the exact `artifactId` and `confirm: true` to delete canonical content and revisions. It requires project administrator access and refuses active locks. A repeated deletion returns `deleted: false` when the artifact is already absent from that project. It preserves conversations, messages, published folder copies and storage blobs.
4. Remove separately verified generated copies/blobs with `storage_file_delete` using exact project-relative paths. Folder-file deletion follows Gaia's indexing invalidation path. Never assume `sourceStoragePath` is disposable: it may reference an original upload. Do not replace these operations with folder/conversation deletion or blank memory values.
5. Verify deletion and preserved source files before replacing dependent schemas. Native `workflow_delete` also removes that workflow's runs and review requests; include these effects in the authorized inventory. If project-spec preview blocks resource removals, use supported native deletions, recapture the live spec, and rebase and preview the remaining patch before applying it.

If these tools are missing, check the deployed server's catalog with `gaia_capability_inventory_get`. A plugin update alone cannot resolve a server capability gap. Report the missing operation and keep existing entry points usable when mandatory cleanup cannot finish.

## Browser Canvas Checks

When validating canvas behavior, keep server-side and browser-side checks separate:

- Use MCP tools for project state, conversations, and artifacts.
- Use Browser/Playwright to open returned deep links and perform UI interactions.
- If the local browser is not authenticated, open `/login?animation=false`, sign in, then open `/dev/browser-validation` when a reusable workspace is needed.
