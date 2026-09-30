# AI translate Markdown (alpha prototype)

`catlex translate markdown` sends **one** Markdown file to an OpenAI-compatible model and writes the translated document to `--out`.

`catlex translate markdown dir` walks a source directory and translates each Markdown file into **one** target locale, preserving relative paths.

This is a **prototype**. It does not parse a Markdown AST, chunk large files, or accept a glob or several locales in one `--to`. Treat the output as a draft.

The command is **alpha**.

## One file

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

### How a file is translated

1. Resolve `<file>` and `--out` inside `--cwd`. Paths that escape the working directory or are symbolic links are refused.
2. Read the source as UTF-8. The file must exist, be a regular file, and stay within **64 KiB**.
3. `--dry-run` stops here and prints source/target/out plus size.
4. Otherwise the whole file is sent in one model call. The model must call the `submitMarkdownTranslation` tool with the full translated document. Free-form chat without the tool is an error.
5. Write `--out` (create missing parent directories; overwrite if the file already exists). There is no interactive confirm.

## Directory

```bash
export OPENAI_API_KEY=sk-...
catlex translate markdown dir ./example/en --from en --to pt-BR ./example/pt-BR
catlex translate markdown dir ./example/en --from en --to pt-BR ./example/pt-BR --dry-run
catlex translate markdown dir ./example/en --from en --to pt-BR ./example/pt-BR --json
```

| Option / argument | Description |
|--------|-------------|
| `<dir>` | Source directory. Must exist, be a real directory, and stay inside `--cwd` |
| `<out>` | Output directory. Created when missing. An existing directory is written into |
| `--from <locale>` | Source locale |
| `--to <locale>` | Target locale. One locale; `pt-BR,es` is an error |
| `--cwd <path>` | Project root |
| `--model <id>` | Model id (default: `gpt-5.4-mini`) |
| `--base-url <url>` | OpenAI-compatible API base URL |
| `--dry-run` | List the files that would be translated. **No API call**, no `OPENAI_API_KEY`, no write, no directory creation |
| `--no-config` | Ignore `catlex.config.*` |
| `--json` | JSON on stdout (`sourceDir`, `outDir`, `fileCount`, and one entry per file) |
| `--guidance <text>` | Extra project guidance appended to the model prompt |
| `--guidance-file <path>` | Same path rules as the file command |

`--from` and `--to` are required. There is no `--out` flag; the output directory is the second argument.

### How a directory is translated

1. The source directory must exist. A missing directory, a path that is not a directory, a path outside `--cwd`, or a symbolic link is an error. An empty `--from` or `--to` is an error.
2. Markdown files (`.md` and `.markdown`) are listed recursively. Other files are skipped. A directory with no Markdown files is an error. Symbolic links are not followed; a Markdown file that is a symbolic link is an error.
3. Each file keeps its path relative to the source directory. `example/en/guide/setup.md` is written to `example/pt-BR/guide/setup.md`.
4. `--dry-run` stops after that list. It does not create `<out>`.
5. Otherwise each file is translated with the same single-file call, one file after another. A missing output directory (and any missing parents) is created. Files that already exist are overwritten. Extra files already in the output directory are left in place.
6. The first failed file stops the command. Files already written stay written.

The per-file limit is still **64 KiB**. Each source is wrapped in `<source_text>` and treated as untrusted data. Optional project **guidance** uses the same sources and `<project_guidance>` fence as [Translate](./translate.md).

The prompt asks the model to preserve Markdown structure, leave code / URLs / HTML tags untranslated, and keep frontmatter keys while translating string copy.

AST extraction and chunking are out of scope for this prototype.

Requires `OPENAI_API_KEY` except `--dry-run`. See [Configuration](./configuration.md) for OpenAI-compatible providers.
