# catlex

CLI to validate [next-intl](https://next-intl.dev/)-style translation JSON files against a base locale, and scan JSX/TSX/Vue SFCs for hardcoded user-visible strings.

Catch missing keys before they hit production, optionally fail on keys that exist only in a locale file, and (alpha) flag UI copy that never entered the message files.

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
| `--json` | Print JSON instead of the interactive terminal UI |

Examples:

```bash
catlex validate
catlex validate --dir locales --base en
catlex validate --strict-extra
catlex validate --json
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

This command is **alpha**: false positives and missed issues may occur. Detection covers JSX text, Vue template text, and common user-facing attributes (`placeholder`, `alt`, `title`, aria-*); translation calls like `t("…")` and `<Trans>` children are not flagged.

## Exit codes and CI

| Code | Meaning |
|------|---------|
| `0` | Validation or scan passed |
| `1` | Validation/scan failed or an error occurred |

For pipelines, prefer `--json`:

```bash
catlex validate --json
catlex scan --json
```

### Add a GitHub Actions workflow

Scaffold a workflow that installs the catlex binary and runs `validate --json`:

```bash
catlex init-ci
```

This interactively creates `.github/workflows/validate-messages.yml`. If the file already exists, you are asked whether to overwrite it.

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
