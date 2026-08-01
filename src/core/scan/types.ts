export type HardcodedIssueKind = "jsx-text" | "jsx-attribute";

export type HardcodedIssue = {
  filePath: string;
  line: number;
  column: number;
  text: string;
  kind: HardcodedIssueKind;
  attributeName?: string;
};

export type ScanResult = {
  rootDir: string;
  issues: HardcodedIssue[];
};
