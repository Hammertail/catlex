//* Libraries imports
import ts from "typescript";

//* Local imports
import { isLikelyUserVisible, isUserFacingAttribute } from "./filters.ts";
import { walkSourceFile } from "./walk.ts";

//* Types imports
import type { HardcodedIssue } from "./types.ts";

const TEMPLATE_OR_SCRIPT_RE = /<(template|script)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const ATTRIBUTE_RE = /([:@]?[A-Za-z_][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

type TemplateStackEntry = {
  name: string;
  ignoreChildren: boolean;
};

type VueIssueCollector = {
  sourceFile: ts.SourceFile;
  filePath: string;
  issues: HardcodedIssue[];
};

function positionOf(
  sourceFile: ts.SourceFile,
  absoluteIndex: number,
): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(absoluteIndex);

  return {
    line: line + 1,
    column: character + 1,
  };
}

function addIssue(
  collector: VueIssueCollector,
  absoluteIndex: number,
  text: string,
  kind: HardcodedIssue["kind"],
  attributeName?: string,
): void {
  if (!isLikelyUserVisible(text)) {
    return;
  }

  const issue: HardcodedIssue = {
    filePath: collector.filePath,
    ...positionOf(collector.sourceFile, absoluteIndex),
    text: kind === "jsx-text" ? text.trim() : text,
    kind,
  };

  if (attributeName !== undefined) {
    issue.attributeName = attributeName;
  }

  collector.issues.push(issue);
}

function findTagEnd(content: string, startIndex: number): number {
  let quote: string | undefined;

  for (let index = startIndex; index < content.length; index += 1) {
    const character = content[index];

    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
      }

      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") {
      return index;
    }
  }

  return -1;
}

function normalizeAttributeName(name: string): string {
  if (name.startsWith("v-bind:")) {
    return name.slice("v-bind:".length);
  }

  if (name.startsWith(":")) {
    return name.slice(1);
  }

  return name;
}

function literalText(expression: string): string | undefined {
  const trimmed = expression.trim();

  if (trimmed.length < 2) {
    return undefined;
  }

  const quote = trimmed[0];
  if (quote !== '"' && quote !== "'" && quote !== "`") {
    return undefined;
  }

  if (trimmed[trimmed.length - 1] !== quote) {
    return undefined;
  }

  if (quote === "`" && trimmed.includes("${")) {
    return undefined;
  }

  return trimmed.slice(1, -1);
}

function reportInterpolation(
  collector: VueIssueCollector,
  content: string,
  absoluteBaseIndex: number,
  startIndex: number,
  endIndex: number,
): void {
  const expression = content.slice(startIndex, endIndex);
  const text = literalText(expression);

  if (text === undefined) {
    return;
  }

  const offset = expression.indexOf(text);
  addIssue(
    collector,
    absoluteBaseIndex + startIndex + (offset >= 0 ? offset : 0),
    text,
    "jsx-text",
  );
}

function reportText(
  collector: VueIssueCollector,
  content: string,
  absoluteBaseIndex: number,
  startIndex: number,
  endIndex: number,
): void {
  if (endIndex <= startIndex) {
    return;
  }

  const text = content.slice(startIndex, endIndex);
  const trimmedText = text.trim();

  if (trimmedText.length === 0) {
    return;
  }

  const leadingWhitespaceLength = text.length - text.trimStart().length;
  const issueStartIndex = absoluteBaseIndex + startIndex + leadingWhitespaceLength;

  addIssue(collector, issueStartIndex, text, "jsx-text");
}

function reportAttributes(
  collector: VueIssueCollector,
  tagContent: string,
  absoluteTagStart: number,
): void {
  ATTRIBUTE_RE.lastIndex = 0;

  for (const match of tagContent.matchAll(ATTRIBUTE_RE)) {
    const rawName = match[1];
    if (rawName === undefined) {
      continue;
    }

    const attributeName = normalizeAttributeName(rawName);

    if (!isUserFacingAttribute(attributeName)) {
      continue;
    }

    const rawValue = match[2] ?? match[3];
    if (rawValue === undefined) {
      continue;
    }

    const text = literalText(rawValue) ?? rawValue;
    const valueOffset = match[0].indexOf(rawValue);
    const absoluteIndex = absoluteTagStart + match.index + (valueOffset >= 0 ? valueOffset : 0);

    addIssue(collector, absoluteIndex, text, "jsx-attribute", attributeName);
  }
}

function isIgnoredContext(stack: TemplateStackEntry[]): boolean {
  return stack.some((entry) => entry.ignoreChildren);
}

function skipHtmlComment(content: string, cursor: number): number {
  const commentEnd = content.indexOf("-->", cursor + 4);
  return commentEnd === -1 ? content.length : commentEnd + 3;
}

/** Returns the next cursor, or `undefined` when the interpolation is unclosed. */
function consumeInterpolation(
  collector: VueIssueCollector,
  content: string,
  absoluteStartIndex: number,
  cursor: number,
  inIgnoredContext: boolean,
): number | undefined {
  const interpolationEnd = content.indexOf("}}", cursor + 2);
  if (interpolationEnd === -1) {
    return undefined;
  }

  if (!inIgnoredContext) {
    reportInterpolation(collector, content, absoluteStartIndex, cursor + 2, interpolationEnd);
  }

  return interpolationEnd + 2;
}

function handleClosingTag(stack: TemplateStackEntry[], trimmedMarkup: string): void {
  const closingNameMatch = /^\/\s*([A-Za-z][\w.-]*)/.exec(trimmedMarkup);
  const closingName = closingNameMatch?.[1];

  if (closingName === undefined) {
    return;
  }

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry?.name === closingName) {
      break;
    }
  }
}

function handleOpeningTag(
  collector: VueIssueCollector,
  content: string,
  absoluteStartIndex: number,
  cursor: number,
  tagEnd: number,
  tagMarkup: string,
  trimmedMarkup: string,
  stack: TemplateStackEntry[],
): void {
  const nameMatch = /^([A-Za-z][\w.-]*)/.exec(trimmedMarkup);
  if (nameMatch === null) {
    return;
  }

  const tagName = nameMatch[1];
  if (tagName === undefined) {
    return;
  }

  const tagNameOffset = tagMarkup.indexOf(tagName);
  const tagStart = absoluteStartIndex + cursor;
  const tagContent = tagMarkup.slice((tagNameOffset >= 0 ? tagNameOffset : 0) + tagName.length);

  reportAttributes(collector, tagContent, tagStart);

  const selfClosing = /\/>\s*$/.test(content.slice(cursor, tagEnd + 1));
  if (!selfClosing) {
    stack.push({ name: tagName, ignoreChildren: tagName === "Trans" });
  }
}

/** Returns the next cursor, or `undefined` when the tag is unclosed. */
function consumeTag(
  collector: VueIssueCollector,
  content: string,
  absoluteStartIndex: number,
  cursor: number,
  stack: TemplateStackEntry[],
): number | undefined {
  const tagEnd = findTagEnd(content, cursor + 1);
  if (tagEnd === -1) {
    return undefined;
  }

  const tagMarkup = content.slice(cursor + 1, tagEnd);
  const trimmedMarkup = tagMarkup.trimStart();

  if (trimmedMarkup.startsWith("/")) {
    handleClosingTag(stack, trimmedMarkup);
  } else {
    handleOpeningTag(
      collector,
      content,
      absoluteStartIndex,
      cursor,
      tagEnd,
      tagMarkup,
      trimmedMarkup,
      stack,
    );
  }

  return tagEnd + 1;
}

function nextTemplateBoundary(content: string, cursor: number): number {
  const nextTag = content.indexOf("<", cursor);
  const nextInterpolation = content.indexOf("{{", cursor);
  const nextBoundaryCandidates = [nextTag, nextInterpolation].filter((value) => value !== -1);

  if (nextBoundaryCandidates.length === 0) {
    return content.length;
  }

  return Math.min(...nextBoundaryCandidates);
}

function consumeTextRun(
  collector: VueIssueCollector,
  content: string,
  absoluteStartIndex: number,
  cursor: number,
  nextBoundary: number,
): void {
  let textCursor = cursor;

  while (textCursor < nextBoundary) {
    const interpolationStart = content.indexOf("{{", textCursor);
    const textEnd =
      interpolationStart !== -1 && interpolationStart < nextBoundary
        ? interpolationStart
        : nextBoundary;

    reportText(collector, content, absoluteStartIndex, textCursor, textEnd);

    if (textEnd === nextBoundary) {
      break;
    }

    const interpolationEnd = content.indexOf("}}", interpolationStart + 2);
    if (interpolationEnd === -1 || interpolationEnd > nextBoundary) {
      break;
    }

    reportInterpolation(
      collector,
      content,
      absoluteStartIndex,
      interpolationStart + 2,
      interpolationEnd,
    );
    textCursor = interpolationEnd + 2;
  }
}

function scanTemplateContent(
  collector: VueIssueCollector,
  content: string,
  absoluteStartIndex: number,
): void {
  const stack: TemplateStackEntry[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const inIgnoredContext = isIgnoredContext(stack);

    if (content.startsWith("<!--", cursor)) {
      cursor = skipHtmlComment(content, cursor);
      continue;
    }

    if (content.startsWith("{{", cursor)) {
      const nextCursor = consumeInterpolation(
        collector,
        content,
        absoluteStartIndex,
        cursor,
        inIgnoredContext,
      );
      if (nextCursor === undefined) {
        break;
      }

      cursor = nextCursor;
      continue;
    }

    if (content[cursor] === "<") {
      const nextCursor = consumeTag(collector, content, absoluteStartIndex, cursor, stack);
      if (nextCursor === undefined) {
        break;
      }

      cursor = nextCursor;
      continue;
    }

    const nextBoundary = nextTemplateBoundary(content, cursor);

    if (!inIgnoredContext) {
      consumeTextRun(collector, content, absoluteStartIndex, cursor, nextBoundary);
    }

    cursor = nextBoundary;
  }
}

function remapIssues(
  sourceFile: ts.SourceFile,
  filePath: string,
  blockSourceFile: ts.SourceFile,
  blockStartIndex: number,
  issues: HardcodedIssue[],
): HardcodedIssue[] {
  return issues.map((issue) => {
    const relativePosition = ts.getPositionOfLineAndCharacter(
      blockSourceFile,
      issue.line - 1,
      issue.column - 1,
    );
    const { line, column } = positionOf(sourceFile, blockStartIndex + relativePosition);

    return {
      ...issue,
      filePath,
      line,
      column,
    };
  });
}

function scanScriptBlock(
  collector: VueIssueCollector,
  filePath: string,
  blockContent: string,
  contentStartIndex: number,
): void {
  const blockFile = ts.createSourceFile(
    filePath,
    blockContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const scriptIssues = walkSourceFile(blockFile, filePath);
  const remappedIssues = remapIssues(
    collector.sourceFile,
    filePath,
    blockFile,
    contentStartIndex,
    scriptIssues,
  );
  collector.issues.push(...remappedIssues);
}

export function scanVueFile(filePath: string, content: string): HardcodedIssue[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const collector: VueIssueCollector = {
    sourceFile,
    filePath,
    issues: [],
  };

  for (const match of content.matchAll(TEMPLATE_OR_SCRIPT_RE)) {
    const blockType = match[1];
    const openingTag = match[0].slice(0, match[0].indexOf(">") + 1);
    const contentStartIndex = (match.index ?? 0) + openingTag.length;
    const blockContent = match[3];

    if (blockContent === undefined) {
      continue;
    }

    if (blockType === "template") {
      scanTemplateContent(collector, blockContent, contentStartIndex);
      continue;
    }

    scanScriptBlock(collector, filePath, blockContent, contentStartIndex);
  }

  return collector.issues;
}
