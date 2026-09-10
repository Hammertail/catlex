# CI workflows

Catlex is meant to run in GitHub Actions (and any other runner that can install the binary). The CLI also scaffolds workflow files interactively.

## Exit codes (all commands)

| Code | Meaning |
|------|---------|
| `0` | Success: validate/scan/translate finished cleanly (including translate cancel / nothing to do), or review **passed** (including successful auto-fix) |
| `1` | Validate failed, scan found hardcoded strings (and no file errors), review failed, missing API key, or an unexpected error |
| `2` | `scan` finished with one or more **per-file** scanner errors (other files may still have findings) |

For pipelines, prefer `--json` and `--no-config` so stdout is machine-readable and project JS/TS config is not executed on the runner:

```bash
catlex validate --no-config --json
catlex scan --json
catlex translate --no-config --dry-run --json
catlex translate review --no-config --since origin/main --json --guidance-file ./glossary.md
```

Details per feature: [validate](./validate.md), [scan](./scan.md), [translate](./translate.md), [translate review](./translate-review.md).

## `catlex ci`

```bash
catlex ci
```

(`init-ci` is an alias.)

Interactive multi-select (Space to toggle, Enter to confirm). You pick one or more workflow kinds. If a target file already exists, you are asked whether to overwrite it. Cancel (empty selection, or decline every overwrite) writes nothing and exits `0`.

| Workflow | File | Command |
|----------|------|---------|
| Validate messages | `.github/workflows/validate-messages.yml` | `catlex validate --no-config --json` |
| Review translations | `.github/workflows/review-translations.yml` | `catlex translate review --no-config --since … --json --guidance-file ./glossary.md` (gate only) |
| Review, auto-fix, and commit | `.github/workflows/review-fix-translations.yml` | Review with `--auto-fix --yes --guidance-file ./glossary.md`, then commit |
| Fill missing translations and commit | `.github/workflows/translate-fill.yml` | `catlex translate --no-config --yes --json --guidance-file ./glossary.md`, then commit |

All generated jobs:

- Trigger on `push` and `pull_request`.
- Install a **pinned** Catlex release (the CLI version that generated the file), verify `SHA256SUMS`, and add `~/.local/bin` to `PATH`. Do not use `releases/latest` in production CI.
- Use `--no-config`. Translate and review jobs also pass `--guidance-file ./glossary.md` (keep that file at the repo root, or edit the `run:` line). Project `translate.concurrency` / `translate.guidance` / `translate.guidanceFile` do not apply.

### Validate workflow

No OpenAI key. Declares `permissions: contents: read`. Default `actions/checkout` depth is enough (no git history needed).

### Review workflows

- Gate-only review declares `permissions: contents: read`.
- `fetch-depth: 0` so `--since` can resolve `origin/{base_ref}` / `origin/main`.
- `OPENAI_API_KEY` from repository **secrets**.
- Optional `OPENAI_BASE_URL` from repository **variables** (empty → official OpenAI).
- `CATLEX_SINCE` is set in `env` from GitHub context (PR base vs `origin/main` on push). Do not inline `${{ }}` into the `run:` script.

The gate-only review workflow does not write files. The auto-fix workflow runs install + Catlex under `contents: read` (with `persist-credentials: false`), uploads a patch artifact when files change, then a separate commit job with `contents: write` applies the patch and runs [stefanzweifel/git-auto-commit-action](https://github.com/stefanzweifel/git-auto-commit-action).

### Translate-fill workflow

Same OpenAI env as review (no `CATLEX_SINCE`). Same split: read-only install/run job, then a write-only commit job.

### Auto-commit guard

The commit job runs only when the run job produced changes and the event is not a **fork pull request**:

```yaml
if: needs.<run-job>.outputs.changed == 'true' && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)
```

Fork PRs still run the Catlex command (so the gate can fail) but will not push commits back to your repo.

## Secrets and variables

| Name | Kind | Required for |
|------|------|----------------|
| `OPENAI_API_KEY` | secret | review, review-fix, translate-fill |
| `OPENAI_BASE_URL` | variable (optional) | same, when not using api.openai.com |

Validate and scan need neither.

## Installing Catlex on a runner

Generated workflows pin the CLI release that scaffolded them (example for `0.5.0`):

```bash
curl -fsSL https://github.com/Hammertail/catlex/releases/download/v0.5.0/install.sh | CATLEX_VERSION=0.5.0 CATLEX_REQUIRE_CHECKSUM=1 bash
echo "$HOME/.local/bin" >> "$GITHUB_PATH"
```

`releases/latest` is fine for interactive human installs; production CI should keep the pin + `CATLEX_REQUIRE_CHECKSUM=1` so a replaced `latest` asset cannot silently change the binary. The installer verifies the asset against the release `SHA256SUMS` file. Windows runners would use `install.ps1`; the generated YAML is Ubuntu-only.

## What `catlex ci` does not do

- Edit existing workflows except overwrite-after-confirm.
- Generate a scan workflow (add `catlex scan --json` yourself if you want it in CI).
- Read `catlex.config.*` when generating files; the YAML is static besides GitHub expressions.
