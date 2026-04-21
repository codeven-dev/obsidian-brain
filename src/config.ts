import { homedir } from 'os';
import { join } from 'path';

export interface KGConfig {
  vaultPath: string;
  dataDir: string;
  dbPath: string;
}

export interface ConfigOverrides {
  vaultPath?: string;
  dataDir?: string;
}

export function resolveConfig(overrides: ConfigOverrides): KGConfig {
  // VAULT_PATH is the documented name; KG_VAULT_PATH is the legacy alias
  // carried over from obra so existing users don't break.
  const vaultPath = overrides.vaultPath
    ?? process.env.VAULT_PATH
    ?? process.env.KG_VAULT_PATH;

  if (!vaultPath) {
    throw new Error(
      'Vault path not configured. Set VAULT_PATH (or the legacy KG_VAULT_PATH) or pass --vault-path.'
    );
  }

  const xdgData = process.env.XDG_DATA_HOME
    ?? join(homedir(), '.local', 'share');

  // Same alias treatment for the data dir.
  const dataDir = overrides.dataDir
    ?? process.env.DATA_DIR
    ?? process.env.KG_DATA_DIR
    ?? join(xdgData, 'obsidian-brain');

  return {
    vaultPath,
    dataDir,
    dbPath: join(dataDir, 'kg.db'),
  };
}
