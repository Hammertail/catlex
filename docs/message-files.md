# Message files

Catlex treats a **messages directory** as a set of next-intl locale JSON files. Every command that talks about translations (`validate`, `translate`, `translate review`) starts here.

## Layout Catlex expects

One JSON file per locale, named `{locale}.json`, sitting **directly** in the messages directory:

```text
messages/
  en.json
  pt.json
  es.json
```

The locale id is the file stem: `pt.json` → `pt`. Nested folders such as `messages/en/common.json` are **not** loaded. Only `*.json` entries in that one directory are considered, sorted by file name.

Default directory is `messages/` relative to the project root (`--cwd`, default: process cwd). Override with `--dir` or `messagesDir` in [config](./configuration.md).

The **base locale** is the file other locales are compared against (default: `en` → `en.json`). Override with `--base` or `baseLocale`.

If the directory is missing, is not a directory, contains no JSON files, or has no `{baseLocale}.json`, Catlex fails with a load error (CLI exit `1`).

## JSON shape

Each file must be a JSON **object** (not an array or primitive). Nested objects are namespaces; everything else is a leaf.

```json
{
  "nav": {
    "home": "Home",
    "about": "About"
  },
  "welcome": "Hello, {name}!"
}
```

Catlex flattens nested objects into **dot-path keys**: `nav.home`, `nav.about`, `welcome`. Comparison, translation, and review all operate on those paths, not on the nested tree.

### What counts as a leaf

| Value | Flattened as | Notes |
|-------|----------------|-------|
| Nested object | Recursed into | Keys joined with `.` |
| String | Leaf | The only type `translate` / review will fill or judge |
| Array | Single leaf | The whole array is one path; Catlex does not walk array elements |
| Number, boolean, `null` | Leaf | Compared for presence; skipped by AI fill/review |

So this:

```json
{ "tags": ["a", "b"] }
```

is one key, `tags`, whose value is the array. A locale that omits `tags` is missing that path. A locale that has `tags` as a string is still “present” for `validate` (key exists) even though the types differ — Catlex does **not** type-check leaves.

## What validate vs translate look at

- **[Validate](./validate.md)** compares **key sets**. Values are ignored. `pt.json` can say anything for `nav.home` as long as the path exists.
- **[Translate](./translate.md)** fills paths that exist in the base as a **string** and are absent in the target. Non-string missing leaves are listed as skipped, not sent to the model.
- **[Review](./translate-review.md)** judges string pairs (base vs locale). Non-string leaves in scope are skipped.

## Writes

When Catlex writes a locale file (`translate --yes`, review `--auto-fix --yes`), it:

1. Clones the existing JSON tree.
2. Sets each accepted path on that tree (creating intermediate objects as needed).
3. Writes pretty-printed JSON (`JSON.stringify(..., null, 2)` plus a trailing newline).

It updates **existing** locale files in place. It does **not** create a new `{locale}.json` if that file is missing — there is nothing to load, so that locale never enters the comparison.

Writes are refused if the target path is outside the messages directory or is a symlink (path traversal / symlink guard).

## next-intl mapping

This matches the common next-intl layout of one file per locale. Namespaces in JSON become the dotted keys you pass to `t("nav.home")` (or `useTranslations("nav")` + `t("home")`). Catlex does not parse your `t()` calls; [scan](./scan.md) looks at hardcoded JSX, not at whether a key is used in source.
