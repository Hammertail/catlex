//* Libraries imports
import packageJson from "../../../package.json" with { type: "json" };

//* Local imports
import type { CiWorkflowKind } from "./kinds.ts";

/** Version pinned into generated CI install steps (matches this CLI release). */
export const CI_CATLEX_VERSION = packageJson.version;

const INSTALL_STEP = `      - name: Install catlex
        run: |
          set -euo pipefail
          curl -fsSL https://github.com/Hammertail/catlex/releases/download/v${CI_CATLEX_VERSION}/install.sh | CATLEX_VERSION=${CI_CATLEX_VERSION} CATLEX_REQUIRE_CHECKSUM=1 bash
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"`;

const GITHUB_EXPR = (expression: string): string => `\${{ ${expression} }}`;

const SINCE_EXPR = GITHUB_EXPR(
  "github.event_name == 'pull_request' && format('origin/{0}', github.base_ref) || 'origin/main'",
);

const SAME_REPO_COMMIT_GUARD =
  "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository";

/** Path passed as `--guidance-file` on generated translate/review workflows. */
export const CI_TRANSLATE_GUIDANCE_FILE = "./glossary.md";

function checkoutStep(options?: {
  fetchDepthZero?: boolean;
  persistCredentials?: boolean;
}): string {
  const withLines: string[] = [];
  if (options?.fetchDepthZero) {
    withLines.push("          fetch-depth: 0");
  }
  if (options?.persistCredentials === false) {
    withLines.push("          persist-credentials: false");
  }

  if (withLines.length === 0) {
    return `      - name: Checkout
        uses: actions/checkout@v4`;
  }

  return `      - name: Checkout
        uses: actions/checkout@v4
        with:
${withLines.join("\n")}`;
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

function packageChangesStep(outputId: string, artifactName: string): string {
  return `      - name: Package translation changes
        id: ${outputId}
        run: |
          set -euo pipefail
          if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          git add -A
          git diff --cached --binary > "\${RUNNER_TEMP}/catlex-changes.patch"
          echo "changed=true" >> "$GITHUB_OUTPUT"

      - name: Upload translation changes
        if: ${GITHUB_EXPR(`steps.${outputId}.outputs.changed == 'true'`)}
        uses: actions/upload-artifact@v4
        with:
          name: ${artifactName}
          path: \${{ runner.temp }}/catlex-changes.patch`;
}

function commitChangesJob(options: {
  jobId: string;
  jobName: string;
  needsJobId: string;
  artifactName: string;
  commitMessage: string;
}): string {
  return `  ${options.jobId}:
    name: ${options.jobName}
    needs: ${options.needsJobId}
    if: ${GITHUB_EXPR(`needs.${options.needsJobId}.outputs.changed == 'true' && (${SAME_REPO_COMMIT_GUARD})`)}
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Download translation changes
        uses: actions/download-artifact@v4
        with:
          name: ${options.artifactName}
          path: \${{ runner.temp }}/catlex-changes

      - name: Apply translation changes
        run: |
          set -euo pipefail
          git apply "\${RUNNER_TEMP}/catlex-changes/catlex-changes.patch"

      - name: Commit changes
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: ${options.commitMessage}`;
}

export function generateValidateMessagesWorkflow(): string {
  return `name: Validate messages

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  validate-messages:
    name: Validate translation messages
    runs-on: ubuntu-latest
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

jobs:
  review-translations:
    name: Review translation quality
    runs-on: ubuntu-latest
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

jobs:
  review-fix-translations:
    name: Review, fix, and prepare commit
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      changed: ${GITHUB_EXPR("steps.changes.outputs.changed")}
    steps:
${checkoutStep({ fetchDepthZero: true, persistCredentials: false })}

${INSTALL_STEP}

      - name: Review and auto-fix translations
        run: catlex translate review --no-config --since "$CATLEX_SINCE" --auto-fix --yes --json --guidance-file ${CI_TRANSLATE_GUIDANCE_FILE}
${openaiEnvBlock({ since: true })}

${packageChangesStep("changes", "catlex-review-fix-changes")}

${commitChangesJob({
  jobId: "commit-fixes",
  jobName: "Commit translation fixes",
  needsJobId: "review-fix-translations",
  artifactName: "catlex-review-fix-changes",
  commitMessage: "chore: apply catlex translation review fixes",
})}
`;
}

export function generateTranslateFillWorkflow(): string {
  return `name: Fill missing translations

on:
  push:
  pull_request:

jobs:
  translate-fill:
    name: Fill missing translations
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      changed: ${GITHUB_EXPR("steps.changes.outputs.changed")}
    steps:
${checkoutStep({ persistCredentials: false })}

${INSTALL_STEP}

      - name: Fill missing translations
        run: catlex translate --no-config --yes --json --guidance-file ${CI_TRANSLATE_GUIDANCE_FILE}
${openaiEnvBlock()}

${packageChangesStep("changes", "catlex-translate-fill-changes")}

${commitChangesJob({
  jobId: "commit-translations",
  jobName: "Commit filled translations",
  needsJobId: "translate-fill",
  artifactName: "catlex-translate-fill-changes",
  commitMessage: "chore: fill missing translations with catlex",
})}
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
