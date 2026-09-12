# Configuration

Optional. If no config file is present, Catlex uses built-in defaults. CLI flags always win over the file.

## File discovery

Catlex looks in the project root (`--cwd`) and stops at the **first** match, in this order:

1. `catlex.config.json`
2. `catlex.config.js`
3. `catlex.config.mjs`
4. `catlex.config.ts`

There is no merge across files. A JSON file in the same directory as a `.ts` config means the TypeScript file is never loaded.

`.js` / `.mjs` / `.ts` configs are **executable** (dynamic `import`) and are **refused by default**. Pass `--allow-js-config` (or `allowJsConfig: true` in the library API) only in trusted local environments. Prefer `catlex.config.json`, or `--no-config` with CLI flags. Generated GitHub Actions from `catlex ci` already use `--no-config`.

Even JSON config is **attacker-controlled policy** when you run Catlex against an untrusted tree: it can set `openai.baseUrl` / `openai.headers`. Catlex rejects non-https and private/link-local base URLs unless you pass `--allow-insecure-base-url`.

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
| `translate.guidance` | string (max 8192 chars after trim; global, every locale) | unset | translate, translate review |
| `translate.guidanceFile` | string path (global, every locale) | unset | translate, translate review |

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
    "concurrency": 8,
    "guidanceFile": "glossary.md"
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
| `translate.guidance` | `--guidance <text>` |
| `translate.guidanceFile` | `--guidance-file <path>` |

OpenAI base URL precedence: **CLI `--base-url` > config `openai.baseUrl` > env `OPENAI_BASE_URL` > SDK default**.

Resolved base URLs must be **public `https`** by default. `http`, loopback, private, and link-local hosts (including cloud metadata addresses) are rejected unless you pass `--allow-insecure-base-url` (or `allowInsecure` / `allowInsecureBaseUrl` in library calls). Use that only for trusted local proxies.

Concurrency: **CLI `--concurrency` > config `translate.concurrency` > 4**. Invalid values (non-integer, outside 1–32) fail at flag parse or at runtime.

Guidance: **CLI `--guidance` > CLI `--guidance-file` > config `translate.guidance` > config `translate.guidanceFile`**. Passing both `--guidance` and `--guidance-file` is an error. Empty or whitespace-only `--guidance` is treated as omitted and falls through. An empty `--guidance-file` is an error. `translate.guidanceFile` is resolved relative to the **config file directory**; CLI `--guidance-file` is relative to `--cwd` unless absolute.

The extra text is fenced in `<project_guidance>` on the user prompt. Built-in system instructions stay in place and are extended by one conflict-priority sentence (built-in rules win; project guidance wins over few-shot examples). The same string is sent for every target locale. `--dry-run --json` reports `guidanceSource` (`flag` | `file` | `config` | `null`) and `guidancePreview`.

Generated translate/review workflows pass `--no-config --guidance-file ./glossary.md`, so keep a `glossary.md` at the repository root (or edit the `run:` line).

## `--no-config`

Stops Catlex from discovering or loading `catlex.config.*`. Use it:

- In CI, so a compromised or surprising project config cannot change behavior or (without `--allow-js-config`) execute JS/TS on the runner.
- When you want a one-off run that ignores the project file.

## `--allow-js-config`

Opt in to loading `catlex.config.js` / `.mjs` / `.ts` via dynamic `import`. Without this flag, those files are refused and do not run. JSON configs still load unless `--no-config` is set.

## `--allow-insecure-base-url`

Opt in to `http` or private/link-local OpenAI-compatible base URLs. Required for local gateways such as `http://127.0.0.1:8080/v1`. Do not use in CI against untrusted repositories.

Generated workflows always pass `--no-config`. Translate and review jobs also pass `--guidance-file ./glossary.md`. Config `translate.concurrency` / `translate.guidance` / `translate.guidanceFile` do **not** apply on those jobs. Raise or lower parallelism with `--concurrency` on the workflow `run:` line.

## Library

```ts
import { loadConfig } from "catlex";

const config = await loadConfig(process.cwd(), {
  messagesDir: "locales",
  noConfig: true,
  // Or, for trusted local JS modules only:
  // allowJsConfig: true,
});
```

See [Library API](./library.md).
