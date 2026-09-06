# PR #49 code review

**PR:** [Hammertail/catlex#49](https://github.com/Hammertail/catlex/pull/49)
**Issue:** [Closes #39](https://github.com/Hammertail/catlex/issues/39)
**Head:** `cursor/translate-guidance-glossary-ad9f`
**Reviewer notes:** critical review of the guidance/glossary work, plus live CLI runs against a fictional SaaS (`examples/nimbusdesk`) using the environment `OPENAI_API_KEY`.

## Verdict

The feature does what the issue asked at the **library and unit-test** layer: extra text is appended to the translate/review **user** prompt, config and CLI sources resolve with a documented precedence, and `--no-config` drops file config while still honoring `--guidance` / `--guidance-file`.

A live OpenAI run against two opposite house glossaries also showed that **custom `catlex.config.*` files are actually loaded** and that the model follows them, not only that the string is concatenated into a prompt.

I would still **not merge as-is** without addressing the CI hole and the missing config-file pointer. As written, the “natural” place for a glossary (the repo config) is the one generated GitHub Actions **never read**. That is a product bug relative to issue #39, not a nit.

---

## What landed

| Area | Change |
|------|--------|
| Config | Optional `translate.guidance` string, max 8192 chars (`src/core/config/schema.ts`) |
| Core | New `src/core/translate/guidance.ts` (`normalize` / `resolve` / `projectGuidancePromptLines`) |
| Prompts | User prompt gets a “Project guidance” block; system strings `TRANSLATE_INSTRUCTIONS` / `REVIEW_INSTRUCTIONS` gain a “follow unless it conflicts” sentence |
| CLI | `--guidance` and `--guidance-file` on `translate` and `translate review` |
| Library | Public exports in `src/index.ts` |
| Docs | README + `docs/translate.md`, `translate-review.md`, `configuration.md`, `ci.md`, `library.md` |
| Tests | Isolated coverage in guidance, prompt, config load, translate, review, CLI flag binding |

Architecture is in the right layer (`core`, not Ink). Registration and exports are complete. Precedence (`inline > file > config`) is explicit and tested.

---

## Live verification (NimbusDesk)

Fictional SaaS trees:

- `examples/nimbusdesk` — `catlex.config.json`, `messagesDir: "messages"`, glossary: keep `NimbusDesk` / `HaloSync`, `Save` → `Guardar`, `workspace` → `espaço de trabalho`, `Billing cycle` → `ciclo de faturação`
- `examples/nimbusdesk-alt` — `catlex.config.js`, `messagesDir: "locales"`, **opposite** glossary: `NimbusDesk` → `NimbusEscritório`, `Save` → `Gravar`, `workspace` → `ambiente de trabalho`, `Billing cycle` → `período de cobrança`
- `examples/nimbusdesk/catlex.config.custom.json` — extra file Catlex **cannot** load (no `--config` flag)

Runner: `bun examples/nimbusdesk/run-live-config-checks.ts` (copies into `/tmp`, never writes the committed fixtures).

### What the model actually produced

`catlex translate --yes --locale pt` with **JSON config A**:

| Key | Output |
|-----|--------|
| `billing.cycle` | `ciclo de faturação` |
| `actions.openWorkspace` | `Abrir o espaço de trabalho do NimbusDesk` |
| `billing.greeting` | `Olá {name}, bem-vindo ao NimbusDesk` |

Same command with **JS config B** (`--cwd examples/nimbusdesk-alt`):

| Key | Output |
|-----|--------|
| `billing.cycle` | `período de cobrança` |
| `actions.openWorkspace` | `Abrir o ambiente de trabalho do NimbusEscritório` |
| `billing.greeting` | `Olá {name}, bem-vindo ao NimbusEscritório` |
| `messagesDir` in JSON | `locales` |

`--no-config --guidance-file glossary.md` still produced `ciclo de faturação` and kept `NimbusDesk`.

`catlex translate review --locale pt` on the planted errors (after filling missing keys) marked all four glossary violations `wrong` and suggested the house terms:

- `actions.save` `Salvar` → `Guardar` (“For Portuguese, 'Save' should be translated as 'Guardar'.”)
- `brand.product` `Mesa Nimbus` → `NimbusDesk`
- `brand.sync` `Halo Sincronização` → `HaloSync`
- `nav.workspace` `área de trabalho` → `espaço de trabalho`

`--guidance` + `--guidance-file` together exited `1` with `Use either inline guidance or a guidance file, not both`.

`--dry-run --json` listed the four missing keys and **did not** include the resolved guidance text anywhere in the payload.

This is the strongest evidence in the review: two `--cwd` trees with opposite configs do not yield the same Portuguese. Custom config files work when you use the discovery names under `--cwd`.

---

## Findings

### 1. High — generated CI ignores the config field this PR just added

Issue #39 asked for a **project-level** glossary that lives with the repo. Generated workflows still always pass `--no-config`:

```141:142:src/core/ci/workflows.ts
      - name: Fill missing translations
        run: catlex translate --no-config --yes --json
```

Same for review and review-fix. Docs tell the user to add `--guidance-file` on the `run:` line by hand. `catlex ci` was **not** updated to emit that flag, a `glossary.md` path, or even a commented placeholder.

Consequence: a team that only sets `translate.guidance` in `catlex.config.json` gets correct local `catlex translate` and **generic** CI translations, with no warning. That is the opposite of “vocabulary that belongs with the repo.”

**Ask:** either (a) generate `--guidance-file ./glossary.md` (or read config at generation time, which today you explicitly do not), or (b) stop telling people config is the primary API while CI throws it away. A warning when `--no-config` is set and a config file containing `translate.guidance` exists would also help.

### 2. High — config cannot point at a glossary file

There is `translate.guidance` (inline string) and CLI `--guidance-file`, but **no** `translate.guidanceFile` in `catlex.config.*`.

A real glossary wants to live in `glossary.md` (diffable, no JSON escaping). Today you must either:

- paste the markdown into JSON (escaping `"` and newlines; 8192 cap), or
- remember `--guidance-file` on every invocation, including every CI `run:` line.

`--guidance-file` is the better source of truth, but it is **not** a config feature. The PR description presents config and file as equivalent; they are not. File is CLI-only.

**Ask:** add `translate.guidanceFile` resolved relative to the config file’s directory (not only `--cwd`), with the same cap after read.

### 3. High — no `--config <path>`, so “custom config file” means “rename it to `catlex.config.json` in `--cwd`”

Discovery is a fixed list of four filenames, first match wins (`json` before `js` before `mjs` before `ts`). There is no `--config`.

`examples/nimbusdesk/catlex.config.custom.json` is a live demonstration: it contains a canary sentence (“THIS FILE CANNOT BE LOADED”) and Catlex never reads it.

If the intent of this PR is “pass a custom config,” that is **not implemented**. You pass `--cwd` and hope the right basename exists. Switching glossaries in one tree requires swapping files.

This is pre-existing, but this PR is the first time config carries prompt text. The cost of the missing flag just went up.

### 4. Medium — guidance is trusted, unstructured, and unescaped in the prompt

Message values are wrapped and `</source_text>` is escaped (`src/core/translate/untrusted-text.ts`). Project guidance is interpolated raw:

```88:93:src/core/translate/guidance.ts
  return [
    "- Follow project guidance when it does not conflict with the rules above.",
    "",
    "Project guidance (additional; does not override the rules above):",
    guidance,
  ];
```

It sits **between** the Rules list and `Examples from the target locale:`. A glossary that contains `<source_text>`, a fake `Rules:` section, or `Missing keys to translate:` can reshape the rest of the user prompt. Tests **explicitly** assert that guidance is **not** wrapped in `<source_text>` (`tests/core/translate/prompt.test.ts`), so this is intentional — and still a hole.

`--guidance-file` can read any path the process can read (`path.resolve(cwd, filePath)`). In CI, a PR that only edits `glossary.md` is a prompt-injection PR. That may be acceptable for a repo-controlled file, but it is a new attack surface the untrusted-text work does not cover.

**Ask:** fence guidance in something like `<project_guidance>…</project_guidance>` and escape the closer, the same way you treat message values. Keep it trusted, but do not let it break neighboring sections.

### 5. Medium — PR text says the system prompt is untouched; it is not

`TRANSLATE_INSTRUCTIONS` and `REVIEW_INSTRUCTIONS` both gained:

> If the user prompt includes a Project guidance section, follow it unless it conflicts with these instructions.

That is a reasonable one-line addition. It is still a **system-prompt change**. Issue #39 said overwriting the system prompt was not required. The PR title/body (“without replacing the system prompt”) oversells “untouched.” Tests even lock the new sentence in.

Say “appended to the user prompt; system instructions are extended by one conflict rule” and move on.

### 6. Medium — empty / whitespace `--guidance` silently disables config

```65:67:src/core/translate/guidance.ts
  if (options.guidance !== undefined) {
    return normalizeTranslateGuidance(options.guidance);
  }
```

`guidance: "  "` is `!== undefined`, so config is **not** a fallback. The unit test names this behavior (`treats explicit empty inline guidance as unset instead of falling back to config`). A whitespace-only `--guidance-file` is the same: read, trim, `undefined`, no error.

CI or a wrapper that passes `--guidance "${GLOSSARY}"` with an empty env var will drop the repo glossary with no warning.

**Ask:** treat empty inline as “flag omitted” (fall through), and warn or error on an empty guidance file.

### 7. Medium — 8192 cap is inconsistent between config and files

- Config: Zod `.max(8192)` on the **untrimmed** string.
- CLI/file: trim, then cap.

A file whose raw UTF-8 is 8193 bytes with a trailing newline loads; the same text in `catlex.config.json` is `Invalid config`. `.length` is UTF-16 code units, not graphemes, so an emoji-heavy glossary hits the cap earlier than authors expect.

8192 is also small for a real product glossary (do-not-translate list + per-locale mandated pairs). There is no “use a file, skip the cap” path; the file is capped too.

### 8. Medium — no way to see which guidance was applied without calling the model

`--dry-run` still resolves guidance internally, then never calls the translator, and the JSON report has **no** `guidance` field. The NimbusDesk dry-run payload contains `pending` keys only.

Unit tests inject a fake `translateLocale` and inspect `input.prompt`. Users cannot. That is why this review needed a live API run to prove `--cwd` loaded the intended file.

**Ask:** include `guidanceSource: "flag" | "file" | "config" | null` (and maybe a hash or truncated preview) in translate/review JSON. A `--print-prompt` / `--debug` flag would make this testable offline.

### 9. Medium — one blob for every locale

Guidance is not keyed by target locale. The NimbusDesk JSON config sends Portuguese **and** Spanish rules into a `pt` prompt. Harmless in the live `pt` run; messy once you add `de` / `ja` and the model starts applying “Guardar” or “espaço de trabalho” to the wrong locale.

**Ask (follow-up, not merge-blocking if documented):** `translate.guidanceByLocale` or a structured glossary. At minimum, document that the string is global.

### 10. Medium — few-shot examples can contradict the glossary

`collectTranslationExamples` still attaches up to 8 existing string pairs. In NimbusDesk those pairs included `Save` → `Salvar` and `workspace` → `área de trabalho` while the glossary forbade both.

Live translate of **new** keys still followed the glossary (`espaço de trabalho`, `NimbusDesk`). That is good model behavior, not a guarantee. The prompt says both “match the tone of the examples” and “follow project guidance when it does not conflict.” Those two instructions fight.

Review did the right thing on the planted rows. Translate of missing keys is one unlucky sample away from copying a bad example.

### 11. Low — test gaps (string-in-prompt, not behavior)

Covered well:

- normalize / precedence / missing file / both flags
- prompt contains the glossary and is not wrapped as `source_text`
- config load + cap
- `translateMissingKeys` / `reviewTranslations` pass guidance through
- CLI flag binding for `--guidance` (translate) and `--guidance-file` (review)
- `--no-config` drops **config** guidance

Missing or thin:

- CLI `translate --guidance-file` (only `--guidance` is exercised in `tests/cli/commands/translate.test.ts`)
- CLI `translate review --guidance-file` and review **config** guidance (review tests use the `guidance` option only)
- `--no-config` + `--guidance-file` still applies (library + live; no CLI test)
- `--guidance` + `--guidance-file` through `createProgram().parseAsync` (core throws; no argv-level test)
- guidance containing `<source_text>` / section headers
- absolute `--guidance-file` path
- `catlex.config.js` / `.ts` carrying `translate.guidance` (only JSON in `tests/config/load.test.ts`)
- generated workflow strings still lack `--guidance-file` (no test would fail if you added the flag tomorrow, because you never asserted it)

All of the above are mock-translator tests. None of them would have caught “the model ignores the glossary.” The NimbusDesk fixture is the first behavioral check.

### 12. Low — `--guidance-file` is relative to `--cwd`, not the process cwd

Documented in `docs/configuration.md`, **not** in the Commander help string (`Read extra translation guidance from a file`). Easy to get wrong:

```bash
catlex translate --cwd examples/nimbusdesk --guidance-file examples/nimbusdesk/glossary.md
# looks for examples/nimbusdesk/examples/nimbusdesk/glossary.md
```

The live runner uses `--cwd <copy> --guidance-file glossary.md`, which is the correct pairing.

### 13. Low — `validate` JSON `messagesDir` is absolute; `translate` JSON is the config relative value

Seen in the first live run: validate reported `/tmp/.../nimbusdesk/messages` while translate reported `messages`. Pre-existing, not introduced here, but it made a naive `=== "messages"` assertion fail even though the JSON config **was** loaded. Worth aligning if anyone scripts around `--json`.

### 14. Nit — conflict rule is duplicated and slightly different

User prompt: follow guidance when it does not conflict with **the rules above** (user rules).

System prompt: follow it unless it conflicts with **these instructions** (system).

A glossary that says “do not call submitTranslations” conflicts with system; one that says “invent extra keys” does too. A glossary that says “ignore the untrusted-source rule” conflicts with both. Three places now describe priority (user rule line, section header “does not override”, system sentence). Trim to one.

### 15. Nit — README configuration cheat-sheet example still has no `translate` block

The later translate section documents `guidance`. The generic `catlex.config.json` sample near the top of `README.md` still does not. Easy miss for people who copy the first snippet.

---

## Line-level comments (for the PR discussion)

These are the comments I would leave on the diff.

### `src/core/translate/guidance.ts`

- `resolveTranslateGuidance`: empty inline should fall through to file/config, or at least not pretend the user “set” guidance.
- `readGuidanceFile`: no size check before `readFile`. 8192 after the fact is fine for a glossary; a mistaken `--guidance-file /dev/zero` or a huge binary is not. Cap bytes before decode, or `stat` first.
- `projectGuidancePromptLines`: do not append raw `guidance` as a sibling of `Rules:` / `Examples`. Fence + escape.
- Passing both sources as an error is good. Keep it.

### `src/core/config/schema.ts`

- `.max(MAX_TRANSLATE_GUIDANCE_CHARS)` should apply to the trimmed value, or document that leading/trailing space counts.
- Missing `guidanceFile` field (see finding 2).

### `src/core/translate/prompt.ts` / `review-prompt.ts`

- The extra system sentence is fine; update the PR description.
- Assert (or fence) that guidance cannot contain a raw `<source_text>` opener that swallows the examples block.

### `src/cli/program.ts`

- Help text for `--guidance-file` should say “relative to `--cwd` unless absolute.”
- Consider `--config <path>` as a follow-up; do not pretend discovery is “passing a custom file.”

### `src/cli/commands/translate.tsx` / `translate-review.tsx`

- Guidance is forwarded correctly into core. Good.
- `loadConfig` is still called twice (CLI + core). Pre-existing. Resolved guidance is not available to the CLI for display.

### `src/core/ci/workflows.ts`

- This file is the merge blocker. `--no-config` without `--guidance-file` makes `translate.guidance` fiction in Actions.

### `tests/core/translate/guidance.test.ts`

- The empty-inline test documents a footgun. Change the behavior or change the test name to `warns` / `errors` once you fix it.
- Add: empty file, absolute path, file with trailing newline at exactly 8192+1 before trim.

### `tests/cli/commands/translate.test.ts`

- Add `--guidance-file` and `--no-config --guidance-file`. Flag binding in `program.test.ts` is not the same as the command loading the file.

---

## What I would require before merge

1. **CI path for the glossary** — generated workflows must pass `--guidance-file` (or stop using `--no-config` for translate/review), or `catlex ci` must fail/warn when config contains `translate.guidance`.
2. **`translate.guidanceFile` in config** (or a documented decision that glossaries are CLI-only, and remove the “put it in catlex.config” examples from the primary docs).
3. **Fence/escape guidance** in the user prompt.
4. **JSON observability** of the resolved guidance source (even a boolean `guidanceApplied`).

Nice-to-have, not merge-blocking: `--config`, per-locale maps, empty-flag fallthrough, help-text cwd note, CLI `--guidance-file` tests.

---

## What does not need to change

- Append-to-user-prompt rather than replacing tool-calling / ICU / untrusted-source rules. That design is correct.
- Rejecting `--guidance` and `--guidance-file` together.
- `--no-config` still allowing CLI flags (confirmed live).
- Keeping API keys out of config.
- Public exports for the new helpers.
- The unit tests that exist are careful about `source_text` wrapping; they are just not sufficient as the only proof.

---

## How to re-run the live fixture

```bash
export OPENAI_API_KEY=sk-...
bun examples/nimbusdesk/run-live-config-checks.ts
```

See `examples/nimbusdesk/README.md`. The runner copies fixtures to `/tmp` so the committed dictionaries stay in the “wrong / missing” state for review.
