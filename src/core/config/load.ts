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

export async function findConfigFile(cwd: string): Promise<string | null> {
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = path.join(cwd, name);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isExecutableConfigPath(configPath: string): boolean {
  return configPath.endsWith(".js") || configPath.endsWith(".mjs") || configPath.endsWith(".ts");
}

async function loadConfigFile(
  cwd: string,
  options: { allowJsConfig?: boolean } = {},
): Promise<Partial<CatlexConfig>> {
  const configPath = await findConfigFile(cwd);

  if (!configPath) {
    return {};
  }

  const isJson = configPath.endsWith(".json");
  if (!isJson && isExecutableConfigPath(configPath) && options.allowJsConfig !== true) {
    throw new ConfigLoadError(
      `Refusing to execute ${path.basename(configPath)}. Pass --allow-js-config (or allowJsConfig: true) to load JavaScript/TypeScript config modules, use catlex.config.json, or pass --no-config.`,
    );
  }

  const raw = isJson ? await loadJsonConfig(configPath) : await loadModuleConfig(configPath);

  const parsed = catlexConfigSchema.partial().safeParse(raw);

  if (!parsed.success) {
    throw new ConfigLoadError(`Invalid config in ${configPath}: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Merges config in order: defaults < config file < CLI flags.
 * Pass `noConfig: true` to skip loading and executing project config modules.
 * Executable `.js` / `.mjs` / `.ts` configs require `allowJsConfig: true`.
 */
export async function loadConfig(cwd: string, flags: ConfigFlags = {}): Promise<CatlexConfig> {
  const { noConfig, allowJsConfig, ...configFlags } = flags;
  const fileConfig = noConfig === true ? {} : await loadConfigFile(cwd, { allowJsConfig });

  const merged = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...Object.fromEntries(Object.entries(configFlags).filter(([, value]) => value !== undefined)),
  };

  const parsed = catlexConfigSchema.safeParse(merged);

  if (!parsed.success) {
    throw new ConfigLoadError(`Invalid config: ${parsed.error.message}`);
  }

  return parsed.data;
}
