# Validate

`catlex validate` is the core, offline check: every locale JSON file must have the same **keys** as the base locale.

It does not read your React/Vue source, does not call an API, and does not compare string values. A mistranslated `pt.json` still passes if the keys line up.

## Command

```bash
catlex validate
catlex validate --dir locales --base en
catlex validate --strict-extra
catlex validate --json
catlex validate --no-config --json
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Messages directory relative to `--cwd` |
| `--base <locale>` | Base locale stem (`en` → `en.json`) |
| `--cwd <path>` | Project root (default: current directory) |
| `--strict-extra` | Treat extra keys as errors (default: warnings) |
| `--no-config` | Ignore `catlex.config.*` |
| `--json` | Print JSON instead of the Ink report |

Config: `messagesDir`, `baseLocale`, `strictExtra`. See [Configuration](./configuration.md) and [Message files](./message-files.md).

## How it works

1. Resolve config (defaults < file < flags).
2. Load every `*.json` in the messages directory and flatten nested objects to dot-paths.
3. Split `{baseLocale}.json` vs the other files.
4. For each other locale, compute:
   - **missing** — path exists in the base, not in the locale
   - **extra** — path exists in the locale, not in the base
5. Print a per-locale report (or JSON) and set the exit code.

Values are ignored. `{ "home": "Casa" }` vs `{ "home": "Home" }` is not an issue. Type mismatches at a shared path (string vs array) are also not an issue for validate.

## Missing vs extra

| Kind | Meaning | Default severity |
|------|---------|------------------|
| `missing` | Base has a key the locale lacks | Always a failure (exit `1`) |
| `extra` | Locale has a key the base lacks | Warning unless `--strict-extra` |

Typical next-intl workflow: add copy to `en.json` first, then fill other locales (manually or with [`translate`](./translate.md)). Extra keys usually mean a locale drifted (typo, leftover after a rename, or a key that was never added to the base).

`--strict-extra` is useful in CI once you want locale files to be a strict subset/superset match of the base, not a dumping ground.

## Exit codes

| Code | When |
|------|------|
| `0` | No missing keys, and no extra keys if `--strict-extra` |
| `1` | At least one failing issue, or a load/config error |

A clean extra-only run without `--strict-extra` exits `0`. The extras still appear in the report.

## JSON output

```json
{
  "ok": false,
  "baseLocale": "en",
  "messagesDir": "/abs/path/messages",
  "strictExtra": false,
  "issues": [
    { "locale": "pt", "path": "nav.home", "kind": "missing" },
    { "locale": "es", "path": "old.key", "kind": "extra" }
  ],
  "reports": [
    {
      "locale": "es",
      "filePath": "/abs/path/messages/es.json",
      "issues": [{ "locale": "es", "path": "old.key", "kind": "extra" }]
    }
  ]
}
```

`ok` is `false` when `hasFailingIssues` would fail the process (missing, or extra under `--strict-extra`).

## What it does not do

- Unused-key detection (key in JSON but never used in source).
- Missing-in-JSON from `t("…")` in source (no extraction).
- Hardcoded UI strings — that is [`scan`](./scan.md).
- Translation quality — that is [`translate review`](./translate-review.md).

## CI

Offline and cheap. Prefer `--no-config --json` on runners:

```bash
catlex validate --no-config --json
```

`catlex ci` can scaffold `.github/workflows/validate-messages.yml` for this. See [CI workflows](./ci.md).
