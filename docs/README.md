# Catlex documentation

Catlex is a Bun/TypeScript CLI for [next-intl](https://next-intl.dev/)-style translation JSON. It compares locale files against a base locale, scans JSX/TSX/Vue for hardcoded UI copy, and (alpha) proposes or reviews translations with an OpenAI-compatible API.

The [README](../README.md) is the install and command cheat sheet. These pages explain **how each feature works** so you can wire Catlex into a Next.js app or a CI pipeline without guessing.

| Page | Feature |
|------|---------|
| [Message files](./message-files.md) | How Catlex loads and flattens `en.json` / `pt.json` trees |
| [Configuration](./configuration.md) | `catlex.config.*`, merge order, `--no-config`, OpenAI settings |
| [Validate](./validate.md) | `catlex validate` — missing and extra keys |
| [Source scan](./scan.md) | `catlex scan` (alpha) — hardcoded JSX/TSX/Vue strings |
| [Translate](./translate.md) | `catlex translate` (alpha) — fill missing string keys |
| [Translate review](./translate-review.md) | `catlex translate review` (alpha) — judge and optionally fix copy |
| [CI workflows](./ci.md) | `catlex ci`, generated GitHub Actions, exit codes |
| [Library API](./library.md) | Calling the same logic from TypeScript instead of the CLI |

Install, binary names, and the one-page option tables stay in the [README](../README.md).
