//* Libraries imports
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

//* Local imports
import { DEFAULT_CONFIG } from "./defaults.ts";
import { catlexConfigSchema } from "./schema.ts";

//* Types imports
import type { CatlexConfig, ConfigFlags } from "./schema.ts";

const CONFIG_FILE_NAMES = [
  "catlex.config.json",
  "catlex.config.js",
  "catlex.config.mjs",
  "catlex.config.ts",
] as const;

export class ConfigLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigLoadError";
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadJsonConfig(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");

  try {
    return JSON.parse(raw);
  } catch {
    throw new ConfigLoadError(`Invalid JSON config: ${filePath}`);
  }
}

async function loadModuleConfig(filePath: string): Promise<unknown> {
  const url = pathToFileURL(filePath).href;
  const mod = await import(url);
  return mod.default ?? mod;
}

async function findConfigFile(cwd: string): Promise<string | null> {
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = path.join(cwd, name);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function loadConfigFile(cwd: string): Promise<Partial<CatlexConfig>> {
  const configPath = await findConfigFile(cwd);

  if (!configPath) {
    return {};
  }

  const isJson = configPath.endsWith(".json");
  const raw = isJson ? await loadJsonConfig(configPath) : await loadModuleConfig(configPath);

  const parsed = catlexConfigSchema.partial().safeParse(raw);

  if (!parsed.success) {
    throw new ConfigLoadError(`Invalid config in ${configPath}: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Merges config in order: defaults < config file < CLI flags.
 */
export async function loadConfig(cwd: string, flags: ConfigFlags = {}): Promise<CatlexConfig> {
  const fileConfig = await loadConfigFile(cwd);

  const merged = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...Object.fromEntries(Object.entries(flags).filter(([, value]) => value !== undefined)),
  };

  const parsed = catlexConfigSchema.safeParse(merged);

  if (!parsed.success) {
    throw new ConfigLoadError(`Invalid config: ${parsed.error.message}`);
  }

  return parsed.data;
}
