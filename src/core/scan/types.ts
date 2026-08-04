export type HardcodedIssueKind = "jsx-text" | "jsx-attribute";

export type HardcodedIssue = {
  filePath: string;
  line: number;
  column: number;
  text: string;
  kind: HardcodedIssueKind;
  attributeName?: string;
};

/** Per-file failure while scanning; the rest of the tree may still be reported. */
export type ScanFileError = {
  filePath: string;
  message: string;
};

export type ScanResult = {
  rootDir: string;
  issues: HardcodedIssue[];
  errors: ScanFileError[];
};
