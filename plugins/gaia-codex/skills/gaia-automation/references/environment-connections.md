# Environment connections

Use this workflow when asked to configure, authenticate, check, or recover named Gaia environments.
The plugin supplies the workflow; Codex owns each named MCP connection and its OAuth credentials.
Keep one stable server name per connection. Do not change one server's URL to switch environments.

## Inspect and set up

Read `gaia.config.json`. Use `scripts/connections.mjs` relative to this skill directory, or the
identical `gaia/connections.mjs` in workspaces with template 1.2.0 or later:

```bash
node gaia/connections.mjs gaia.config.json status
node gaia/connections.mjs gaia.config.json setup customer-dev customer-uat
node gaia/connections.mjs gaia.config.json login customer-dev
```

Substitute the bundled script path when the workspace has no helper. Pass the workspace's config
path; CLI commands run from its containing directory so trusted project configuration is loaded.
Without a config, use the existing unbound setup workflow and the user's explicit Gaia origin.
Do not invent project IDs or create a project binding for platform-only access.

`status` is read-only and defaults to every environment. `setup` and `login` require explicit names;
use `--all` only when the user requested all environments, including any local or production ones.
An existing request to connect those environments authorizes setup; do not ask again. Explain that
the user will complete browser consent separately for each connection, using the intended account.

The helper captures `codex mcp list --json` internally and reports only routing fields and status.
Do not print raw CLI inventory, headers, or credential files. `setup` calls `codex mcp add` only for
missing servers, which writes Codex's user configuration and may immediately open OAuth consent.
It rechecks before calling `codex mcp login`, avoiding duplicate consent when add already logged in.
Existing stored OAuth credentials are preserved; `login` explicitly refreshes the selected login.
Projects sharing a server authenticate once, but each project's access must be checked separately.

Conflicting URLs/transports and disabled servers stop the selected setup before mutation. Report
the environment and required correction; do not remove, overwrite, enable, or substitute a server
automatically. Existing custom headers, header helpers, or bearer configuration are preserved and
reported as `external-credentials`; explicit `login` stops because those may override OAuth.
New connections use Codex's default tool policy; existing approval policies remain unchanged.
Do not broaden approval policies while connecting environments.

On CLI or OAuth failure, stop and rerun `status` before retrying the failed environment. Earlier
successful connections remain configured. Do not restart all login flows or fall back to production.

## Verify live access

`oauth-stored` means Codex reports saved OAuth credentials; `login-required` means none are reported.
`unknown` means the CLI did not establish OAuth status. Every helper row has `liveAccess: not-checked`:
the helper does not read tokens or call Gaia directly.

After setup, use the native MCP tools on **each selected server**:

1. Confirm the helper reports the exact expected queryless endpoint. Refresh/reload the MCP catalog
   if a newly registered server is not exposed. If it remains unavailable, report verification as
   pending and request a new Codex task; do not call another server with the same tool name.
2. Call `gaia_mcp_skill_catalog` on that server without a project ID to check Gaia connectivity.
3. For a configured project ID, call `project_spec_get_current` on the same server with that exact
   ID. Respect existing tool approval policy; on legacy projects this baseline may seed canonical
   bindings/snapshots. Check any returned project identity against the binding. Without a project
   ID, report platform access only and project access as unbound.
4. On OAuth challenges/401/invalid_grant, run `login` for that environment and retry once after
   browser consent. Permission denials or missing projects require account/project correction,
   not repeated login. Network/TLS failures require endpoint/trust repair, never disabled TLS checks.

Report a row per environment with server, expected endpoint, credential status, platform access,
and project access (`verified`, `denied`, `unbound`, or `not checked`, with a concise reason).
Do not label a setup complete while live checks remain pending. Credentials stay in Codex; never
copy tokens between installations or save them in `gaia.config.json` or connection reports.
