# Library API

The compiled CLI is the usual entry point. The same core is also a TypeScript module (`"exports": { ".": "./src/index.ts" }`) for Bun scripts, tests, or a custom wrapper.

The package is `"private": true` (not published to npm). Depend on a git URL, a path, or copy the source. Imports below assume the package name `catlex`.

Keep I/O and validation in this API; do not reimplement flattening or compare logic in your app.

## Validate

```ts
import { validateTranslations, hasFailingIssues } from "catlex";

const result = await validateTranslations({
  cwd: process.cwd(),
  messagesDir: "messages",
  baseLocale: "en",
  strictExtra: false,
  noConfig: true,
});

if (hasFailingIssues(result.issues, false)) {
  process.exitCode = 1;
}
```

See [Validate](./validate.md) and [Message files](./message-files.md).

## Scan

```ts
import { scanHardcoded, isLikelyUserVisible, USER_FACING_ATTRS } from "catlex";

const result = await scanHardcoded("./app");
console.log(result.issues, result.errors);
```

`scanHardcoded` takes an absolute or relative root directory (resolved). It does not read Catlex config. See [Source scan](./scan.md).

## Translate

Inject a `translateLocale` function (tests, a non-OpenAI backend) or use the OpenAI helper:

```ts
import {
  assertOpenAiApiKey,
  createOpenAiTranslator,
  translateMissingKeys,
} from "catlex";

assertOpenAiApiKey();

const result = await translateMissingKeys({
  cwd: process.cwd(),
  noConfig: true,
  dryRun: false,
  skipWrite: false,
  concurrency: 4,
  translateLocale: createOpenAiTranslator({ model: "gpt-5.4-mini" }),
});
```

`dryRun: true` never calls `translateLocale`. `skipWrite: true` calls the model but does not touch disk (the CLI uses this between the two prompts). See [Translate](./translate.md).

## Review

```ts
import {
  createOpenAiReviewer,
  createOpenAiTranslator,
  reviewTranslations,
} from "catlex";

const result = await reviewTranslations({
  cwd: process.cwd(),
  since: "origin/main",
  autoFix: false,
  dryRun: true,
  noConfig: true,
  reviewLocale: createOpenAiReviewer({ model: "gpt-5.4-mini" }),
  translateLocale: createOpenAiTranslator({ model: "gpt-5.4-mini" }),
});
```

`translateLocale` is required only when `autoFix` is true and there are missing keys. See [Translate review](./translate-review.md).

## Config and messages

```ts
import {
  loadConfig,
  catlexConfigSchema,
  loadMessagesDir,
  splitBaseAndLocales,
  flattenMessages,
  compareFlatMessages,
} from "catlex";

const config = await loadConfig(process.cwd(), { noConfig: false });
const locales = await loadMessagesDir(`${process.cwd()}/${config.messagesDir}`);
const { base, others } = splitBaseAndLocales(locales, config.baseLocale);
```

Merge order and `--no-config` semantics: [Configuration](./configuration.md).

## CI file generation

```ts
import {
  generateValidateMessagesWorkflow,
  writeGithubWorkflows,
} from "catlex";

await writeGithubWorkflows({
  cwd: process.cwd(),
  kinds: ["validate", "review"],
});
```

Kinds: `validate` | `review` | `review-fix` | `translate`. See [CI workflows](./ci.md).

## Types

Issue and result types (`ValidationResult`, `ScanResult`, `TranslateResult`, `ReviewResult`, `CatlexConfig`, …) are exported from the same entry. Use them for `--json` consumers and wrappers rather than duplicating shapes.
