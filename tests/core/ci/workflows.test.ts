//* Libraries imports
import { describe, expect, it } from "bun:test";

//* Local imports
import packageJson from "../../../package.json" with { type: "json" };
import {
  generateReviewFixTranslationsWorkflow,
  generateReviewTranslationsWorkflow,
  generateTranslateFillWorkflow,
  generateValidateMessagesWorkflow,
  generateWorkflow,
} from "../../../src/core/ci/workflows.ts";
import { CI_WORKFLOW_OPTIONS } from "../../../src/core/ci/kinds.ts";

const PINNED_VERSION = packageJson.version;
const PINNED_INSTALL_URL = `https://github.com/Hammertail/catlex/releases/download/v\${CATLEX_VERSION}/install.sh`;
const LATEST_INSTALL_URL =
  "https://github.com/Hammertail/catlex/releases/latest/download/install.sh";
const CHECKOUT_ACTION = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1";
const UPLOAD_ARTIFACT_ACTION =
  "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2";
const DOWNLOAD_ARTIFACT_ACTION =
  "actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2";
const AUTO_COMMIT_ACTION =
  "stefanzweifel/git-auto-commit-action@d0b01107b5db882071f96de5dd4b54961ea93f4c # v7.2.1";
const SINCE_EXPR =
  "${{" +
  " github.event_name == 'pull_request' && format('origin/{0}', github.base_ref) || 'origin/main' }}";
const OPENAI_SECRET_LINE = "OPENAI_API_KEY: ${{" + " secrets.OPENAI_API_KEY }}";
const OPENAI_BASE_URL_LINE = "OPENAI_BASE_URL: ${{" + " vars.OPENAI_BASE_URL }}";
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

function assertPinnedInstall(yaml: string): void {
  expect(yaml).toContain(PINNED_INSTALL_URL);
  expect(yaml).toContain(`CATLEX_VERSION: "${PINNED_VERSION}"`);
  expect(yaml).not.toContain(LATEST_INSTALL_URL);
}

function assertGateOnlyPermissions(yaml: string): void {
  expect(yaml).toContain("contents: read");
  expect(yaml).not.toContain("contents: write");
}

function assertWriteJobIsolatedFromInstall(yaml: string): void {
  expect(yaml).toContain("persist-credentials: false");
  expect(yaml).toContain(UPLOAD_ARTIFACT_ACTION);
  expect(yaml).toContain(DOWNLOAD_ARTIFACT_ACTION);
  expect(yaml).toContain(AUTO_COMMIT_ACTION);

  const installIndex = yaml.indexOf("Install catlex");
  const writePermissionIndex = yaml.indexOf("contents: write");
  const writeCheckoutIndex = yaml.indexOf("persist-credentials: true");
  const commitActionIndex = yaml.indexOf(AUTO_COMMIT_ACTION);

  expect(installIndex).toBeGreaterThanOrEqual(0);
  expect(writePermissionIndex).toBeGreaterThanOrEqual(0);
  expect(commitActionIndex).toBeGreaterThanOrEqual(0);
  // Install/run job must not hold write; write belongs to the later commit job.
  expect(writePermissionIndex).toBeGreaterThan(installIndex);
  expect(writeCheckoutIndex).toBeGreaterThan(writePermissionIndex);
  expect(commitActionIndex).toBeGreaterThan(writePermissionIndex);
}

describe("generateValidateMessagesWorkflow", () => {
  it("includes checkout, binary install via GITHUB_PATH, and validate --json", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).toContain("name: Validate messages");
    expect(yaml).toContain(CHECKOUT_ACTION);
    assertPinnedInstall(yaml);
    expect(yaml).toContain("set -euo pipefail");
    expect(yaml).toContain('echo "$HOME/.local/bin" >> "$GITHUB_PATH"');
    expect(yaml).toContain("catlex validate --no-config --json");
  });

  it("pins Catlex to the CLI package version instead of releases/latest", () => {
    assertPinnedInstall(generateValidateMessagesWorkflow());
  });

  it("declares contents: read so the validate job does not inherit write", () => {
    assertGateOnlyPermissions(generateValidateMessagesWorkflow());
  });

  it("does not set up Bun or run scan", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).not.toContain("setup-bun");
    expect(yaml).not.toContain("oven-sh");
    expect(yaml).not.toContain("catlex scan");
  });

  it("disables project config execution in CI", () => {
    const yaml = generateValidateMessagesWorkflow();

    expect(yaml).toContain("--no-config");
  });
});

describe("generateReviewTranslationsWorkflow", () => {
  it("reviews changed keys with --since and OpenAI secret", () => {
    const yaml = generateReviewTranslationsWorkflow();

    expect(yaml).toContain("name: Review translations");
    expect(yaml).toContain("fetch-depth: 0");
    assertPinnedInstall(yaml);
    expect(yaml).toContain(
      'catlex translate review --no-config --since "$CATLEX_SINCE" --json --guidance-file ./glossary.md',
    );
    expect(yaml).toContain(`CATLEX_SINCE: ${SINCE_EXPR}`);
    expect(yaml).toContain(OPENAI_SECRET_LINE);
    expect(yaml).toContain(OPENAI_BASE_URL_LINE);
    expect(yaml).not.toContain("--auto-fix");
    expect(yaml).not.toContain("git-auto-commit-action");
  });

  it("pins Catlex to the CLI package version instead of releases/latest", () => {
    assertPinnedInstall(generateReviewTranslationsWorkflow());
  });

  it("declares contents: read so the review gate does not inherit write", () => {
    assertGateOnlyPermissions(generateReviewTranslationsWorkflow());
  });

  it("passes the since ref through an env var instead of interpolating into the shell script", () => {
    assertNoGithubExpressionsInRunScripts(generateReviewTranslationsWorkflow());
  });
});

describe("generateReviewFixTranslationsWorkflow", () => {
  it("auto-fixes reviews and commits with write permissions isolated from install", () => {
    const yaml = generateReviewFixTranslationsWorkflow();

    expect(yaml).toContain("name: Review and fix translations");
    assertPinnedInstall(yaml);
    expect(yaml).toContain("fetch-depth: 0");
    expect(yaml).toContain(
      'catlex translate review --no-config --since "$CATLEX_SINCE" --auto-fix --yes --json --guidance-file ./glossary.md',
    );
    expect(yaml).toContain(`CATLEX_SINCE: ${SINCE_EXPR}`);
    expect(yaml).toContain(OPENAI_SECRET_LINE);
    expect(yaml).toContain(OPENAI_BASE_URL_LINE);
    expect(yaml).toContain("chore: apply catlex translation review fixes");
    assertWriteJobIsolatedFromInstall(yaml);
  });

  it("runs install and catlex under contents: read before the write commit job", () => {
    const yaml = generateReviewFixTranslationsWorkflow();
    const installIndex = yaml.indexOf("Install catlex");
    const readBeforeWrite = yaml.slice(0, yaml.indexOf("contents: write"));

    expect(readBeforeWrite).toContain("contents: read");
    expect(installIndex).toBeLessThan(yaml.indexOf("contents: write"));
  });

  it("skips auto-commit for pull requests from forks", () => {
    const yaml = generateReviewFixTranslationsWorkflow();

    expect(yaml).toContain(`if: ${SAME_REPO_COMMIT_GUARD}`);
    expect(yaml.indexOf(`&& (${SAME_REPO_COMMIT_GUARD})`)).toBeGreaterThan(-1);
    expect(yaml.indexOf(`&& (${SAME_REPO_COMMIT_GUARD})`)).toBeLessThan(
      yaml.indexOf(AUTO_COMMIT_ACTION),
    );
  });

  it("passes the since ref through an env var instead of interpolating into the shell script", () => {
    assertNoGithubExpressionsInRunScripts(generateReviewFixTranslationsWorkflow());
  });
});

describe("generateTranslateFillWorkflow", () => {
  it("fills missing keys and commits with write permissions isolated from install", () => {
    const yaml = generateTranslateFillWorkflow();

    expect(yaml).toContain("name: Fill missing translations");
    assertPinnedInstall(yaml);
    expect(yaml).toContain(
      "catlex translate --no-config --yes --json --guidance-file ./glossary.md",
    );
    expect(yaml).toContain(OPENAI_SECRET_LINE);
    expect(yaml).toContain(OPENAI_BASE_URL_LINE);
    expect(yaml).toContain("chore: fill missing translations with catlex");
    assertWriteJobIsolatedFromInstall(yaml);
  });

  it("runs install and catlex under contents: read before the write commit job", () => {
    const yaml = generateTranslateFillWorkflow();
    const installIndex = yaml.indexOf("Install catlex");
    const readBeforeWrite = yaml.slice(0, yaml.indexOf("contents: write"));

    expect(readBeforeWrite).toContain("contents: read");
    expect(installIndex).toBeLessThan(yaml.indexOf("contents: write"));
  });

  it("skips auto-commit for pull requests from forks", () => {
    const yaml = generateTranslateFillWorkflow();

    expect(yaml).toContain(`if: ${SAME_REPO_COMMIT_GUARD}`);
    expect(yaml.indexOf(`&& (${SAME_REPO_COMMIT_GUARD})`)).toBeGreaterThan(-1);
    expect(yaml.indexOf(`&& (${SAME_REPO_COMMIT_GUARD})`)).toBeLessThan(
      yaml.indexOf(AUTO_COMMIT_ACTION),
    );
  });
});

describe("generated CI workflows", () => {
  it("never installs Catlex from releases/latest", () => {
    const workflows = [
      generateValidateMessagesWorkflow(),
      generateReviewTranslationsWorkflow(),
      generateReviewFixTranslationsWorkflow(),
      generateTranslateFillWorkflow(),
    ];

    for (const yaml of workflows) {
      assertPinnedInstall(yaml);
    }
  });

  it("generates valid YAML for every workflow, including commit messages", () => {
    for (const option of CI_WORKFLOW_OPTIONS) {
      expect(() => Bun.YAML.parse(generateWorkflow(option.kind))).not.toThrow();
    }
  });

  it("pins every action to a full commit SHA", () => {
    for (const option of CI_WORKFLOW_OPTIONS) {
      const usesLines = generateWorkflow(option.kind)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("uses:"));

      expect(usesLines.length).toBeGreaterThan(0);
      for (const line of usesLines) {
        expect(line).toMatch(/^uses: [^\s@]+@[0-9a-f]{40} # v\d/);
      }
    }
  });

  it("checks out the same ref in the read job and the commit job so the patch applies", () => {
    const headRefLine = "ref: ${{" + " github.head_ref || github.ref_name }}";

    for (const yaml of [generateReviewFixTranslationsWorkflow(), generateTranslateFillWorkflow()]) {
      expect(yaml.split(headRefLine).length - 1).toBe(2);
    }
  });

  it("runs every workflow command with --no-config", () => {
    const workflows = [
      generateValidateMessagesWorkflow(),
      generateReviewTranslationsWorkflow(),
      generateReviewFixTranslationsWorkflow(),
      generateTranslateFillWorkflow(),
    ];

    for (const yaml of workflows) {
      const runLines = yaml
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("run: catlex"));

      expect(runLines.length).toBeGreaterThan(0);
      for (const line of runLines) {
        expect(line).toContain("--no-config");
      }
    }
  });

  it("passes --guidance-file ./glossary.md on generated translate and review jobs", () => {
    const translateYaml = generateTranslateFillWorkflow();
    const reviewYaml = generateReviewTranslationsWorkflow();
    const reviewFixYaml = generateReviewFixTranslationsWorkflow();
    const validateYaml = generateValidateMessagesWorkflow();

    expect(translateYaml).toContain("--guidance-file ./glossary.md");
    expect(reviewYaml).toContain("--guidance-file ./glossary.md");
    expect(reviewFixYaml).toContain("--guidance-file ./glossary.md");
    expect(validateYaml).not.toContain("--guidance-file");
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
