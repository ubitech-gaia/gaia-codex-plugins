---
name: gaia-workspace-update
description: 'Use when Codex needs to check, adopt, preview, or apply Gaia Codex integration-file updates in an existing project workspace.'
---

# Gaia Workspace Update

Reconcile the small set of Gaia-managed Codex integration files without replacing project work or silently changing security policy. Gaia is the source of truth for the current template; the repository remains the source of truth for local customizations.

## Scope

This workflow may manage only the file paths returned by `codex_workspace_template_get`, currently `.codex/config.toml`, `.codex/README.md`, `AGENTS.md`, `README.md`, `gaia/environments.mjs`, and `gaia/connections.mjs`, plus its manifest at `gaia/workspace-template.json`. Updating the connection helper does not authorize running setup or login.

Never alter `gaia.config.json`, project source/content, exports, patches, assets, QA evidence, or notes as part of a template update. Never print or copy credentials. Never broaden Gaia tool approvals, change `approvals_reviewer`, or change Codex sandbox/Full Access settings unless the user explicitly requests that separate security change.

## Fetch and Validate

1. Work from the repository root and read `gaia.config.json` if present. Resolve `gaiaBaseUrl` from that file, the user's request, or the configured Gaia MCP endpoint. Require a trusted non-empty base URL; no project binding is needed for template retrieval.
2. Use the Gaia automation skill's environment resolver to select the requested/default origin and MCP server, including legacy flat bindings. Call that server's `codex_workspace_template_get` with `gaiaBaseUrl` and, when its schema supports it, the existing `mcpServer`; omit `projectId`. This call is read-only. New templates derive a name from the origin, so pass the existing name to preserve it in configuration and login instructions. For older servers, merge the returned block and documentation under the selected name, preserving every other environment block and tool approval policy. Never overwrite an unrelated connection or silently rename an existing binding. If the tool is unavailable, refresh that catalog once before reporting the deployed capability gap.
3. Accept only schema version `1`, the exact manifest path `gaia/workspace-template.json`, and relative managed paths that stay inside the workspace. Reject absolute paths, `..` segments, unexpected paths, duplicate paths, or content whose SHA-256 does not equal the returned hash.
4. Read the local manifest if present. Treat an absent, invalid, or incompatible manifest as **adoption mode**.

## Classify and Preview

For each returned managed file, compute the local SHA-256 and classify it:

- `current`: the local hash equals the new payload hash.
- `safe-update`: the local hash equals the old manifest hash, so the installed file is unmodified.
- `local-change`: the file exists but does not equal either hash.
- `missing`: the file does not exist.

Before editing, show a concise preview with the installed and available template versions, mode (`tracked` or `adoption`), and each file's classification and intended action.

In adoption mode, do not overwrite any existing file during the first pass. Creating a missing managed file is safe, but ask for explicit confirmation before modifying an existing file because there is no trusted merge base. A prior request merely to "check" or "preview" is not approval to apply.

## Reconcile

When the user asked to apply the update and the preview is safe:

- Replace `safe-update` files with the returned content.
- Create `missing` files from the returned content.
- Leave `current` files unchanged.
- For `local-change` files in tracked mode, perform a three-way merge using the old manifest's `baseContent` as the base, the local file as ours, and the returned content as theirs. Stop on unresolved conflicts; do not write conflict markers into security-sensitive files.
- For `.codex/config.toml`, preserve unrelated settings, a user-selected `approvals_reviewer`, and deliberate Gaia approval choices. Update the Gaia endpoint and required targeted tool entries, but retain a deliberate server-wide `default_tools_approval_mode = "approve"` or stricter local policy unless the user asks to change it.
- For `AGENTS.md`, preserve repository-specific instructions and merge new Gaia rules into the relevant section. Do not replace the whole file merely because the template changed.
- For `replace-if-unmodified` documentation files with local changes, prefer a small semantic merge; if intent is ambiguous, leave the file unchanged and report it.

After all selected file edits succeed, write the returned manifest to `gaia/workspace-template.json`. Its `baseContent` values are canonical, non-secret merge bases; do not replace them with locally customized contents. If any managed file remains unresolved, record only the successfully adopted baseline state and clearly report the skipped file rather than claiming the workspace is current.

## Verify and Report

1. Recompute hashes and confirm every unchanged/replaced file matches its intended content; identify intentionally merged files as locally customized.
2. Run `codex mcp get <selected-server>` when CLI access is available and confirm the URL matches the selected origin plus `/api/mcp/gaia` without legacy query parameters.
3. Report the previous and current template versions, changed/skipped files, preserved customizations, and whether approval behavior changed (normally: no).
4. Tell the user to start a new Codex task so updated `AGENTS.md`, project config, MCP annotations, and plugin skills are reloaded.

Codex itself and the installed plugin have separate lifecycles. When requested, update Codex with `codex update`, refresh the marketplace with `codex plugin marketplace upgrade gaia`, and update or reinstall Gaia Codex through `/plugins` before starting the new task.
