import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const namePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function origin(value, name) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      `${name}: gaiaBaseUrl must be an HTTP(S) origin without credentials or query parameters`,
    );
  }
  return url.origin;
}

/** Pure, non-mutating normalization. Never reads credentials or changes MCP connections. */
export function normalizeGaiaConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config))
    throw new Error('Expected a Gaia config object');
  if (config.schemaVersion !== undefined && ![1, 2].includes(config.schemaVersion))
    throw new Error('Unsupported Gaia config schemaVersion');
  const named = config.environments !== undefined;
  let entries;
  if (named) {
    if (
      !config.environments ||
      typeof config.environments !== 'object' ||
      Array.isArray(config.environments)
    )
      throw new Error('environments must be an object');
    entries = Object.entries(config.environments);
  } else {
    entries = [];
    if (text(config.gaiaBaseUrl) || text(config.projectId))
      entries.push([
        'thegaia',
        {
          ...config,
          kind: 'thegaia',
          gaiaBaseUrl: config.gaiaBaseUrl || 'https://thegaia.ai',
          mcpServer: config.mcpServer || 'gaia',
        },
      ]);
    if (text(config.localGaiaBaseUrl) || text(config.localProjectId))
      entries.push([
        'local',
        {
          kind: 'local',
          gaiaBaseUrl: config.localGaiaBaseUrl || 'https://gaia.localhost:1443',
          projectId: config.localProjectId,
          mcpServer: config.localMcpServer || 'gaia-local',
        },
      ]);
    if (text(config.customerGaiaBaseUrl) || text(config.customerProjectId))
      entries.push([
        'customer',
        {
          kind: 'customer',
          gaiaBaseUrl: config.customerGaiaBaseUrl,
          projectId: config.customerProjectId,
          mcpServer: config.customerMcpServer || 'gaia-customer',
        },
      ]);
  }
  const environments = {};
  const servers = new Map();
  for (const [name, entry] of entries) {
    if (!namePattern.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name))
      throw new Error(`Invalid environment name: ${name}`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`Invalid environment: ${name}`);
    const kind = entry.kind || (['local', 'thegaia'].includes(name) ? name : 'customer');
    if (!['thegaia', 'local', 'customer'].includes(kind))
      throw new Error(`Invalid environment kind: ${name}`);
    const gaiaBaseUrl = origin(entry.gaiaBaseUrl, name);
    const mcpServer = text(entry.mcpServer) || (name === 'thegaia' ? 'gaia' : `gaia-${name}`);
    if (!namePattern.test(mcpServer)) throw new Error(`Invalid MCP server name: ${name}`);
    if (servers.has(mcpServer) && servers.get(mcpServer) !== gaiaBaseUrl)
      throw new Error(`MCP server ${mcpServer} is assigned to different origins`);
    servers.set(mcpServer, gaiaBaseUrl);
    environments[name] = {
      name,
      kind,
      ...(text(entry.stage) ? { stage: entry.stage.trim() } : {}),
      gaiaBaseUrl,
      mcpServer,
      ...(text(entry.projectId) ? { projectId: entry.projectId.trim() } : {}),
      cachePath:
        !named && name === 'thegaia'
          ? 'gaia/current-export.json'
          : `gaia/environments/${name}/current-export.json`,
    };
  }
  const defaultEnvironment =
    text(config.defaultEnvironment) ||
    text(config.activeEnvironment) ||
    text(config.environment) ||
    (own(environments, 'thegaia') ? 'thegaia' : entries.length === 1 ? entries[0][0] : '');
  if (!defaultEnvironment || !own(environments, defaultEnvironment))
    throw new Error('Set defaultEnvironment to one of the configured environment names');
  return { schemaVersion: 2, defaultEnvironment, environments };
}

export function resolveGaiaEnvironment(config, name, { requireProject = true } = {}) {
  const normalized = normalizeGaiaConfig(config);
  const selected = name || normalized.defaultEnvironment;
  if (!own(normalized.environments, selected))
    throw new Error(
      `Unknown environment ${selected}. Choose: ${Object.keys(normalized.environments).join(', ')}`,
    );
  const result = normalized.environments[selected];
  if (requireProject && !result.projectId)
    throw new Error(
      `Environment ${selected} has no projectId; never substitute another environment's project`,
    );
  return result;
}

export function resolveGaiaTransfer(config, from, to) {
  if (!from || !to)
    throw new Error('Transfers require explicit source and destination environment names');
  const source = resolveGaiaEnvironment(config, from);
  const destination = resolveGaiaEnvironment(config, to);
  if (source.gaiaBaseUrl === destination.gaiaBaseUrl && source.projectId === destination.projectId)
    throw new Error('Source and destination resolve to the same Gaia project');
  return { source, destination };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [file = 'gaia.config.json', command = 'list', first, second] = process.argv.slice(2);
    const config = JSON.parse(await readFile(file, 'utf8'));
    let result;
    if (command === 'list') result = normalizeGaiaConfig(config);
    else if (command === 'resolve') result = resolveGaiaEnvironment(config, first);
    else if (command === 'transfer') result = resolveGaiaTransfer(config, first, second);
    else
      throw new Error(
        'Usage: environments.mjs [gaia.config.json] [list|resolve NAME|transfer FROM TO]',
      );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
