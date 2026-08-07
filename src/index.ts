//* Local imports
export { loadConfig, ConfigLoadError } from "./core/config/load.ts";
export { DEFAULT_CONFIG } from "./core/config/defaults.ts";
export { catlexConfigSchema } from "./core/config/schema.ts";
export { flattenMessages } from "./core/messages/flatten.ts";
export {
  compareFlatMessages,
  compareResultToIssues,
} from "./core/messages/compare.ts";
export {
  loadMessagesDir,
  parseLocaleMessages,
  splitBaseAndLocales,
  MessagesLoadError,
} from "./core/messages/load.ts";
export { diffFlatMessages } from "./core/messages/diff-flat.ts";
export {
  assertGitRepo,
  assertRefExists,
  listFilesAtRef,
  readFileAtRef,
  resolveCurrentBranch,
  resolveRefSha,
  GitError,
} from "./core/git/show.ts";
export { runGit } from "./core/git/run.ts";
export { runValidators, getValidators } from "./core/validators/registry.ts";
export {
  validateTranslations,
  hasFailingIssues,
} from "./core/validate.ts";
export { scanHardcoded } from "./core/scan/scan.ts";
export {
  isLikelyUserVisible,
  isUserFacingAttribute,
  USER_FACING_ATTRS,
} from "./core/scan/filters.ts";
export {
  CI_WORKFLOW_OPTIONS,
  REVIEW_FIX_WORKFLOW_RELATIVE_PATH,
  REVIEW_WORKFLOW_RELATIVE_PATH,
  TRANSLATE_WORKFLOW_RELATIVE_PATH,
  VALIDATE_WORKFLOW_RELATIVE_PATH,
  WORKFLOW_RELATIVE_PATH,
  getCiWorkflowOption,
} from "./core/ci/kinds.ts";
export { resolveWorkflowPath } from "./core/ci/paths.ts";
export {
  generateReviewFixTranslationsWorkflow,
  generateReviewTranslationsWorkflow,
  generateTranslateFillWorkflow,
  generateValidateMessagesWorkflow,
  generateWorkflow,
} from "./core/ci/workflows.ts";
export { writeGithubWorkflow, writeGithubWorkflows } from "./core/ci/write.ts";
export {
  TRANSLATE_ALPHA_MESSAGE,
  REVIEW_ALPHA_MESSAGE,
} from "./core/translate/alpha.ts";
export {
  collectMissingTranslations,
  collectTranslationExamples,
} from "./core/translate/collect.ts";
export {
  DEFAULT_OPENAI_TRANSLATE_MODEL,
  MissingOpenAiApiKeyError,
  MissingSubmitTranslationsError,
  assertOpenAiApiKey,
  createOpenAiTranslator,
} from "./core/translate/openai.ts";
export {
  TRANSLATE_INSTRUCTIONS,
  buildTranslatePrompt,
} from "./core/translate/prompt.ts";
export {
  extractIcuPlaceholders,
  submitTranslationsSchema,
  validateSubmittedTranslations,
} from "./core/translate/schema.ts";
export {
  DEFAULT_TRANSLATE_CHUNK_SIZE,
  translateMissingKeys,
} from "./core/translate/translate.ts";
export { writeTranslatedReports } from "./core/translate/write-reports.ts";
export type { WriteTranslatedReportsOptions } from "./core/translate/write-reports.ts";
export { resolveReviewScope } from "./core/translate/review-scope.ts";
export {
  REVIEW_INSTRUCTIONS,
  buildReviewPrompt,
} from "./core/translate/review-prompt.ts";
export {
  submitTranslationReviewsSchema,
  validateSubmittedReviews,
} from "./core/translate/review-schema.ts";
export {
  MissingSubmitTranslationReviewsError,
  createOpenAiReviewer,
} from "./core/translate/review-openai.ts";
export {
  countReviewFixes,
  reviewTranslations,
  withReviewFixesApplied,
} from "./core/translate/review.ts";
export {
  applyTranslationsToTree,
  setPathInTree,
} from "./core/messages/unflatten.ts";
export {
  assertSafeLocaleWritePath,
  UnsafeLocaleWritePathError,
  writeLocaleMessages,
} from "./core/messages/write.ts";
export type { WriteLocaleMessagesOptions } from "./core/messages/write.ts";

export type {
  CatlexConfig,
  FlatMessages,
  LocaleMessages,
  LocaleReport,
  MessageTree,
  ValidationIssue,
  ValidationIssueKind,
  ValidationResult,
  ValidatorContext,
} from "./core/types.ts";
export type { ConfigFlags, CatlexConfigInput } from "./core/config/schema.ts";
export type { Validator } from "./core/validators/types.ts";
export type { ValidateOptions } from "./core/validate.ts";
export type {
  HardcodedIssue,
  HardcodedIssueKind,
  ScanFileError,
  ScanResult,
} from "./core/scan/types.ts";
export type { CiWorkflowKind, CiWorkflowOption } from "./core/ci/kinds.ts";
export type {
  WriteGithubWorkflowOptions,
  WriteGithubWorkflowResult,
  WriteGithubWorkflowsOptions,
} from "./core/ci/write.ts";
export type {
  CollectMissingOptions,
  CollectMissingResult,
  MissingTranslation,
  SkippedTranslation,
  TranslationExample,
} from "./core/translate/collect.ts";
export type { CreateOpenAiTranslatorOptions } from "./core/translate/openai.ts";
export type {
  BuildTranslatePromptOptions,
  PromptMissingItem,
} from "./core/translate/prompt.ts";
export type {
  PlaceholderWarning,
  SubmitTranslationsInput,
  ValidateSubmittedResult,
} from "./core/translate/schema.ts";
export type {
  LocaleTranslateReport,
  TranslateLocaleFn,
  TranslateLocaleInput,
  TranslateMissingKeysOptions,
  TranslateResult,
  TranslatedItem,
} from "./core/translate/translate.ts";
export type { TranslationPatch } from "./core/messages/unflatten.ts";
export type { ParseLocaleMessagesOptions } from "./core/messages/load.ts";
export type {
  FlatDiffAdded,
  FlatDiffModified,
  FlatDiffRemoved,
  FlatDiffResult,
} from "./core/messages/diff-flat.ts";
export type { GitRunner, GitRunResult } from "./core/git/run.ts";
export type {
  ReviewChangeSource,
  ReviewRemovedPath,
  ReviewScopeResult,
  ReviewScopeSkipped,
  ReviewSinceContext,
  ReviewTarget,
  ResolveReviewScopeOptions,
} from "./core/translate/review-scope.ts";
export type {
  BuildReviewPromptOptions,
  ReviewPromptItem,
} from "./core/translate/review-prompt.ts";
export type {
  AcceptedReview,
  SubmitTranslationReviewsInput,
  ValidateSubmittedReviewsOptions,
  ValidateSubmittedReviewsResult,
} from "./core/translate/review-schema.ts";
export type {
  CreateOpenAiReviewerOptions,
  ReviewLocaleFn,
  ReviewLocaleInput,
} from "./core/translate/review-openai.ts";
export type {
  LocaleReviewReport,
  ReviewItemResult,
  ReviewItemVerdict,
  ReviewResult,
  ReviewTranslationsOptions,
} from "./core/translate/review.ts";
