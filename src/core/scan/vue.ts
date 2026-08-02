//* Libraries imports
import ts from "typescript";

//* Local imports
import { isLikelyUserVisible, isUserFacingAttribute } from "./filters.ts";
import { walkSourceFile } from "./walk.ts";

//* Types imports
import type { HardcodedIssue } from "./types.ts";

const BLOCK_OPEN_RE = /<(template|script)\b/gi;
const ATTRIBUTE_RE = /([:@]?[A-Za-z_][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

type SfcBlock = {
  type: "template" | "script";
  content: string;
  contentStartIndex: number;
};

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
  const nameStart = tagNameOffset >= 0 ? tagNameOffset : 0;
  const tagContentOffset = nameStart + tagName.length;
  const tagContent = tagMarkup.slice(tagContentOffset);
  // tagMarkup starts after `<`, so attributes begin at cursor + 1 + tagContentOffset.
  const absoluteTagContentStart = absoluteStartIndex + cursor + 1 + tagContentOffset;

  reportAttributes(collector, tagContent, absoluteTagContentStart);

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

function findClosingTagIndex(content: string, blockType: string, fromIndex: number): number {
  const closeRe = new RegExp(`</${blockType}>`, "gi");
  closeRe.lastIndex = fromIndex;
  const match = closeRe.exec(content);
  return match?.index ?? -1;
}

function findNestedOpenIndex(content: string, blockType: string, fromIndex: number): number {
  const nestedOpenRe = new RegExp(`<${blockType}\\b`, "gi");
  nestedOpenRe.lastIndex = fromIndex;
  return nestedOpenRe.exec(content)?.index ?? -1;
}

function closeTagLength(blockType: string): number {
  return blockType.length + 3; // </name>
}

/** Advance past a nested open tag; `undefined` when the tag is unclosed. */
function consumeNestedOpen(
  content: string,
  openIndex: number,
): { searchFrom: number; increasesDepth: boolean } | undefined {
  const openTagEnd = findTagEnd(content, openIndex + 1);
  if (openTagEnd === -1) {
    return undefined;
  }

  const selfClosing = openTagEnd > 0 && content[openTagEnd - 1] === "/";
  return {
    searchFrom: openTagEnd + 1,
    increasesDepth: !selfClosing,
  };
}

/**
 * Find the index of the matching close tag for an SFC block, counting nested
 * tags of the same name. Returns -1 when the block is unclosed.
 */
function findMatchingCloseIndex(
  content: string,
  blockType: string,
  contentStartIndex: number,
): number {
  let depth = 1;
  let searchFrom = contentStartIndex;

  while (depth > 0 && searchFrom < content.length) {
    const nextOpen = findNestedOpenIndex(content, blockType, searchFrom);
    const nextClose = findClosingTagIndex(content, blockType, searchFrom);

    if (nextClose === -1) {
      return -1;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      const nested = consumeNestedOpen(content, nextOpen);
      if (nested === undefined) {
        return -1;
      }

      if (nested.increasesDepth) {
        depth += 1;
      }

      searchFrom = nested.searchFrom;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return nextClose;
    }

    searchFrom = nextClose + closeTagLength(blockType);
  }

  return -1;
}

type ParseSfcBlockResult =
  | { status: "block"; block: SfcBlock; nextIndex: number }
  | { status: "skip" }
  | { status: "stop" };

function parseSfcBlockAt(content: string, openMatch: RegExpExecArray): ParseSfcBlockResult {
  const rawType = openMatch[1];
  if (rawType === undefined) {
    return { status: "skip" };
  }

  const blockType = rawType.toLowerCase() as SfcBlock["type"];
  const openTagEnd = findTagEnd(content, openMatch.index + 1);
  if (openTagEnd === -1) {
    return { status: "stop" };
  }

  const contentStartIndex = openTagEnd + 1;
  const contentEnd = findMatchingCloseIndex(content, blockType, contentStartIndex);
  if (contentEnd === -1) {
    return { status: "stop" };
  }

  return {
    status: "block",
    block: {
      type: blockType,
      content: content.slice(contentStartIndex, contentEnd),
      contentStartIndex,
    },
    nextIndex: contentEnd + closeTagLength(blockType),
  };
}

/**
 * Extract top-level `<template>` / `<script>` SFC blocks, respecting nested
 * tags of the same name (e.g. `<template v-if>` inside the root template).
 */
function extractSfcBlocks(content: string): SfcBlock[] {
  const blocks: SfcBlock[] = [];
  const openRe = new RegExp(BLOCK_OPEN_RE.source, BLOCK_OPEN_RE.flags);

  while (true) {
    const openMatch = openRe.exec(content);
    if (openMatch === null) {
      break;
    }

    const parsed = parseSfcBlockAt(content, openMatch);
    if (parsed.status === "skip") {
      continue;
    }

    if (parsed.status === "stop") {
      break;
    }

    blocks.push(parsed.block);
    openRe.lastIndex = parsed.nextIndex;
  }

  return blocks;
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

  for (const block of extractSfcBlocks(content)) {
    if (block.type === "template") {
      scanTemplateContent(collector, block.content, block.contentStartIndex);
      continue;
    }

    scanScriptBlock(collector, filePath, block.content, block.contentStartIndex);
  }

  return collector.issues;
}
