import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeGaiaConfig,
  resolveGaiaEnvironment,
  resolveGaiaTransfer,
} from '../plugins/gaia-codex/skills/gaia-automation/scripts/environments.mjs';

const legacy = {
  projectId: 'hosted',
  gaiaBaseUrl: 'https://thegaia.ai',
  localProjectId: 'local',
  localGaiaBaseUrl: 'https://gaia.localhost:1443',
  customerProjectId: 'customer',
  customerGaiaBaseUrl: 'https://customer.example',
};
test('legacy bindings retain the default, local opt-in, and old default cache', () => {
  assert.equal(resolveGaiaEnvironment(legacy).projectId, 'hosted');
  assert.equal(resolveGaiaEnvironment(legacy).cachePath, 'gaia/current-export.json');
  assert.equal(resolveGaiaEnvironment(legacy, 'local').projectId, 'local');
  assert.equal(
    resolveGaiaEnvironment({ ...legacy, activeEnvironment: 'customer' }).projectId,
    'customer',
  );
  assert.equal(legacy.defaultEnvironment, undefined);
});
test('any ordered pair of named environments resolves to independent connections and caches', () => {
  const names = ['thegaia', 'local', 'customer-dev', 'customer-uat', 'customer-prod'];
  const config = {
    schemaVersion: 2,
    defaultEnvironment: 'customer-dev',
    environments: Object.fromEntries(
      names.map((name) => [
        name,
        { gaiaBaseUrl: `https://${name}.example`, projectId: name, mcpServer: `gaia-${name}` },
      ]),
    ),
  };
  assert.equal(resolveGaiaEnvironment(config).name, 'customer-dev');
  for (const from of names)
    for (const to of names) {
      if (from === to)
        assert.throws(() => resolveGaiaTransfer(config, from, to), /same Gaia project/);
      else {
        const result = resolveGaiaTransfer(config, from, to);
        assert.equal(result.source.projectId, from);
        assert.equal(result.destination.projectId, to);
        assert.notEqual(result.source.cachePath, result.destination.cachePath);
      }
    }
  assert.throws(() => resolveGaiaTransfer(config, 'local'), /explicit/);
  assert.throws(() => resolveGaiaEnvironment(config, 'customer'), /Unknown environment/);
});
test('missing projects and shared server aliases never fall back to production', () => {
  assert.throws(
    () => resolveGaiaEnvironment({ ...legacy, localProjectId: '' }, 'local'),
    /no projectId/,
  );
  assert.equal(
    resolveGaiaEnvironment({ ...legacy, localProjectId: '' }, 'local', { requireProject: false })
      .name,
    'local',
  );
  assert.throws(
    () => normalizeGaiaConfig({ ...legacy, localMcpServer: 'gaia' }),
    /different origins/,
  );
  assert.throws(
    () => normalizeGaiaConfig({ ...legacy, gaiaBaseUrl: 'https://user:password@example.com' }),
    /without credentials/,
  );
  assert.throws(() => normalizeGaiaConfig({ ...legacy, schemaVersion: 99 }), /schemaVersion/);
});
