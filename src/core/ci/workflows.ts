//* Local imports
import type { CiWorkflowKind } from "./kinds.ts";

const INSTALL_STEP = `      - name: Install catlex
        run: |
          set -euo pipefail
          curl -fsSL https://github.com/Hammertail/catlex/releases/latest/download/install.sh | bash
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"`;

const GITHUB_EXPR = (expression: string): string => `\${{ ${expression} }}`;

const SINCE_EXPR = GITHUB_EXPR(
  "github.event_name == 'pull_request' && format('origin/{0}', github.base_ref) || 'origin/main'",
);

const OPENAI_ENV = `        env:
          OPENAI_API_KEY: ${GITHUB_EXPR("secrets.OPENAI_API_KEY")}`;

function checkoutStep(options?: { fetchDepthZero?: boolean }): string {
  if (options?.fetchDepthZero) {
    return `      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0`;
  }

  return `      - name: Checkout
        uses: actions/checkout@v4`;
}

function autoCommitStep(commitMessage: string): string {
  return `      - name: Commit changes
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: ${commitMessage}`;
}

export function generateValidateMessagesWorkflow(): string {
  return `name: Validate messages

on:
  push:
  pull_request:

jobs:
  validate-messages:
    name: Validate translation messages
    runs-on: ubuntu-latest
    steps:
${checkoutStep()}

${INSTALL_STEP}

      - name: Validate translations
        run: catlex validate --json
`;
}

export function generateReviewTranslationsWorkflow(): string {
  return `name: Review translations

on:
  push:
  pull_request:

jobs:
  review-translations:
    name: Review translation quality
    runs-on: ubuntu-latest
    steps:
${checkoutStep({ fetchDepthZero: true })}

${INSTALL_STEP}

      - name: Review translations
        run: catlex translate review --since "${SINCE_EXPR}" --json
${OPENAI_ENV}
`;
}

export function generateReviewFixTranslationsWorkflow(): string {
  return `name: Review and fix translations

on:
  push:
  pull_request:

permissions:
  contents: write

jobs:
  review-fix-translations:
    name: Review, fix, and commit translations
    runs-on: ubuntu-latest
    steps:
${checkoutStep({ fetchDepthZero: true })}

${INSTALL_STEP}

      - name: Review and auto-fix translations
        run: catlex translate review --since "${SINCE_EXPR}" --auto-fix --yes --json
${OPENAI_ENV}

${autoCommitStep("chore: apply catlex translation review fixes")}
`;
}

export function generateTranslateFillWorkflow(): string {
  return `name: Fill missing translations

on:
  push:
  pull_request:

permissions:
  contents: write

jobs:
  translate-fill:
    name: Fill missing translations and commit
    runs-on: ubuntu-latest
    steps:
${checkoutStep()}

${INSTALL_STEP}

      - name: Fill missing translations
        run: catlex translate --yes --json
${OPENAI_ENV}

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
