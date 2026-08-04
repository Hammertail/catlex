//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import {
  generateReviewFixTranslationsWorkflow,
  generateReviewTranslationsWorkflow,
  generateTranslateFillWorkflow,
  generateValidateMessagesWorkflow,
  generateWorkflow,
} from "../../../src/core/ci/workflows.ts";
import { CI_WORKFLOW_OPTIONS } from "../../../src/core/ci/kinds.ts";

const INSTALL_URL = "https://github.com/Hammertail/catlex/releases/latest/download/install.sh";
const SINCE_EXPR =
  "${{" +
  " github.event_name == 'pull_request' && format('origin/{0}', github.base_ref) || 'origin/main' }}";
const OPENAI_SECRET_LINE = "OPENAI_API_KEY: ${{" + " secrets.OPENAI_API_KEY }}";
const SAME_REPO_COMMIT_GUARD =
  "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository";

/** Inline `run:` lines must not embed GitHub expressions (script-injection risk). */
function assertNoGithubExpressionsInRunScripts(yaml: string): void {
  for (const line of yaml.split("\n")) {
    if (!line.includes("run:") || line.trimEnd().endsWith("|")) {
      continue;
    }
    expect(line).not.toContain("${{");
  }
}

describe("generateValidateMessagesWorkflow", () => {
  it("includes checkout, binary install via GITHUB_PATH, and validate --json", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).toContain("name: Validate messages");
    expect(yaml).toContain("actions/checkout@v4");
    expect(yaml).toContain(INSTALL_URL);
    expect(yaml).toContain("set -euo pipefail");
    expect(yaml).toContain('echo "$HOME/.local/bin" >> "$GITHUB_PATH"');
    expect(yaml).toContain("catlex validate --json");
  });

  it("does not set up Bun or run scan", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).not.toContain("setup-bun");
    expect(yaml).not.toContain("oven-sh");
    expect(yaml).not.toContain("catlex scan");
  });
});

describe("generateReviewTranslationsWorkflow", () => {
  it("reviews changed keys with --since and OpenAI secret", () => {
    const yaml = generateReviewTranslationsWorkflow();

    expect(yaml).toContain("name: Review translations");
    expect(yaml).toContain("fetch-depth: 0");
    expect(yaml).toContain(INSTALL_URL);
    expect(yaml).toContain('catlex translate review --since "$CATLEX_SINCE" --json');
    expect(yaml).toContain(`CATLEX_SINCE: ${SINCE_EXPR}`);
    expect(yaml).toContain(OPENAI_SECRET_LINE);
    expect(yaml).not.toContain("--auto-fix");
    expect(yaml).not.toContain("git-auto-commit-action");
  });

  it("passes the since ref through an env var instead of interpolating into the shell script", () => {
    assertNoGithubExpressionsInRunScripts(generateReviewTranslationsWorkflow());
  });
});

describe("generateReviewFixTranslationsWorkflow", () => {
  it("auto-fixes reviews and commits with write permissions", () => {
    const yaml = generateReviewFixTranslationsWorkflow();

    expect(yaml).toContain("name: Review and fix translations");
    expect(yaml).toContain("contents: write");
    expect(yaml).toContain("fetch-depth: 0");
    expect(yaml).toContain(
      'catlex translate review --since "$CATLEX_SINCE" --auto-fix --yes --json',
    );
    expect(yaml).toContain(`CATLEX_SINCE: ${SINCE_EXPR}`);
    expect(yaml).toContain(OPENAI_SECRET_LINE);
    expect(yaml).toContain("stefanzweifel/git-auto-commit-action@v5");
    expect(yaml).toContain("chore: apply catlex translation review fixes");
  });

  it("skips auto-commit for pull requests from forks", () => {
    const yaml = generateReviewFixTranslationsWorkflow();

    expect(yaml).toContain(`if: ${SAME_REPO_COMMIT_GUARD}`);
    expect(yaml.indexOf(`if: ${SAME_REPO_COMMIT_GUARD}`)).toBeLessThan(
      yaml.indexOf("stefanzweifel/git-auto-commit-action@v5"),
    );
  });

  it("passes the since ref through an env var instead of interpolating into the shell script", () => {
    assertNoGithubExpressionsInRunScripts(generateReviewFixTranslationsWorkflow());
  });
});

describe("generateTranslateFillWorkflow", () => {
  it("fills missing keys and commits with write permissions", () => {
    const yaml = generateTranslateFillWorkflow();

    expect(yaml).toContain("name: Fill missing translations");
    expect(yaml).toContain("contents: write");
    expect(yaml).toContain("catlex translate --yes --json");
    expect(yaml).toContain(OPENAI_SECRET_LINE);
    expect(yaml).toContain("stefanzweifel/git-auto-commit-action@v5");
    expect(yaml).toContain("chore: fill missing translations with catlex");
  });

  it("skips auto-commit for pull requests from forks", () => {
    const yaml = generateTranslateFillWorkflow();

    expect(yaml).toContain(`if: ${SAME_REPO_COMMIT_GUARD}`);
    expect(yaml.indexOf(`if: ${SAME_REPO_COMMIT_GUARD}`)).toBeLessThan(
      yaml.indexOf("stefanzweifel/git-auto-commit-action@v5"),
    );
  });
});

describe("generateWorkflow", () => {
  it("dispatches to the generator for each catalog kind", () => {
    for (const option of CI_WORKFLOW_OPTIONS) {
      expect(generateWorkflow(option.kind)).toBe(
        {
          validate: generateValidateMessagesWorkflow,
          review: generateReviewTranslationsWorkflow,
          "review-fix": generateReviewFixTranslationsWorkflow,
          translate: generateTranslateFillWorkflow,
        }[option.kind](),
      );
    }
  });
});

describe("CI_WORKFLOW_OPTIONS", () => {
  it("lists four workflows with relative paths and explanations", () => {
    expect(CI_WORKFLOW_OPTIONS.map((option) => option.kind)).toEqual([
      "validate",
      "review",
      "review-fix",
      "translate",
    ]);

    for (const option of CI_WORKFLOW_OPTIONS) {
      expect(option.relativePath).toMatch(/^\.github\/workflows\/.+\.yml$/);
      expect(option.title.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });
});
