//* Local imports
import packageJson from "../../../package.json" with { type: "json" };
import type { CiWorkflowKind } from "./kinds.ts";

const INSTALL_STEP = `      - name: Install catlex
        env:
          CATLEX_VERSION: "${packageJson.version}"
        run: |
          set -euo pipefail
          curl -fsSL "https://github.com/Hammertail/catlex/releases/download/v\${CATLEX_VERSION}/install.sh" | bash
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"`;

const GITHUB_EXPR = (expression: string): string => `\${{ ${expression} }}`;

const SINCE_EXPR = GITHUB_EXPR(
  "github.event_name == 'pull_request' && format('origin/{0}', github.base_ref) || 'origin/main'",
);

const SAME_REPO_COMMIT_GUARD =
  "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository";

/** Path passed as `--guidance-file` on generated translate/review workflows. */
export const CI_TRANSLATE_GUIDANCE_FILE = "./glossary.md";

function checkoutStep(options?: { fetchDepthZero?: boolean; write?: boolean }): string {
  const lines = [
    "      - name: Checkout",
    "        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    "        with:",
    `          persist-credentials: ${options?.write === true}`,
  ];
  if (options?.write) {
    lines.push(`          ref: ${GITHUB_EXPR("github.head_ref || github.ref_name")}`);
  }
  if (options?.fetchDepthZero) lines.push("          fetch-depth: 0");
  return lines.join("\n");
}

function openaiEnvBlock(options?: { since?: boolean }): string {
  const lines = [
    `          OPENAI_API_KEY: ${GITHUB_EXPR("secrets.OPENAI_API_KEY")}`,
    `          OPENAI_BASE_URL: ${GITHUB_EXPR("vars.OPENAI_BASE_URL")}`,
  ];
  if (options?.since) {
    lines.push(`          CATLEX_SINCE: ${SINCE_EXPR}`);
  }

  return `        env:
${lines.join("\n")}`;
}

function autoCommitStep(commitMessage: string): string {
  return `      - name: Commit changes
        if: ${SAME_REPO_COMMIT_GUARD}
        uses: stefanzweifel/git-auto-commit-action@d0b01107b5db882071f96de5dd4b54961ea93f4c # v7.2.1
        with:
          commit_message: ${JSON.stringify(commitMessage)}`;
}

export function generateValidateMessagesWorkflow(): string {
  return `name: Validate messages

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${GITHUB_EXPR("github.workflow")}-${GITHUB_EXPR("github.ref")}
  cancel-in-progress: true

jobs:
  validate-messages:
    name: Validate translation messages
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
${checkoutStep()}

${INSTALL_STEP}

      - name: Validate translations
        run: catlex validate --no-config --json
`;
}

export function generateReviewTranslationsWorkflow(): string {
  return `name: Review translations

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${GITHUB_EXPR("github.workflow")}-${GITHUB_EXPR("github.ref")}
  cancel-in-progress: true

jobs:
  review-translations:
    if: ${SAME_REPO_COMMIT_GUARD}
    name: Review translation quality
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
${checkoutStep({ fetchDepthZero: true })}

${INSTALL_STEP}

      - name: Review translations
        run: catlex translate review --no-config --since "$CATLEX_SINCE" --json --guidance-file ${CI_TRANSLATE_GUIDANCE_FILE}
${openaiEnvBlock({ since: true })}
`;
}

export function generateReviewFixTranslationsWorkflow(): string {
  return `name: Review and fix translations

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${GITHUB_EXPR("github.workflow")}-${GITHUB_EXPR("github.ref")}
  cancel-in-progress: true


jobs:
  review-fix-translations:
    if: ${SAME_REPO_COMMIT_GUARD}
    permissions:
      contents: write
    name: Review, fix, and commit translations
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
${checkoutStep({ fetchDepthZero: true, write: true })}

${INSTALL_STEP}

      - name: Review and auto-fix translations
        run: catlex translate review --no-config --since "$CATLEX_SINCE" --auto-fix --yes --json --guidance-file ${CI_TRANSLATE_GUIDANCE_FILE}
${openaiEnvBlock({ since: true })}

${autoCommitStep("chore: apply catlex translation review fixes")}
`;
}

export function generateTranslateFillWorkflow(): string {
  return `name: Fill missing translations

on:
  push:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${GITHUB_EXPR("github.workflow")}-${GITHUB_EXPR("github.ref")}
  cancel-in-progress: true


jobs:
  translate-fill:
    if: ${SAME_REPO_COMMIT_GUARD}
    permissions:
      contents: write
    name: Fill missing translations and commit
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
${checkoutStep({ write: true })}

${INSTALL_STEP}

      - name: Fill missing translations
        run: catlex translate --no-config --yes --json --guidance-file ${CI_TRANSLATE_GUIDANCE_FILE}
${openaiEnvBlock()}

${autoCommitStep("chore: fill missing translations with catlex")}
`;
}

export function generateWorkflow(kind: CiWorkflowKind): string {
  switch (kind) {
    case "validate":
      return generateValidateMessagesWorkflow();
    case "review":
      return generateReviewTranslationsWorkflow();
    case "review-fix":
      return generateReviewFixTranslationsWorkflow();
    case "translate":
      return generateTranslateFillWorkflow();
  }
}
