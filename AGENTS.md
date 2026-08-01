# AGENTS.md

Guidance for AI agents and humans working on **catlex**.

## Project overview

catlex is a Bun/TypeScript CLI that validates next-intl-style translation JSON files against a base locale.

- Runtime: **Bun** only (tests, scripts, compile)
- CLI: **commander**
- Terminal UI: **Ink** + React
- Config: **zod**
- Package is `"private": true` — no npm publish flow

User-facing docs live in [README.md](README.md).

## Layout

```text
src/
  bin/catlex.ts          # CLI entry
  index.ts               # Public library exports
  cli/                   # Commander program, commands, Ink UI
  core/                  # Config, messages, validators, orchestration
tests/                   # Mirrors src/core areas
  fixtures/              # Sample message JSON
scripts/install.sh       # Unix release installer (Linux / macOS)
scripts/install.ps1      # Windows release installer
.github/workflows/       # test, build, release, fallow, biome
```

Flow: `bin` → `cli` → `core`. Keep business logic in `src/core`; keep CLI/UI in `src/cli`.

## Commands

```bash
bun install
bun test
bun run build
bun run build:all
bun run validate
bun run dev
bun run lint
bun run format
bun run check
bun run check:fix
```

Per-OS compile scripts: `build:linux:x64`, `build:linux:arm64`, `build:mac:x64`, `build:mac:arm64`, `build:windows:x64`.

After changing tests, run the affected file in isolation and the full suite:

```bash
bun test tests/path/to/file.test.ts
bun test
```

## Fallow

Codebase intelligence config lives in [`.fallowrc.jsonc`](.fallowrc.jsonc). Boundaries enforce `bin` → `cli` → `core`.

```bash
bun run fallow -- dead-code
bun run fallow:audit
bun run fallow -- audit --base main
```

CI runs `fallow audit` with `gate: new-only` via [`.github/workflows/fallow.yml`](.github/workflows/fallow.yml). A Cursor `beforeShellExecution` hook in [`.cursor/hooks.json`](.cursor/hooks.json) blocks `git commit` / `git push` when `fallow:audit` returns verdict `fail`. Do not enable fallow telemetry on the user's behalf.

## Architecture rules

- Put validation and I/O logic under `src/core`, not in React/Ink components.
- To add a validator: implement `Validator` in `src/core/validators/`, register it in `src/core/validators/registry.ts`, and add tests under `tests/`.
- Public API changes must update `src/index.ts` exports.
- Config merge order: defaults < config file < CLI flags (`src/core/config/load.ts`).
- Respect Fallow zones: `bin` may import `cli`/`core`, `cli` may import `core`, `core` must not import `cli` or `bin`.

## Coding conventions

- Organize imports with section comments:

  ```ts
  //* Libraries imports
  //* Local imports
  //* Types imports
  ```

- Use explicit `.ts` / `.tsx` extensions in imports.
- Use `import type` for type-only imports.
- Do not destructure props in React component signatures (e.g. `function Report(props) { ... }`).
- Every button should have `id` and `type`.
- Prefer padding over margin in styles.
- Tests use BDD-style `describe` / `it` with behavior-focused names.
- All identifiers, comments, and documentation must be in English.
- TypeScript is strict (`noUncheckedIndexedAccess`, `noImplicitOverride`).

## Do not

- Invent an npm publish workflow while the package remains `"private": true`.
- Let the CLI version in `src/cli/program.ts` drift from `package.json` (the release workflow updates both).
- Add eslint or prettier; use Biome (`biome.json`) for lint and format.

## Releases

Releases are created manually with `workflow_dispatch` on `main`. Do not cut a release unless the user asks.

The release workflow cross-compiles and publishes:

- `catlex-linux-x64`, `catlex-linux-arm64`
- `catlex-darwin-x64`, `catlex-darwin-arm64`
- `catlex-windows-x64.exe`
- `install.sh` (Linux / macOS), `install.ps1` (Windows)

---

<!-- fallow:setup-hooks:start -->
## Fallow local gate

Before any `git commit` or `git push`, run `fallow audit --format json --quiet --explain --gate-marker agent`. If the verdict is `fail`, fix the reported findings before retrying. Treat JSON runtime errors like `{ "error": true, ... }` as non-blocking.

Audit defaults to `gate=new-only`: only findings introduced by the current changeset affect the verdict. Inherited findings on touched files are reported under `attribution` and annotated with `introduced: false`, but do not block the commit. Set `[audit] gate = "all"` in `fallow.toml` to gate every finding in changed files.

For non-skill agents, treat the task map below as the local onboarding source: run the listed fallow command before destructive edits, before commits, and before pull request handoff.

## Fallow task map

| When the agent is about to... | Run |
|---|---|
| delete an "unused" export or file | `fallow dead-code --trace <file>:<export>` |
| delete an "unused" dependency | `fallow dead-code --trace-dependency <name>` |
| commit or open a PR | `fallow audit --base <ref>` |
| prioritize refactoring | `fallow health --hotspots --targets` |
| ask who owns code | `fallow health --ownership` |
| check untested-but-reachable code | `fallow health --coverage-gaps` |
| consolidate duplication | `fallow dupes --trace dup:<fingerprint>` |
| find feature flags | `fallow flags` |
| check which architecture rules apply to a file before changing it | `fallow guard <files>` |
| surface security candidates | `fallow security` |
| understand a finding | `fallow explain <issue-type>` |
| scope a monorepo | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |
<!-- fallow:setup-hooks:end -->

## Cursor Cloud specific instructions

Standard commands live in the `## Commands` section above (lint = `bun run check`, tests = `bun test`, build = `bun run build`, run = `bun run dev`). Runtime is Bun; it is preinstalled on the environment and `bun install` runs on startup, so no manual install is needed.

Non-obvious caveats:

- **`.gitignore` hides `src/core/messages/`.** The broad `messages` pattern (under "Hide test files") matches *any* path segment named `messages`, including the real source directory `src/core/messages/`. As currently committed this directory (`flatten.ts`, `compare.ts`, `load.ts`) is absent, so it is not tracked and never got committed. Verify with `git check-ignore -v src/core/messages/load.ts`. Any new file you create under `src/core/messages/` will be silently untracked — force-add it (`git add -f`) and/or narrow the ignore rule (e.g. `/messages/`) if you touch that area.
- **A single missing module breaks the whole CLI.** `src/bin/catlex.ts` → `src/cli/program.ts` eagerly imports every command, so `validate.ts`'s import of the missing `./messages/load.ts` makes `bun run build`, `bun run dev`, and *all* subcommands (including `scan` and `--help`) fail to load until the `src/core/messages/` files exist. Individual unaffected modules (e.g. `src/core/scan/scan.ts`, config, init-ci) still import and run in isolation.
