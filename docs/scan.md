# Source scan (alpha)

`catlex scan` walks JSX, TSX, and Vue SFCs and flags **obvious hardcoded user-visible strings** that should go through next-intl (`t()`, `<Trans>`, and so on) instead of living in the component.

This is complementary to [`validate`](./validate.md): validate catches keys that never made it into a locale file; scan catches copy that never made it into the message files at all.

The command is **alpha**. Expect false positives and missed issues. Config fields for scan roots, ignore globs, and string allowlists are **not wired yet**.

## Command

```bash
catlex scan
catlex scan --dir src
catlex scan --json
```

| Option | Description |
|--------|-------------|
| `--dir <path>` | Source root relative to `--cwd` (default: `.`) |
| `--cwd <path>` | Project root (default: current directory) |
| `--json` | Print JSON instead of the Ink report |

Scan does not load `catlex.config.*`. `--no-config` is not a scan flag.

## How it works

```text
discover *.jsx / *.tsx / *.vue
  → parse (TypeScript AST, or Vue SFC template + script)
  → walk JSX / template
  → keep strings that look user-visible
  → HardcodedIssue[]
```

### Discovery

Recursive walk from `--dir`. Files with extension `.jsx`, `.tsx`, or `.vue` are scanned.

Skipped directories:

- `node_modules`, `dist`, `.next`, `.git`
- Any directory whose name starts with `.`

There is no glob include/exclude list beyond that.

### Parse and walk

**JSX/TSX** is parsed with TypeScript (`ScriptKind.JSX` / `TSX`) and walked for JSX nodes.

**Vue SFCs** split top-level `<template>` and `<script>` blocks (nested `<template>` inside the root template is handled). The template is scanned as markup; each script block is parsed as TSX and walked with the same JSX logic. Line/column are remapped to the original `.vue` file.

If a single file throws (parse error, stack overflow on pathological nesting, I/O), that file is recorded as a `ScanFileError` and the scan **continues**. Other files’ findings are kept.

### What is flagged

| Case | Kind | Example |
|------|------|---------|
| JSX text | `jsx-text` | `<button>Save</button>` |
| String literal in a JSX expression | `jsx-text` | `<span>{"Hello"}</span>` |
| User-facing attribute (literal or `{ "…" }`) | `jsx-attribute` | `placeholder="Email"` |
| Vue template text | `jsx-text` | `<button>Save</button>` in `<template>` |
| Vue interpolation that is a bare string | `jsx-text` | `{{ "Hello" }}` |
| Vue user-facing attr, including `:attr="'…'"` / `v-bind:attr="'…'"` when the expression is a quoted literal | `jsx-attribute` | `placeholder="Email"` |

User-facing attributes (`USER_FACING_ATTRS`):

- `placeholder`, `alt`, `title`
- `aria-label`, `aria-description`, `aria-placeholder`, `aria-roledescription`, `aria-valuetext`

### What is not flagged

- Translation calls: `{t("save")}`, `{t.rich(...)}` — call expressions, not string literals in JSX children.
- Non-user attributes: `className`, `id`, `href`, `src`, `type`, `name`, `data-*`, event handlers.
- Vue bindings that are not a bare quoted string (`:placeholder="label"`, interpolations with identifiers).
- Whitespace-only, punctuation-only, emoji-only, or numeric-only text (`isLikelyUserVisible`).
- Children of `<Trans>` (the **subtree** is skipped). Attributes on `<Trans>` are still scanned.
- Variable / prop flow: `const label = "Save"; return <span>{label}</span>` — the string is not tracked into JSX.
- Template literals with substitutions (`` {`Hello ${name}`} ``).
- Ternaries, `children` props, and other non-literal expressions.

### Issue shape

```ts
type HardcodedIssue = {
  filePath: string;
  line: number;    // 1-based
  column: number;  // 1-based
  text: string;
  kind: "jsx-text" | "jsx-attribute";
  attributeName?: string;
};
```

JSX text is trimmed in the reported `text`; attribute values are not.

## Exit codes

| Code | When |
|------|------|
| `0` | No findings and no per-file scanner errors |
| `1` | At least one hardcoded string, and no file-level errors |
| `2` | One or more per-file scanner errors (findings from other files may still be in the report) |

Unexpected crashes (unreadable root, etc.) still surface as CLI exit `1` from the program wrapper.

Priority: **errors beat findings**. A scan with both issues and file errors exits `2`.

## JSON output

```json
{
  "ok": false,
  "alpha": true,
  "alphaMessage": "Alpha: this scan is experimental. False positives and missed issues may occur.",
  "rootDir": "/abs/path/src",
  "issues": [
    {
      "filePath": "/abs/path/src/Button.tsx",
      "line": 12,
      "column": 10,
      "text": "Save",
      "kind": "jsx-text"
    }
  ],
  "errors": []
}
```

`ok` is `true` only when both `issues` and `errors` are empty.

## Practical use

Run it on `app/`, `src/`, or whatever holds UI — not on the whole repo if you have generated Vue/JSX that blows the walker.

```bash
catlex scan --dir app --json
```

Treat findings as a to-do list, not as a perfect linter. Large existing codebases will be noisy until allowlists exist.

## What it does not do

- Compare `t("…")` keys against JSON (missing-in-JSON / unused-in-source).
- Auto-fix or suggest message keys.
- Honor `catlex.config.*` scan settings (none are implemented).
- Scan `.js` / `.ts` without JSX, HTML, or Markdown.
