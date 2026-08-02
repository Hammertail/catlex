# Hardcoded JSX/TSX/Vue SFC scan prototype

Status notes for the experimental source scanner that finds obvious user-visible strings which should go through [next-intl](https://next-intl.dev/) instead of being hardcoded in JSX/TSX or Vue SFCs.

The scanner ships as **`catlex scan` (alpha)** with Ink UI and `--json`. False positives and missed issues may still occur. Config options (`sourceDir`, ignore globs, `ignoreStrings`) are not wired yet.

## Motivation

`catlex validate` already compares translation JSON files (missing / extra keys across locales). That does not catch UI copy that never entered the message files at all — for example:

```tsx
<button>Save</button>
<input placeholder="Email" />
```

The scan targets those cases via `catlex scan`.

## What was built

### Layout

```text
src/core/scan/
  types.ts      # HardcodedIssue, ScanResult
  filters.ts    # isLikelyUserVisible, USER_FACING_ATTRS
  walk.ts       # TypeScript AST walk → issues
  scan.ts       # discover *.jsx / *.tsx / *.vue, parse, walk

tests/fixtures/source/hardcoded/          # valid flag / no-flag examples
tests/fixtures/source/hardcoded/discovery/ # nested dirs for ignore rules
tests/fixtures/source/hardcoded-broken/   # invalid JSX (resilience)
tests/scan/hardcoded.test.ts              # BDD coverage
```

Public exports live in [`src/index.ts`](../src/index.ts): `scanHardcoded`, `isLikelyUserVisible`, `USER_FACING_ATTRS`, and the scan types.

Fixture files under `tests/fixtures/source/hardcoded/` and `hardcoded-broken/` are excluded from fallow dead-code analysis via `ignorePatterns` in [`.fallowrc.jsonc`](../.fallowrc.jsonc) (they are loaded by path, not imported as modules).

### Algorithm (v1)

1. **Discover** — recursively collect `*.jsx` / `*.tsx` / `*.vue` under a root directory; skip `node_modules`, `dist`, `.next`, and other dot-directories.
2. **Parse** — `typescript.createSourceFile` with `ScriptKind.JSX`, `ScriptKind.TSX`, or Vue SFC template/script handling.
3. **Walk** — visit JSX nodes and classify candidates.
4. **Filter** — keep only strings that look user-visible (`isLikelyUserVisible`).
5. **Report** — emit `HardcodedIssue` with file, 1-based line/column, text, and kind.

```text
discover → parse (TS AST) → walk JSX → filter → HardcodedIssue[]
```

### Detection surface (v1)

**Flagged**

| Case | Kind | Example |
|------|------|---------|
| JSX text | `jsx-text` | `<button>Save</button>` |
| String in expression | `jsx-text` | `<span>{"Hello"}</span>` |
| User-facing attribute | `jsx-attribute` | `placeholder="Email"`, `alt`, `title`, `aria-label`, … |

User-facing attributes (`USER_FACING_ATTRS`):

- `placeholder`, `alt`, `title`
- `aria-label`, `aria-description`, `aria-placeholder`, `aria-roledescription`, `aria-valuetext`

**Not flagged**

- Translation calls such as `{t("save")}` or `{t.rich(...)}` (call expressions, not string literals)
- Non-user attributes (`className`, `id`, `href`, `src`, `type`, `name`, `data-*`, handlers)
- Whitespace-only, punctuation-only, emoji-only, or numeric-only text
- Children of `<Trans>` (subtree skipped)
- Variable / prop flow (`const label = "Save"; return <span>{label}</span>`) — deferred

### Issue shape

```ts
type HardcodedIssue = {
  filePath: string;
  line: number;
  column: number;
  text: string;
  kind: "jsx-text" | "jsx-attribute";
  attributeName?: string;
};
```

### How to try it

CLI (alpha):

```bash
catlex scan
catlex scan --dir app
catlex scan --json
```

Library:

```ts
import { scanHardcoded } from "./src/index.ts";

const result = await scanHardcoded("./app");
console.log(result.issues);
```

### Tests

```bash
bun test tests/scan/hardcoded.test.ts
bun test
```

Fixtures cover:

- Happy path text / attributes (`.tsx` and `.jsx`)
- `t()`, `t.rich`, `t.markup`, `className`, expression strings, template literals
- Remaining `USER_FACING_ATTRS` (`title`, aria-*), attribute expression form
- Noise filters, `<Trans>` (children skipped; attrs still scanned)
- Complex / messy real-world copy, nested and namespaced components
- Intentional v1 negatives (bindings, ternaries, `children` prop)
- Discovery ignore rules (`node_modules`, dot-dirs) and broken-JSX resilience

## Out of scope (by design for this prototype)

- Merging into `ValidationIssue` / the `missing-keys` validator registry
- Unused keys or “key used in source but missing from JSON”
- Auto-fix / suggested message keys
- Variable and prop tracking
- Config fields for scan roots / ignore globs / string allowlists

## Next steps

Rough priority order after the alpha CLI proves useful on real apps:

1. **Config** — extend `catlex.config.*` so scan roots and allowlists live next to message-dir settings (`sourceDir`, ignore globs, `ignoreStrings`).
2. **Issue model** — either keep scan reports separate from locale parity, or unify kinds (`missing` / `extra` / `hardcoded`) under one reporting pipeline.
3. **Key extraction** — collect `t("...")` / `useTranslations` namespaces from source and compare against the base locale JSON (missing-in-JSON / unused-in-source).
4. **Richer detection (phase B)** — track simple local bindings that end up in JSX; optionally templates and ternaries with static arms.
5. **Adoption helpers** — baselines / suppressions for large existing codebases (similar to “disable next line” patterns in other i18n CLIs).
6. **Docs** — keep this file as design history; fold deeper “Source scan” detail into the README as the feature matures.

## Related product surface today

| Command / API | Responsibility |
|---------------|----------------|
| `catlex validate` / `validateTranslations` | Locale JSON key parity |
| `catlex scan` / `scanHardcoded` (alpha) | Hardcoded UI strings in JSX/TSX/Vue SFCs |
