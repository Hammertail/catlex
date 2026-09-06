# AI translate (alpha)

`catlex translate` finds **string** keys that exist in the base locale but not in a target locale, asks an OpenAI-compatible model to translate them, and (after confirmation, or with `--yes`) writes the values back into the existing locale JSON.

It does not create new locale files. It does not overwrite keys that already exist. Translation quality is the model’s; treat this as a draft generator.

The command is **alpha**.

## Command

```bash
export OPENAI_API_KEY=sk-...
catlex translate --dry-run
catlex translate --yes
catlex translate --locale pt --model gpt-5.4-mini
catlex translate --base-url https://openrouter.ai/api/v1 --model openai/gpt-5.4-mini
catlex translate --json
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Messages directory relative to `--cwd` |
| `--base <locale>` | Base locale stem |
| `--cwd <path>` | Project root |
| `--locale <locale>` | Target locale (repeatable or comma-separated; default: all non-base) |
| `--model <id>` | Model id (default: `gpt-5.4-mini`) |
| `--base-url <url>` | OpenAI-compatible API base URL |
| `--dry-run` | List missing/skipped keys; **no API call**, no `OPENAI_API_KEY` required |
| `--yes` | Skip both interactive prompts and write files |
| `--no-config` | Ignore `catlex.config.*` |
| `--json` | JSON on stdout (progress on stderr when the API runs) |
| `--concurrency <n>` | Max parallel API calls (default `4`, range 1–32) |

## How it works

1. Load [message files](./message-files.md) and [config](./configuration.md).
2. For each target locale, collect paths missing vs the base:
   - Base leaf is a **string** → queued for translation.
   - Base leaf is anything else (array, number, …) → `skipped` with reason `non-string`.
   - Extra keys in the locale are ignored (validate would warn; translate does not delete them).
3. `--dry-run` stops here and prints the plan (`pending` + `skipped`).
4. Otherwise, missing keys are split into chunks of **50** paths. Up to `concurrency` chunks run in parallel (across locales). Each chunk is one model call.
5. For each locale, up to **8** existing string pairs (sorted by path) are attached as few-shot examples so the model can match tone.
6. The model must call the `submitTranslations` tool. Free-form chat without the tool is an error (`The model did not call submitTranslations`).
7. Submitted paths are checked: unknown paths are dropped (`unexpectedPaths`); requested paths the model omitted are `incompletePaths`; ICU `{placeholder}` sets that do not match the base become `placeholderWarnings` (the translation is still accepted).
8. Interactive mode asks **before** calling the API, then shows proposals and asks again before writing. `--yes` skips both prompts. The CLI always generates with `skipWrite` and writes only after the second confirmation (or `--yes`).

Message values in the prompt are wrapped in `<source_text>` and treated as untrusted data (the model is instructed not to follow instructions inside copy).

### Interactive vs `--yes` vs `--dry-run`

| Mode | API | Writes | Prompts |
|------|-----|--------|---------|
| default (TTY) | after first confirm | after second confirm | two |
| `--yes` | yes | yes | none |
| `--dry-run` | no | no | none |
| cancel at a prompt | maybe none / no write | no | —; exit `0`, `cancelled: true` in JSON |

Nothing to translate (all locales already complete) exits `0` without calling the API.

### Parallelism

`translate.concurrency` in config or `--concurrency` on the CLI. CLI wins. Default `4`. This is **in-flight API calls**, not “keys at once”: 200 missing keys still means 4 chunks of 50 with default chunk size; concurrency 4 can run those four chunks together.

Raising concurrency shortens wall-clock time and increases provider rate-limit risk. It does not change how many calls run in total.

After the first chunk failure, no new chunks are started; in-flight calls finish, then the error is thrown (CLI exit `1`).

## Providers

Requires `OPENAI_API_KEY` in the environment (except `--dry-run`). Catlex never stores keys in config.

OpenAI-compatible endpoints (OpenRouter, proxies, self-hosted gateways) need a base URL via `--base-url`, `OPENAI_BASE_URL`, or `openai.baseUrl`. Precedence: CLI > config > env. The endpoint must support **chat completions with tool calling**.

Optional provider headers (OpenRouter `HTTP-Referer` / `X-Title`) live under `openai.headers` in config only.

```bash
OPENAI_API_KEY=... OPENAI_BASE_URL=https://openrouter.ai/api/v1 \
  catlex translate --model openai/gpt-5.4-mini --yes
```

## Progress

A start banner (source locale, targets, messages dir, model) then `Progress: n / total keys translated · in-flight k`. With `--json`, that goes to **stderr** so stdout stays parseable JSON.

## Writes

Patches are applied onto the existing locale tree and written as pretty JSON. New locale files are not created. Paths are confined to the messages directory (symlink / traversal guard).

## Exit codes

| Code | When |
|------|------|
| `0` | Finished, including dry-run, nothing to do, or user cancelled a prompt |
| `1` | Missing API key, invalid config, load error, model/tool failure |

Translate does **not** fail the process because some paths were incomplete or had placeholder warnings. Inspect the report.

## JSON output

```json
{
  "ok": true,
  "alpha": true,
  "alphaMessage": "This command is alpha: translations may be incorrect and bugs may occur.",
  "baseLocale": "en",
  "messagesDir": "messages",
  "dryRun": false,
  "cancelled": false,
  "translatedCount": 3,
  "pendingCount": 0,
  "writtenFiles": ["/abs/messages/pt.json"],
  "reports": [
    {
      "locale": "pt",
      "filePath": "/abs/messages/pt.json",
      "translated": [{ "path": "nav.home", "value": "Início", "baseValue": "Home" }],
      "pending": [],
      "skipped": [],
      "incompletePaths": [],
      "unexpectedPaths": [],
      "placeholderWarnings": []
    }
  ]
}
```

On `--dry-run`, translations are empty and missing keys appear in `pending`.

## What it does not do

- Review or rewrite existing translations — that is [`translate review`](./translate-review.md).
- Fill non-string leaves.
- Create `pt.json` if it does not exist yet (add an empty `{}` file first, or copy from the base and then translate).
- Store API keys in `catlex.config.*`.
