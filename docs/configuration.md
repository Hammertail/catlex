# Configuration

Optional. If no config file is present, Catlex uses built-in defaults. CLI flags always win over the file.

## File discovery

Catlex looks in the project root (`--cwd`) and stops at the **first** match, in this order:

1. `catlex.config.json`
2. `catlex.config.js`
3. `catlex.config.mjs`
4. `catlex.config.ts`

There is no merge across files. A JSON file in the same directory as a `.ts` config means the TypeScript file is never loaded.

`.js` / `.mjs` / `.ts` configs are **executable** (dynamic `import`). Treat them like any other untrusted code: they run with your user’s permissions. In CI, prefer `--no-config` and pass `--dir` / `--base` on the command line. Generated GitHub Actions from `catlex ci` already use `--no-config`.

## Merge order

```text
defaults  <  config file  <  CLI flags
```

Omitted CLI flags do not wipe file values. `--no-config` skips the file entirely (defaults + flags only).

## Fields

| Field | Type | Default | Used by |
|-------|------|---------|---------|
| `messagesDir` | string | `"messages"` | validate, translate, translate review |
| `baseLocale` | string | `"en"` | validate, translate, translate review |
| `strictExtra` | boolean | `false` | validate |
| `openai.baseUrl` | string | unset (official OpenAI) | translate, translate review |
| `openai.headers` | `{ [name]: string }` | unset | translate, translate review |
| `translate.concurrency` | integer 1–32 | `4` (runtime default if omitted) | translate, translate review |

[Scan](./scan.md) does **not** read this file. Scan roots, ignore globs, and string allowlists are not configurable yet; use `--dir` / `--cwd` only.

API keys are **never** read from config. Set `OPENAI_API_KEY` in the environment.

## Example

```json
{
  "messagesDir": "src/i18n/messages",
  "baseLocale": "en",
  "strictExtra": true,
  "openai": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "headers": {
      "HTTP-Referer": "https://example.com",
      "X-Title": "My App"
    }
  },
  "translate": {
    "concurrency": 8
  }
}
```

Module configs can `export default { ... }` with the same shape.

## CLI equivalents

| Config | Flag |
|--------|------|
| `messagesDir` | `--dir <path>` |
| `baseLocale` | `--base <locale>` |
| `strictExtra` | `--strict-extra` |
| `openai.baseUrl` | `--base-url <url>` (also `OPENAI_BASE_URL`) |
| `openai.headers` | config only (no flag) |
| `translate.concurrency` | `--concurrency <n>` |

OpenAI base URL precedence: **CLI `--base-url` > config `openai.baseUrl` > env `OPENAI_BASE_URL` > SDK default**.

Concurrency: **CLI `--concurrency` > config `translate.concurrency` > 4**. Invalid values (non-integer, outside 1–32) fail at flag parse or at runtime.

## `--no-config`

Stops Catlex from discovering or executing `catlex.config.*`. Use it:

- In CI, so a compromised or surprising JS/TS config cannot run on the runner.
- When you want a one-off run that ignores the project file.

Generated workflows always pass `--no-config`, so `translate.concurrency` in the project file does **not** apply on those jobs. Raise or lower parallelism with `--concurrency` on the workflow `run:` line.

## Library

```ts
import { loadConfig } from "catlex";

const config = await loadConfig(process.cwd(), {
  messagesDir: "locales",
  noConfig: true,
});
```

See [Library API](./library.md).
