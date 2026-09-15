# AI translate Markdown (alpha prototype)

`catlex translate markdown` sends **one** Markdown file to an OpenAI-compatible model and writes the translated document to `--out`.

This is a **prototype**. It does not walk folders, parse a Markdown AST, or chunk large files. Treat the output as a draft.

The command is **alpha**.

## Command

```bash
export OPENAI_API_KEY=sk-...
catlex translate markdown ./docs/en/example.md --from en --to pt-BR --out ./docs/pt-BR/example.md
catlex translate markdown ./docs/en/example.md --from en --to pt-BR --out ./docs/pt-BR/example.md --dry-run
catlex translate markdown ./docs/en/example.md --from en --to pt-BR --out ./docs/pt-BR/example.md --json
```

| Option / argument | Description |
|--------|-------------|
| `<file>` | Markdown source (`.md` or `.markdown`) |
| `--from <locale>` | Source locale |
| `--to <locale>` | Target locale |
| `--out <path>` | Write translated Markdown here (parent dirs are created; existing files are overwritten) |
| `--cwd <path>` | Project root |
| `--model <id>` | Model id (default: `gpt-5.4-mini`) |
| `--base-url <url>` | OpenAI-compatible API base URL |
| `--dry-run` | Validate the source and report paths; **no API call**, no `OPENAI_API_KEY` required, no write |
| `--no-config` | Ignore `catlex.config.*` |
| `--json` | JSON on stdout |
| `--guidance <text>` | Extra project guidance appended to the model prompt |
| `--guidance-file <path>` | Read extra project guidance from a file inside `--cwd` (absolute only if still under `--cwd`; symlinks refused) |

`--from`, `--to`, and `--out` are required. `--from` does not default to config `baseLocale`.

## How it works

1. Resolve `<file>` and `--out` inside `--cwd`. Paths that escape the working directory or are symbolic links are refused.
2. Read the source as UTF-8. The file must exist, be a regular file, and stay within **64 KiB**.
3. `--dry-run` stops here and prints source/target/out plus size.
4. Otherwise the whole file is sent in one model call. The model must call the `submitMarkdownTranslation` tool with the full translated document. Free-form chat without the tool is an error.
5. Write `--out` (create missing parent directories; overwrite if the file already exists). There is no interactive confirm.

The source is wrapped in `<source_text>` and treated as untrusted data. Optional project **guidance** uses the same sources and `<project_guidance>` fence as [Translate](./translate.md).

The prompt asks the model to preserve Markdown structure, leave code / URLs / HTML tags untranslated, and keep frontmatter keys while translating string copy.

Folder-wide translation, AST extraction, and chunking are out of scope for this prototype.

Requires `OPENAI_API_KEY` except `--dry-run`. See [Configuration](./configuration.md) for OpenAI-compatible providers.
