export type CiWorkflowKind = "validate" | "review" | "review-fix" | "translate";

export type CiWorkflowOption = {
  kind: CiWorkflowKind;
  relativePath: string;
  title: string;
  description: string;
};

export const VALIDATE_WORKFLOW_RELATIVE_PATH = ".github/workflows/validate-messages.yml";
export const REVIEW_WORKFLOW_RELATIVE_PATH = ".github/workflows/review-translations.yml";
export const REVIEW_FIX_WORKFLOW_RELATIVE_PATH = ".github/workflows/review-fix-translations.yml";
export const TRANSLATE_WORKFLOW_RELATIVE_PATH = ".github/workflows/translate-fill.yml";

/** @deprecated Use VALIDATE_WORKFLOW_RELATIVE_PATH */
export const WORKFLOW_RELATIVE_PATH = VALIDATE_WORKFLOW_RELATIVE_PATH;

export const CI_WORKFLOW_OPTIONS: readonly CiWorkflowOption[] = [
  {
    kind: "validate",
    relativePath: VALIDATE_WORKFLOW_RELATIVE_PATH,
    title: "Validate messages",
    description:
      "Run catlex validate --no-config --json on every push and pull request (no OpenAI key).",
  },
  {
    kind: "review",
    relativePath: REVIEW_WORKFLOW_RELATIVE_PATH,
    title: "Review translations",
    description:
      "Run a manual review on the trusted default branch (requires catlex-ai environment and OPENAI_API_KEY; no auto-fix).",
  },
  {
    kind: "review-fix",
    relativePath: REVIEW_FIX_WORKFLOW_RELATIVE_PATH,
    title: "Review, auto-fix, and commit",
    description:
      "Run a manual review-fix on the trusted default branch; upload a patch, with commits opt-in (requires catlex-ai and OPENAI_API_KEY).",
  },
  {
    kind: "translate",
    relativePath: TRANSLATE_WORKFLOW_RELATIVE_PATH,
    title: "Fill missing translations and commit",
    description:
      "Run a manual fill on the trusted default branch; upload a patch, with commits opt-in (requires catlex-ai and OPENAI_API_KEY).",
  },
] as const;

export function getCiWorkflowOption(kind: CiWorkflowKind): CiWorkflowOption {
  const option = CI_WORKFLOW_OPTIONS.find((entry) => entry.kind === kind);
  if (!option) {
    throw new Error(`Unknown CI workflow kind: ${kind}`);
  }
  return option;
}
