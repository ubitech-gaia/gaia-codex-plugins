import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { normalizeGaiaConfig } from './environments.mjs';

const execFileAsync = promisify(execFile);
const usage =
  'Usage: connections.mjs [gaia.config.json] [status [NAME ...|--all]|setup NAME ...|login NAME ...] (setup/login also accept --all)';

// Only this adapter executes Codex. Inventory is captured, never echoed: it may contain secrets.
export function createCodexRunner(cwd) {
  return async (args) => {
    if (args[1] === 'list') {
      try {
        const result = await execFileAsync('codex', args, {
          cwd,
          timeout: 30_000,
          maxBuffer: 4 * 1024 * 1024,
        });
        return result.stdout;
      } catch {
        throw new Error(
          'Cannot read Codex MCP inventory. Check CLI availability and project trust; no connections were assumed missing.',
        );
      }
    }
    // OAuth stays entirely in Codex, including browser consent and credential storage.
    await new Promise((resolve, reject) => {
      const child = spawn('codex', args, { cwd, stdio: 'inherit', shell: false });
      child.once('error', () =>
        reject(new Error(`Could not start codex mcp ${args[1]} ${args[2]}.`)),
      );
      child.once('exit', (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `codex mcp ${args[1]} ${args[2]} did not complete. Setup stopped; rerun status before retrying.`,
            ),
          );
      });
    });
    return '';
  };
}

async function inventory(run) {
  const raw = await run(['mcp', 'list', '--json']);
  try {
    const servers = JSON.parse(raw);
    if (
      !Array.isArray(servers) ||
      servers.some(
        (item) =>
          !item ||
          typeof item.name !== 'string' ||
          typeof item.enabled !== 'boolean' ||
          !item.transport ||
          typeof item.transport !== 'object',
      )
    ) {
      throw new Error();
    }
    if (new Set(servers.map((item) => item.name)).size !== servers.length) throw new Error();
    return servers;
  } catch {
    throw new Error('Unrecognized Codex MCP inventory; no connections were assumed missing.');
  }
}

function hasExternalCredentials(server) {
  const transport = server.transport;
  return (
    server.auth_status === 'bearer_token' ||
    Boolean(
      transport.bearer_token_env_var ||
      transport.http_headers_helper ||
      Object.keys(transport.http_headers ?? {}).length ||
      Object.keys(transport.env_http_headers ?? {}).length,
    )
  );
}

function describe(environment, servers) {
  const endpoint = `${environment.gaiaBaseUrl}/api/mcp/gaia`;
  const server = servers.find((item) => item.name === environment.mcpServer);
  let connection = 'missing';
  let authentication = 'not-configured';
  if (server) {
    connection =
      server.transport.type !== 'streamable_http' || server.transport.url !== endpoint
        ? 'conflict'
        : server.enabled === false
          ? 'disabled'
          : 'configured';
    authentication = hasExternalCredentials(server)
      ? 'external-credentials'
      : server.auth_status === 'o_auth'
        ? 'oauth-stored'
        : server.auth_status === 'not_logged_in'
          ? 'login-required'
          : 'unknown';
  }
  return {
    environment: environment.name,
    mcpServer: environment.mcpServer,
    endpoint,
    projectId: environment.projectId ?? null,
    connection,
    authentication,
    liveAccess: 'not-checked',
  };
}

function assertUsable(rows, command) {
  for (const row of rows) {
    if (['conflict', 'disabled'].includes(row.connection)) {
      throw new Error(
        `${row.environment}: MCP server ${row.mcpServer} is ${row.connection}. Resolve its configuration explicitly; no existing server will be overwritten or enabled.`,
      );
    }
    if (command === 'login' && row.connection === 'missing') {
      throw new Error(
        `${row.environment}: MCP server ${row.mcpServer} is missing. Run setup for this environment first.`,
      );
    }
    if (command === 'login' && row.authentication === 'external-credentials') {
      throw new Error(
        `${row.environment}: existing external credentials may override OAuth. Resolve that configuration explicitly before logging in.`,
      );
    }
  }
}

/** No credentials leave Codex. Status is configuration evidence, never a live-access assertion. */
export async function manageGaiaConnections(
  config,
  command = 'status',
  names = [],
  run = createCodexRunner(process.cwd()),
) {
  if (!['status', 'setup', 'login'].includes(command)) throw new Error(usage);
  if (command !== 'status' && names.length === 0)
    throw new Error('Setup/login require explicit environment names or --all.');
  if (names.includes('--all') && names.length !== 1)
    throw new Error('Use --all alone, or explicit environment names.');
  const normalized = normalizeGaiaConfig(config);
  const selected =
    !names.length || names[0] === '--all'
      ? Object.keys(normalized.environments)
      : [...new Set(names)];
  const environments = selected.map((name) => {
    if (!Object.hasOwn(normalized.environments, name))
      throw new Error(`Unknown environment: ${name}`);
    return normalized.environments[name];
  });
  let servers = await inventory(run);
  if (command !== 'status') {
    // Preflight all selected environments before registering or authenticating any of them.
    assertUsable(
      environments.map((item) => describe(item, servers)),
      command,
    );
    const processed = new Set();
    for (const environment of environments) {
      if (processed.has(environment.mcpServer)) continue;
      processed.add(environment.mcpServer);
      servers = await inventory(run);
      let row = describe(environment, servers);
      assertUsable([row], command);
      if (row.connection === 'missing') {
        await run(['mcp', 'add', row.mcpServer, '--url', row.endpoint]);
        // Some Codex versions perform OAuth during add. Do not open a second login unnecessarily.
        servers = await inventory(run);
        row = describe(environment, servers);
        assertUsable([row], command);
        if (row.connection === 'missing')
          throw new Error(
            `${row.environment}: registration was not visible. Check project trust and configuration, then rerun status.`,
          );
      }
      if (
        command === 'login' ||
        !['oauth-stored', 'external-credentials'].includes(row.authentication)
      ) {
        await run(['mcp', 'login', row.mcpServer]);
        servers = await inventory(run);
        row = describe(environment, servers);
        assertUsable([row], 'login');
        if (row.authentication !== 'oauth-stored')
          throw new Error(
            `${row.environment}: OAuth completion could not be confirmed. Rerun status before continuing.`,
          );
      }
    }
  }
  return {
    environments: environments.map((item) => describe(item, servers)),
    nextStep:
      'Use each named MCP connection to check its Gaia catalog and project access. Stored credentials do not prove connectivity or permissions.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [file = 'gaia.config.json', command = 'status', ...names] = process.argv.slice(2);
    const configPath = path.resolve(file);
    let config;
    try {
      config = JSON.parse(await readFile(configPath, 'utf8'));
    } catch {
      throw new Error(
        'Cannot read Gaia configuration. Provide a readable, valid gaia.config.json.',
      );
    }
    const result = await manageGaiaConnections(
      config,
      command,
      names,
      createCodexRunner(path.dirname(configPath)),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
