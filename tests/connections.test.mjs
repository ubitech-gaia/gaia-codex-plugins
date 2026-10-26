import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const scriptUrl = new URL(
  process.env.GAIA_CONNECTIONS_MODULE ??
    '../plugins/gaia-codex/skills/gaia-automation/scripts/connections.mjs',
  import.meta.url,
);
const { manageGaiaConnections } = await import(scriptUrl.href);
const execFileAsync = promisify(execFile);

const config = {
  defaultEnvironment: 'dev',
  environments: {
    dev: { gaiaBaseUrl: 'https://dev.example', projectId: 'dev-project' },
    prod: { gaiaBaseUrl: 'https://prod.example', projectId: 'prod-project' },
  },
};
const server = (name, origin, auth = 'o_auth') => ({
  name,
  enabled: true,
  transport: { type: 'streamable_http', url: `${origin}/api/mcp/gaia` },
  auth_status: auth,
});

function cli(initial = [], { addLogsIn = false, failLogin = false } = {}) {
  const servers = structuredClone(initial);
  const mutations = [];
  return {
    servers,
    mutations,
    run: async (args) => {
      if (args[1] === 'list') return JSON.stringify(servers);
      mutations.push(args);
      const name = args[2];
      if (args[1] === 'add') {
        servers.push(server(name, new URL(args[4]).origin, addLogsIn ? 'o_auth' : 'not_logged_in'));
      } else if (args[1] === 'login') {
        if (failLogin) throw new Error('OAuth failed');
        servers.find((item) => item.name === name).auth_status = 'o_auth';
      } else assert.fail(`Unexpected CLI command ${args[1]}`);
      return '';
    },
  };
}

test('status reports every environment without leaking raw CLI credentials or claiming live access', async () => {
  const existing = server('gaia-dev', 'https://dev.example');
  existing.transport.http_headers = { Authorization: 'secret-marker' };
  const fake = cli([existing]);
  const result = await manageGaiaConnections(config, 'status', [], fake.run);
  assert.deepEqual(
    result.environments.map((item) => item.connection),
    ['configured', 'missing'],
  );
  assert.equal(result.environments[0].authentication, 'external-credentials');
  assert.equal(result.environments[0].liveAccess, 'not-checked');
  assert.equal(result.environments[0].projectId, 'dev-project');
  assert.equal(JSON.stringify(result).includes('secret-marker'), false);
  assert.deepEqual(fake.mutations, []);
});

test('setup registers and authenticates separate environments without changing their bindings', async () => {
  const before = structuredClone(config);
  const fake = cli();
  const result = await manageGaiaConnections(config, 'setup', ['--all'], fake.run);
  assert.deepEqual(fake.mutations, [
    ['mcp', 'add', 'gaia-dev', '--url', 'https://dev.example/api/mcp/gaia'],
    ['mcp', 'login', 'gaia-dev'],
    ['mcp', 'add', 'gaia-prod', '--url', 'https://prod.example/api/mcp/gaia'],
    ['mcp', 'login', 'gaia-prod'],
  ]);
  assert.ok(result.environments.every((item) => item.authentication === 'oauth-stored'));
  assert.deepEqual(config, before);
  await manageGaiaConnections(config, 'setup', ['--all'], fake.run);
  assert.equal(fake.mutations.length, 4);
});

test('setup rechecks registration because codex add may already complete OAuth', async () => {
  const fake = cli([], { addLogsIn: true });
  await manageGaiaConnections(config, 'setup', ['dev'], fake.run);
  assert.deepEqual(
    fake.mutations.map((args) => args[1]),
    ['add'],
  );
  assert.equal(fake.servers.length, 1);
});

test('shared origins can share a login while status retains each project', async () => {
  const shared = structuredClone(config);
  shared.environments.prod = { ...shared.environments.dev, projectId: 'other-project' };
  shared.environments.dev.mcpServer = 'gaia';
  shared.environments.prod.mcpServer = 'gaia';
  const fake = cli();
  const result = await manageGaiaConnections(shared, 'setup', ['--all'], fake.run);
  assert.equal(fake.mutations.length, 2);
  assert.deepEqual(
    result.environments.map((item) => item.projectId),
    ['dev-project', 'other-project'],
  );
});

test('conflicting URLs, stdio transports, and disabled servers block the entire setup before mutation', async () => {
  for (const existing of [
    server('gaia-prod', 'https://wrong.example'),
    { ...server('gaia-prod', 'https://prod.example'), enabled: false },
    { name: 'gaia-prod', enabled: true, transport: { type: 'stdio' } },
  ]) {
    const fake = cli([existing]);
    await assert.rejects(
      manageGaiaConnections(config, 'setup', ['--all'], fake.run),
      /conflict|disabled/,
    );
    assert.deepEqual(fake.mutations, []);
  }
});

test('mutations require explicit targets; unknown targets and unavailable inventory never mean missing', async () => {
  const fake = cli();
  await assert.rejects(manageGaiaConnections(config, 'setup', [], fake.run), /explicit/);
  await assert.rejects(
    manageGaiaConnections(config, 'login', ['unknown'], fake.run),
    /Unknown environment/,
  );
  await assert.rejects(manageGaiaConnections(config, 'setup', ['--all', 'dev'], fake.run), /--all/);
  await assert.rejects(
    manageGaiaConnections(config, 'setup', ['dev'], async () => 'not JSON'),
    /inventory/,
  );
  assert.deepEqual(fake.mutations, []);
});

test('login refreshes only the selected existing connection and stops on failure', async () => {
  const fake = cli([
    server('gaia-dev', 'https://dev.example'),
    server('gaia-prod', 'https://prod.example'),
  ]);
  await manageGaiaConnections(config, 'login', ['prod'], fake.run);
  assert.deepEqual(fake.mutations, [['mcp', 'login', 'gaia-prod']]);
  const failure = cli([], { failLogin: true });
  await assert.rejects(
    manageGaiaConnections(config, 'setup', ['--all'], failure.run),
    /OAuth failed/,
  );
  assert.equal(failure.servers.length, 1);
});

test('external credentials are preserved and not misreported as an OAuth login', async () => {
  const existing = server('gaia-dev', 'https://dev.example', 'bearer_token');
  existing.transport.bearer_token_env_var = 'EXISTING_TOKEN';
  const fake = cli([existing]);
  const result = await manageGaiaConnections(config, 'setup', ['dev'], fake.run);
  assert.equal(result.environments[0].authentication, 'external-credentials');
  await assert.rejects(
    manageGaiaConnections(config, 'login', ['dev'], fake.run),
    /external credentials/,
  );
  assert.deepEqual(fake.mutations, []);
});

test('CLI runs from the config workspace, delegates both logins, and suppresses inventory errors containing secrets', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gaia-connections-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const workspace = path.join(root, 'workspace');
  await mkdir(bin);
  await mkdir(workspace);
  const configPath = path.join(workspace, 'gaia.config.json');
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(path.join(workspace, 'state.json'), '[]');
  // This executable substitutes only the external Codex boundary; the helper and child-process
  // adapter run unchanged. Wrong cwd, shell execution, or raw error forwarding fail the test.
  await writeFile(
    path.join(bin, 'codex'),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.FAIL_INVENTORY) {
  console.error('secret-marker');
  process.exit(1);
}
const servers = JSON.parse(fs.readFileSync('state.json', 'utf8'));
if (args[1] === 'list') {
  console.log(JSON.stringify(servers));
} else {
  fs.appendFileSync('calls.jsonl', JSON.stringify(args) + '\\n');
  if (args[1] === 'add') servers.push({name: args[2], enabled: true,
    transport: {type: 'streamable_http', url: args[4]}, auth_status: 'not_logged_in'});
  else if (args[1] === 'login') servers.find(s => s.name === args[2]).auth_status = 'o_auth';
  else process.exit(2);
  fs.writeFileSync('state.json', JSON.stringify(servers));
}
`,
    { mode: 0o755 },
  );
  const options = {
    cwd: root,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  };
  const args = [fileURLToPath(scriptUrl), configPath, 'setup', '--all'];
  const result = await execFileAsync(process.execPath, args, options);
  const report = JSON.parse(result.stdout);
  assert.ok(report.environments.every((item) => item.authentication === 'oauth-stored'));
  assert.ok(report.environments.every((item) => item.liveAccess === 'not-checked'));
  const calls = (await readFile(path.join(workspace, 'calls.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.deepEqual(
    calls.filter((args) => args[1] === 'login').map((args) => args[2]),
    ['gaia-dev', 'gaia-prod'],
  );
  assert.equal(await readFile(configPath, 'utf8'), JSON.stringify(config));
  await assert.rejects(
    execFileAsync(process.execPath, args, {
      ...options,
      env: { ...options.env, FAIL_INVENTORY: '1' },
    }),
    (error) => {
      assert.match(error.stderr, /Cannot read Codex MCP inventory/);
      assert.equal(`${error.stdout}${error.stderr}`.includes('secret-marker'), false);
      return true;
    },
  );
});
