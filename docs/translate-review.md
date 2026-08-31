# AI translate review (alpha)

`catlex translate review` asks a model to judge existing translations against the base locale. Present string keys are marked `ok` or `wrong`. Missing keys in scope are `missing` (errors). Optionally (`--auto-fix`) the model proposes replacements, which you can write with `--yes`.

Without `--since`, **every** string key in the base × each target locale is reviewed. That is expensive and noisy. Prefer `--since <git-ref>` locally for focused work and **always in CI**.

The command is **alpha**. Model verdicts can be wrong.

## Command

```bash
export OPENAI_API_KEY=sk-...
catlex translate review --json
catlex translate review --since main --json
catlex translate review --since main --auto-fix --yes --json
catlex translate review --verbose
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Messages directory relative to `--cwd` |
| `--base <locale>` | Base locale stem |
| `--cwd <path>` | Project root |
| `--locale <locale>` | Target locale (repeatable or comma-separated; default: all non-base) |
| `--model <id>` | Model id (default: `gpt-5.4-mini`) |
| `--base-url <url>` | OpenAI-compatible API base URL |
| `--since <ref>` | Only review keys changed between `<ref>` and the **working tree** (includes uncommitted edits) |
| `--auto-fix` | Collect suggested values for `wrong` / missing keys |
| `--yes` | Apply auto-fix writes without a confirmation prompt |
| `--no-config` | Ignore `catlex.config.*` |
| `--json` | JSON on stdout; banner/progress on stderr |
| `--verbose` | Print per-chunk path lists |
| `--concurrency <n>` | Max parallel API calls (default `4`, range 1–32) |

Providers, API key, headers, and concurrency work the same as [`translate`](./translate.md).

## How it works

1. Load config and the current messages directory.
2. Resolve **scope** (full corpus or `--since` git diff). See below.
3. Split scoped targets into **present** (locale has a string) and **missing** (path absent in the locale).
4. Present keys go to the reviewer in chunks of **50**. The model must call `submitTranslationReviews` with `ok` or `wrong` per path.
5. Missing keys:
   - Without `--auto-fix`: recorded as `missing`, no extra API call.
   - With `--auto-fix`: sent through the same translator as `catlex translate` (few-shot examples, `submitTranslations`).
6. `--auto-fix` on present `wrong` items requires a non-empty `suggestedValue`. Missing suggestions are `missingSuggestedPaths` (structural failure).
7. The CLI always reviews with `dryRun: true` first (no writes). If `--auto-fix` produced fixes, it asks before writing unless `--yes`.
8. `ok` on the result (and exit `0`) means: no incomplete/unexpected/missing-suggestion paths, and every `wrong` / `missing` item was either absent or **written** as a fix.

Full-corpus review still issues one model call per chunk of 50; concurrency only overlaps those calls. It does not reduce the number of calls.

### Verdicts

| Verdict | Meaning |
|---------|---------|
| `ok` | Locale string is acceptable vs the base |
| `wrong` | Locale string is incorrect; optional `reason` and `suggestedValue` |
| `missing` | Key is in scope on the base but the locale has no string |

Removed keys (present at `--since`, gone in the working tree) are listed informatively and **do not fail** the gate.

Non-string leaves in scope are `skipped` (`non-string-base` / `non-string-locale`) and are not sent to the model.

### Pass / fail after auto-fix

`computeOk`:

- Structural problems (`incompletePaths`, `unexpectedPaths`, `missingSuggestedPaths`) → fail.
- `ok` items → pass.
- `wrong` / `missing` → pass only if fixes were **written** for those paths (`--auto-fix --yes` and the write succeeded).

So `--auto-fix` without `--yes` still exits `1` if issues were found: proposals exist but were not applied. `--auto-fix --yes` exits `0` only when every issue in scope got a written fix.

## `--since` scope

Diff is **`since`…working tree** (not `since…HEAD`). Uncommitted edits in message files count.

Requires a git repo and a resolvable ref. Use `fetch-depth: 0` (or fetch the base ref) in Actions so `origin/main` / `origin/{base_ref}` exists.

Rules:

- A change in the **base** locale file (added or modified path) puts that path in scope for **every** target locale.
- A change only in a **sibling** locale (`pt.json`) puts that path in scope **only for that locale**, compared to the current base value. If the path is no longer in the base, it is not reviewed (it may show up as removed).
- If both base and sibling changed the same path, the target is still one item, with `changeSources: ["base", "locale"]`.
- Removed paths are reported; they do not fail the gate.

The report includes a **Scope** block: current branch (or detached HEAD), resolved `--since` SHA, message files at the ref vs working tree, and key/removed/skipped counts.

Without `--since`, `changeSources` is empty and every string key in the base is a target for each locale.

## Progress

Banner: source locale, targets, messages dir, model, and `Since:` when set. Then `Progress: n / total keys reviewed · in-flight k`. `--verbose` prints `[review]` / `[translate-missing]` lines with the paths in each completed chunk.

With `--json`, banner and progress go to **stderr**.

## Exit codes

| Code | When |
|------|------|
| `0` | `result.ok` is true: no unresolved `wrong`/`missing` items and no structural failures (including after a successful `--auto-fix --yes` write) |
| `1` | Review failed (`ok: false`), user declined to write fixes while issues remain, missing API key, git/ref error, config/load error, or model failure |

Declining the write prompt sets `cancelled: true` in JSON but still exits `1` if the review had issues — the gate is `ok`, not `cancelled`. Prefer `--json` and inspect `ok` in CI. Generated review workflows treat a non-zero process exit as a failed job.

## JSON output (abridged)

```json
{
  "ok": false,
  "alpha": true,
  "baseLocale": "en",
  "messagesDir": "messages",
  "since": "origin/main",
  "sinceContext": {
    "sinceRef": "origin/main",
    "sinceSha": "abc123…",
    "currentBranch": "feat/copy",
    "detachedHead": false,
    "filesAtRef": ["en.json", "pt.json"],
    "filesWorkingTree": ["en.json", "pt.json"],
    "keyCount": 4,
    "removedCount": 0,
    "skippedCount": 0
  },
  "autoFix": false,
  "dryRun": true,
  "cancelled": false,
  "keysReviewed": 4,
  "issuesFound": 1,
  "fixCount": 0,
  "writtenFiles": [],
  "removed": [],
  "skipped": [],
  "reports": [
    {
      "locale": "pt",
      "filePath": "/abs/messages/pt.json",
      "items": [
        {
          "locale": "pt",
          "path": "nav.home",
          "verdict": "wrong",
          "reason": "…",
          "suggestedValue": "Início",
          "baseValue": "Home",
          "localeValue": "Home",
          "changeSources": ["base"]
        }
      ],
      "fixes": [],
      "incompletePaths": [],
      "unexpectedPaths": [],
      "missingSuggestedPaths": [],
      "placeholderWarnings": []
    }
  ]
}
```

## CI

Always pass `--since` so you do not review the whole corpus on every push.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0

- run: catlex translate review --no-config --since "$CATLEX_SINCE" --json
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    OPENAI_BASE_URL: ${{ vars.OPENAI_BASE_URL }}
    CATLEX_SINCE: ${{ github.event_name == 'pull_request' && format('origin/{0}', github.base_ref) || 'origin/main' }}
```

Pass GitHub context through `env` (do not interpolate `${{ }}` into `run:` scripts). Generated workflows from `catlex ci` do this; they also use `--no-config`, so set `--concurrency` on the `run:` line if you need it. See [CI workflows](./ci.md).
