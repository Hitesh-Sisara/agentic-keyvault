import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";

export interface CliConfig {
  baseUrl: string;
  token: string;
}

const CONFIG_DIR = join(homedir(), ".config", "agentic-keyvault");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

/** Env vars override the stored config — handy for CI and headless agents. */
export function loadConfig(): Partial<CliConfig> {
  let stored: Partial<CliConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      stored = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<CliConfig>;
    } catch {
      stored = {};
    }
  }
  return {
    baseUrl: process.env.AKV_URL ?? stored.baseUrl,
    token: process.env.AKV_TOKEN ?? stored.token
  };
}

export function requireConfig(): CliConfig {
  const cfg = loadConfig();
  if (!cfg.baseUrl) throw new Error("not configured — run `akv login --url <worker-url>` first");
  if (!cfg.token) throw new Error("no token — run `akv login` or `akv bootstrap` first");
  return { baseUrl: cfg.baseUrl, token: cfg.token };
}

export function saveConfig(cfg: CliConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
}

export function configPath(): string {
  return CONFIG_PATH;
}
