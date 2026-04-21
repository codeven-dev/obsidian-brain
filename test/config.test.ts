import { describe, it, expect, afterEach } from 'vitest';
import { resolveConfig } from '../src/config.js';

describe('resolveConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when vault path is not configured', () => {
    delete process.env.VAULT_PATH;
    delete process.env.KG_VAULT_PATH;
    expect(() => resolveConfig({})).toThrow(/vault/i);
  });

  it('reads vault path from VAULT_PATH env var', () => {
    delete process.env.KG_VAULT_PATH;
    process.env.VAULT_PATH = '/tmp/test-vault';
    const config = resolveConfig({});
    expect(config.vaultPath).toBe('/tmp/test-vault');
  });

  it('reads vault path from legacy KG_VAULT_PATH env var', () => {
    delete process.env.VAULT_PATH;
    process.env.KG_VAULT_PATH = '/tmp/legacy-vault';
    const config = resolveConfig({});
    expect(config.vaultPath).toBe('/tmp/legacy-vault');
  });

  it('CLI flags override env vars', () => {
    process.env.VAULT_PATH = '/tmp/env-vault';
    const config = resolveConfig({ vaultPath: '/tmp/cli-vault' });
    expect(config.vaultPath).toBe('/tmp/cli-vault');
  });

  it('defaults data dir to XDG_DATA_HOME/obsidian-brain', () => {
    process.env.VAULT_PATH = '/tmp/vault';
    process.env.XDG_DATA_HOME = '/tmp/xdg';
    delete process.env.DATA_DIR;
    delete process.env.KG_DATA_DIR;
    const config = resolveConfig({});
    expect(config.dataDir).toBe('/tmp/xdg/obsidian-brain');
  });

  it('reads data dir from DATA_DIR env var', () => {
    process.env.VAULT_PATH = '/tmp/vault';
    process.env.DATA_DIR = '/tmp/custom-data';
    delete process.env.KG_DATA_DIR;
    const config = resolveConfig({});
    expect(config.dataDir).toBe('/tmp/custom-data');
  });

  it('reads data dir from legacy KG_DATA_DIR env var', () => {
    process.env.VAULT_PATH = '/tmp/vault';
    delete process.env.DATA_DIR;
    process.env.KG_DATA_DIR = '/tmp/legacy-data';
    const config = resolveConfig({});
    expect(config.dataDir).toBe('/tmp/legacy-data');
  });

  it('falls back to ~/.local/share/obsidian-brain when XDG not set', () => {
    process.env.VAULT_PATH = '/tmp/vault';
    delete process.env.XDG_DATA_HOME;
    delete process.env.DATA_DIR;
    delete process.env.KG_DATA_DIR;
    const config = resolveConfig({});
    expect(config.dataDir).toContain('.local/share/obsidian-brain');
  });

  it('dbPath is under dataDir', () => {
    process.env.VAULT_PATH = '/tmp/vault';
    process.env.DATA_DIR = '/tmp/data';
    delete process.env.KG_DATA_DIR;
    const config = resolveConfig({});
    expect(config.dbPath).toBe('/tmp/data/kg.db');
  });
});
