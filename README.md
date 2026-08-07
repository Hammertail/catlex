# catlex

CLI to validate [next-intl](https://next-intl.dev/)-style translation JSON files against a base locale, and scan JSX/TSX/Vue SFCs for hardcoded user-visible strings.

Catch missing keys before they hit production, optionally fail on keys that exist only in a locale file, (alpha) flag UI copy that never entered the message files, and (alpha) propose or review translations (optionally scoped to git changes with `--since`).

## Install

### Linux / macOS

```bash
curl -fsSL https://github.com/Hammertail/catlex/releases/latest/download/install.sh | bash
```

Pin a version:

```bash
curl -fsSL https://github.com/Hammertail/catlex/releases/download/v0.0.1/install.sh | CATLEX_VERSION=0.0.1 bash
```

The installer detects OS and architecture (`linux`/`darwin`, `x64`/`arm64`) and installs to `~/.local/bin/catlex`. Make sure `~/.local/bin` is on your `PATH`.

### Windows (x64)

```powershell
irm https://github.com/Hammertail/catlex/releases/latest/download/install.ps1 | iex
```

Pin a version:

```powershell
$env:CATLEX_VERSION='0.0.1'; irm https://github.com/Hammertail/catlex/releases/download/v0.0.1/install.ps1 | iex
```

The binary is installed to `%LOCALAPPDATA%\catlex\bin\catlex.exe`.

## Quick start

With a messages directory like this:

```text
messages/
  en.json
  pt.json
  es.json
```

Run:

```bash
catlex validate
```

By default catlex looks for `messages/` and treats `en.json` as the base locale.

## What it checks

| Issue | Meaning | Default |
|-------|---------|---------|
| **Missing** | Key exists in the base locale but not in another locale | Error |
| **Extra** | Key exists in a locale but not in the base | Warning |

Use `--strict-extra` to treat extra keys as errors.

## Usage

```bash
catlex validate [options]
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Messages directory relative to the project root |
| `--base <locale>` | Base locale file stem (e.g. `en` → `en.json`) |
| `--cwd <path>` | Project root (default: current directory) |
| `--strict-extra` | Treat extra keys as errors |
| `--no-config` | Do not load or execute project `catlex.config.*` files |
| `--json` | Print JSON instead of the interactive terminal UI |

Examples:

```bash
catlex validate
catlex validate --dir locales --base en
catlex validate --strict-extra
catlex validate --json
catlex validate --no-config --json
```

## Configuration

Optional. Place a config file in the project root. First match wins:

1. `catlex.config.json`
2. `catlex.config.js`
3. `catlex.config.mjs`
4. `catlex.config.ts`

CLI flags override the config file. Defaults:

| Field | Default |
|-------|---------|
| `messagesDir` | `"messages"` |
| `baseLocale` | `"en"` |
| `strictExtra` | `false` |

Example `catlex.config.json`:

```json
{
  "messagesDir": "messages",
  "baseLocale": "en",
  "strictExtra": false
}
```

`.js` / `.mjs` / `.ts` configs are **executable code** (loaded via dynamic `import`). Only use them in trusted local environments. In CI, prefer `--no-config` and pass settings with CLI flags such as `--dir` and `--base`. Generated GitHub Actions workflows from `catlex ci` include `--no-config` by default.

## Source scan (alpha)

Scan JSX/TSX/Vue SFCs for obvious hardcoded user-visible strings that should go through next-intl instead:

```bash
catlex scan
catlex scan --dir src
catlex scan --json
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Source root relative to the project root (default: `.`) |
| `--cwd <path>` | Project root (default: current directory) |
| `--json` | Print JSON instead of the interactive terminal UI |

This command is **alpha**: false positives and missed issues may occur. Detection covers JSX text and common user-facing attributes (`placeholder`, `alt`, `title`, aria-*); translation calls like `t("…")` and `<Trans>` children are not flagged.

## AI translate (alpha)

Fill missing string keys by comparing each locale against the base locale and asking OpenAI to propose translations:

```bash
export OPENAI_API_KEY=sk-...
catlex translate --dry-run
catlex translate --yes
catlex translate --locale pt --model gpt-5.4-mini
catlex translate --json
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Messages directory relative to the project root |
| `--base <locale>` | Base locale file stem (e.g. `en`) |
| `--cwd <path>` | Project root (default: current directory) |
| `--locale <locale>` | Target locale (repeatable or comma-separated; default: all non-base) |
| `--model <id>` | OpenAI model id (default: `gpt-5.4-mini`) |
| `--dry-run` | Propose translations without writing files |
| `--yes` | Skip both interactive prompts and write files |
| `--no-config` | Do not load or execute project `catlex.config.*` files |
| `--json` | Print JSON instead of the interactive terminal UI |

Requires `OPENAI_API_KEY` in the environment. Catlex never stores API keys in config files.

In interactive mode (no `--yes` / `--dry-run`), catlex asks whether to run automatic translation **before** calling the model, then shows the proposals and asks again before writing files. `--yes` skips both prompts.

This command is **alpha**: translations may be incorrect and bugs may occur. Only missing **string** leaves are filled; arrays and other non-string values are skipped. Existing locale files are updated in place — new locale files are not created.

## AI translate review (alpha)

Review existing translations with OpenAI. Missing keys in scope are errors. Present keys are judged `ok` or `wrong`.

```bash
export OPENAI_API_KEY=sk-...
catlex translate review --json
catlex translate review --since main --json
catlex translate review --since main --auto-fix --yes --json
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Messages directory relative to the project root |
| `--base <locale>` | Base locale file stem (e.g. `en`) |
| `--cwd <path>` | Project root (default: current directory) |
| `--locale <locale>` | Target locale (repeatable or comma-separated; default: all non-base) |
| `--model <id>` | OpenAI model id (default: `gpt-5.4-mini`) |
| `--since <ref>` | Only review keys changed between `<ref>` and the current working tree (**recommended in CI**) |
| `--auto-fix` | Propose fixes for `wrong` / missing keys |
| `--yes` | Apply auto-fix writes without interactive confirmation |
| `--no-config` | Do not load or execute project `catlex.config.*` files |
| `--json` | Print JSON instead of the interactive terminal UI |

Without `--since`, catlex reviews the **full** corpus (every string key in the base locale × each target locale). That is expensive and noisy — prefer `--since` locally for focused work and always in CI.

With `--since`:

- Diff is `since`…working tree (includes uncommitted message edits).
- A change in the **base** locale file causes that path to be reviewed in every target locale.
- A change only in a **sibling** locale file (e.g. `pt.json`) reviews that path only in that locale, compared to the current base value.
- Removed keys are reported informatively and do not fail the gate.
- The report includes a **Scope** summary: current branch (or detached HEAD), resolved `--since` SHA, compared message files, and key/removed/skipped counts.

`--auto-fix` collects suggested values; without `--yes`, catlex shows proposals and asks before writing. With `--auto-fix --yes`, fixes are written and the command exits `0` only if every issue was fixed.

Requires `OPENAI_API_KEY`. This command is **alpha**: model verdicts may be wrong.

### CI example (changed keys only)

Use a full git history (or fetch the base ref) so `--since` can resolve:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0

- run: catlex translate review --no-config --since "$CATLEX_SINCE" --json
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    CATLEX_SINCE: ${{ github.event_name == 'pull_request' && format('origin/{0}', github.base_ref) || 'origin/main' }}
```

Pass GitHub context values through `env` (never interpolate `${{ }}` directly into `run:` scripts). On `push` (no PR base), the expression above falls back to `origin/main`.

## Exit codes and CI

| Code | Meaning |
|------|---------|
| `0` | Validation/scan/translate completed (including cancel / nothing to do), or review passed (including successful auto-fix) |
| `1` | Validation failed, scan found hardcoded strings, review failed, missing API key, or an unexpected command error |
| `2` | `scan` completed with one or more per-file scanner errors (partial results may still be reported) |

For pipelines, prefer `--json` and `--no-config` (so project JS/TS config is not executed on the runner):

```bash
catlex validate --no-config --json
catlex scan --json
catlex translate --no-config --dry-run --json
catlex translate review --no-config --since origin/main --json
```

### Add GitHub Actions workflows

Interactively scaffold one or more workflows (Space to toggle, Enter to confirm):

```bash
catlex ci
```

(`init-ci` remains as an alias of `ci`.)

| Workflow | File | What it does |
|----------|------|--------------|
| Validate messages | `.github/workflows/validate-messages.yml` | `catlex validate --no-config --json` |
| Review translations | `.github/workflows/review-translations.yml` | `catlex translate review --no-config --since … --json` (gate only) |
| Review, auto-fix, and commit | `.github/workflows/review-fix-translations.yml` | Review with `--no-config --auto-fix --yes`, then commit |
| Fill missing translations and commit | `.github/workflows/translate-fill.yml` | `catlex translate --no-config --yes`, then commit |

AI workflows require repository secret `OPENAI_API_KEY`. Auto-commit workflows set `permissions: contents: write` and use `stefanzweifel/git-auto-commit-action`, with a same-repository guard so commits are skipped for fork pull requests. If a selected file already exists, you are asked whether to overwrite it.

## Building from source

Requires [Bun](https://bun.sh/):

```bash
bun install
bun run build            # → dist/catlex (current platform)
bun run build:all        # → all release targets
bun run build:linux:x64  # → dist/catlex-linux-x64
bun run build:mac:arm64  # → dist/catlex-darwin-arm64
```

Per-OS scripts: `build:linux:x64`, `build:linux:arm64`, `build:mac:x64`, `build:mac:arm64`, `build:windows:x64`.

Contributor and agent notes: [AGENTS.md](AGENTS.md).
