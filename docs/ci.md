# CI workflows

Catlex is meant to run in GitHub Actions (and any other runner that can install the binary). The CLI also scaffolds workflow files interactively.

## Exit codes (all commands)

| Code | Meaning                                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success: validate/scan/translate finished cleanly (including translate cancel / nothing to do), or review **passed** (including successful auto-fix) |
| `1`  | Validate failed, scan found hardcoded strings (and no file errors), review failed, missing API key, or an unexpected error                           |
| `2`  | `scan` finished with one or more **per-file** scanner errors (other files may still have findings)                                                   |

For pipelines, prefer `--json` and `--no-config` so stdout is machine-readable and project JS/TS config is not executed on the runner:

```bash
catlex validate --no-config --json
catlex scan --json
catlex translate --no-config --dry-run --json
catlex translate review --no-config --since HEAD^ --json
```

Details per feature: [validate](./validate.md), [scan](./scan.md), [translate](./translate.md), [translate review](./translate-review.md).

## `catlex ci`

```bash
catlex ci
```

(`init-ci` is an alias.)

Interactive multi-select (Space to toggle, Enter to confirm). You pick one or more workflow kinds. If a target file already exists, you are asked whether to overwrite it. Cancel (empty selection, or decline every overwrite) writes nothing and exits `0`.

| Workflow                             | File                                            | Command                                                                    |
| ------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Validate messages                    | `.github/workflows/validate-messages.yml`       | `catlex validate --no-config --json`                                       |
| Review translations                  | `.github/workflows/review-translations.yml`     | `catlex translate review --no-config --since HEAD^ --json` (manual review) |
| Review, auto-fix, and commit         | `.github/workflows/review-fix-translations.yml` | Review with `--auto-fix --yes`, upload patch; commit opt-in                |
| Fill missing translations and commit | `.github/workflows/translate-fill.yml`          | `catlex translate --no-config --yes --json`, upload patch; commit opt-in   |

All generated jobs:

- Install a **pinned** Catlex release (the CLI version that generated the file) and add `~/.local/bin` to `PATH`. Do not use `releases/latest` in production CI.
- Use `--no-config`. Project `translate.concurrency` / `translate.guidance` / `translate.guidanceFile` do not apply. Generated jobs do not load a glossary by default.

Validation runs on `push` and `pull_request`. All three AI workflows run only by manual `workflow_dispatch`, and their jobs require the selected ref to be the repository's default **branch** (resolved dynamically, including repositories that do not use `main`). Dispatching another branch or a tag skips the jobs. They do not use `pull_request_target` and are not automatic PR gates.

### Validate workflow

No OpenAI key. Runs on push and PR events and declares `permissions: contents: read`. Default `actions/checkout` depth is enough (no git history needed).

### Review workflows

- Gate-only review declares `permissions: contents: read`.
- `fetch-depth: 0` so `--since HEAD^` reviews changes in the checked-out default branch's latest commit, relative to its first parent. A root commit has no parent, so review fails without calling the model; choose a valid baseline before using review in that repository. This reviews the latest commit, not all changes since a previous dispatch.
- AI jobs use the `catlex-ai` environment; configure its key and restrictions as described below.
- Optional `OPENAI_BASE_URL` from Actions **variables** (empty → official OpenAI).
- `CATLEX_SINCE: HEAD^` is passed through `env`. Do not inline `${{ }}` into the `run:` script.

The review-only workflow does not write files. The auto-fix workflow runs install + Catlex under `contents: read` (with `persist-credentials: false`) and uploads a patch artifact when files change. Download and review the patch before applying it. A separate commit job with `contents: write` applies it and runs [stefanzweifel/git-auto-commit-action](https://github.com/stefanzweifel/git-auto-commit-action) only if you explicitly enable the `auto_commit` dispatch input (default `false`). That option accepts model output without an additional human review of the patch; use it only for trusted content and branches. Branch protection may reject the push.

### Translate-fill workflow

Same OpenAI environment as review (no `CATLEX_SINCE`). Same split: read-only install/run job, patch artifact, then an opt-in write-only commit job. Fill scans the entire corpus for missing translations; it has no `--since` limit. A manual dispatch can therefore make many paid API calls. Review corpus size and provider budgets before running it; a timeout or concurrency limit is not a spending cap.

### Auto-commit guard

The commit job requires changes, explicit `auto_commit: true`, and a manual dispatch on the default branch. The existing same-repository guard is retained as defense in depth:

```yaml
if: needs.<run-job>.outputs.changed == 'true' && inputs.auto_commit == true && (github.event_name == 'workflow_dispatch' && github.ref == format('refs/heads/{0}', github.event.repository.default_branch)) && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)
```

The run job carries both branch/event and same-repository guards too. Read and commit jobs explicitly check out the selected branch; only the commit job persists Git credentials.

## Secrets and variables

| Name              | Kind                           | Required for                        |
| ----------------- | ------------------------------ | ----------------------------------- |
| `OPENAI_API_KEY`  | `catlex-ai` environment secret | review, review-fix, translate-fill  |
| `OPENAI_BASE_URL` | variable (optional)            | same, when not using api.openai.com |

Validate and scan need neither.

Before running AI workflows, create a GitHub Actions environment named `catlex-ai`, put `OPENAI_API_KEY` there, and restrict deployments to the default branch. Configure required reviewers and prevent self-review when your GitHub plan supports those controls. Protect the default branch and changes to workflow files. Remove a repository/organization-level copy of the key accessible to this repository: those copies can still be read by other workflows. An automatically created environment without restrictions does not provide this protection. Catlex generates YAML; it does not configure GitHub settings.

These defaults reduce accidental exposure and spending; they cannot isolate repository secrets from collaborators with write access, who can change workflow files. GitHub explicitly treats writers as able to access repository secrets. Public fork PRs do not receive repository secrets by default; private-repository fork settings can permit secrets and write tokens. Same-repository PRs are not subject to that fork restriction. See [GitHub's secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use), [secret handling](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets), and [fork workflow settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

Project guidance is intentional model instruction content. Add `--guidance-file ./glossary.md` only after reviewing the glossary on a trusted branch. Prompt fences do not enforce a security boundary, and neither glossary nor locale content should be trusted merely because it came from a repository. Model output still needs review.

Existing generated workflows are unchanged until you regenerate them with an updated Catlex build and accept overwrite, or edit them manually. Generated workflows pin the Catlex release that generated them; source changes do not update already published binaries. No release is created as part of this fix.

## Installing Catlex on a runner

Generated workflows pin the CLI release that scaffolded them by setting `CATLEX_VERSION` in the step's `env`:

```bash
curl -fsSL "https://github.com/Hammertail/catlex/releases/download/v${CATLEX_VERSION}/install.sh" | bash
echo "$HOME/.local/bin" >> "$GITHUB_PATH"
```

`releases/latest` is fine for interactive human installs; production CI should keep the pin so a replaced `latest` asset cannot silently change the binary. Installers from releases that publish `SHA256SUMS` always verify the binary and fail if the manifest is missing or does not match. Installers do not check build provenance attestations; see the [README](../README.md) for the `gh attestation verify` command. Windows runners would use `install.ps1`; the generated YAML is Ubuntu-only.

## What `catlex ci` does not do

- Edit existing workflows except overwrite-after-confirm.
- Generate a scan workflow (add `catlex scan --json` yourself if you want it in CI).
- Read `catlex.config.*` when generating files; the YAML is static besides GitHub expressions.

## Generated workflow versions

Generated workflows pin Checkout 7.0.1, upload-artifact 7.0.2, download-artifact 8.0.2, and auto-commit 7.2.1 to immutable commits. They pin `CATLEX_VERSION` to the version of the CLI that generated them; edit that environment value to adopt a newer release. Read-only jobs disable credential persistence. AI jobs require manual execution on the default branch; auto-fix and fill workflows scope `contents: write` to the opt-in commit job. Each generated workflow has a timeout and concurrency control.

The repository's own CI uses Bun from `.bun-version`, TypeScript 7 for typechecking, and Fallow 3.37.0 in both local commands and the action's explicit `version` input. Formatting is a read-only check; run `bun run check:fix` locally when needed.
