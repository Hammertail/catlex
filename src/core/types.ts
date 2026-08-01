//* Types imports
import type { CatlexConfig } from "./config/schema.ts";

export type MessageTree = Record<string, unknown>;

export type FlatMessages = Map<string, unknown>;

export type ValidationIssueKind = "missing" | "extra";

export type ValidationIssue = {
  locale: string;
  path: string;
  kind: ValidationIssueKind;
};

export type LocaleMessages = {
  locale: string;
  filePath: string;
  tree: MessageTree;
  flat: FlatMessages;
};

export type LocaleReport = {
  locale: string;
  filePath: string;
  issues: ValidationIssue[];
};

export type ValidationResult = {
  baseLocale: string;
  messagesDir: string;
  reports: LocaleReport[];
  issues: ValidationIssue[];
};

export type ValidatorContext = {
  config: CatlexConfig;
  base: LocaleMessages;
  locales: LocaleMessages[];
  cwd: string;
};

export type { CatlexConfig };
