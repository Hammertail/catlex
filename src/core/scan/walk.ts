//* Libraries imports
import ts from "typescript";

//* Local imports
import { isLikelyUserVisible, isUserFacingAttribute } from "./filters.ts";

//* Types imports
import type { HardcodedIssue } from "./types.ts";

type IssueCollector = {
  sourceFile: ts.SourceFile;
  filePath: string;
  issues: HardcodedIssue[];
};

function getJsxTagName(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const tagName = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;

  if (ts.isIdentifier(tagName)) {
    return tagName.text;
  }

  return tagName.getText();
}

function readAttributeName(attr: ts.JsxAttribute, sourceFile: ts.SourceFile): string {
  if (ts.isIdentifier(attr.name)) {
    return attr.name.text;
  }

  return attr.name.getText(sourceFile);
}

function positionOf(node: ts.Node, sourceFile: ts.SourceFile): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

  return { line: line + 1, column: character + 1 };
}

function tryStringLiteralText(expression: ts.Expression): string | undefined {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  return undefined;
}

function pushIssue(
  collector: IssueCollector,
  node: ts.Node,
  text: string,
  kind: HardcodedIssue["kind"],
  attributeName?: string,
): void {
  if (!isLikelyUserVisible(text)) {
    return;
  }

  const issue: HardcodedIssue = {
    filePath: collector.filePath,
    ...positionOf(node, collector.sourceFile),
    text: kind === "jsx-text" ? text.trim() : text,
    kind,
  };

  if (attributeName !== undefined) {
    issue.attributeName = attributeName;
  }

  collector.issues.push(issue);
}

function collectAttributeInitializer(
  collector: IssueCollector,
  name: string,
  initializer: ts.StringLiteral | ts.JsxExpression,
): void {
  if (ts.isStringLiteral(initializer)) {
    pushIssue(collector, initializer, initializer.text, "jsx-attribute", name);
    return;
  }

  if (!initializer.expression) {
    return;
  }

  const text = tryStringLiteralText(initializer.expression);
  if (text === undefined) {
    return;
  }

  pushIssue(collector, initializer.expression, text, "jsx-attribute", name);
}

function visitAttributes(collector: IssueCollector, attributes: ts.JsxAttributes): void {
  for (const property of attributes.properties) {
    if (!ts.isJsxAttribute(property)) {
      continue;
    }

    const name = readAttributeName(property, collector.sourceFile);
    if (!isUserFacingAttribute(name)) {
      continue;
    }

    const initializer = property.initializer;
    if (
      initializer === undefined ||
      (!ts.isStringLiteral(initializer) && !ts.isJsxExpression(initializer))
    ) {
      continue;
    }

    collectAttributeInitializer(collector, name, initializer);
  }
}

function visitJsxElement(collector: IssueCollector, node: ts.JsxElement): void {
  const isTrans = getJsxTagName(node) === "Trans";
  visitAttributes(collector, node.openingElement.attributes);

  if (isTrans) {
    return;
  }

  for (const child of node.children) {
    visitNode(collector, child);
  }
}

function visitJsxText(collector: IssueCollector, node: ts.JsxText): void {
  pushIssue(collector, node, node.text, "jsx-text");
}

function visitJsxExpression(collector: IssueCollector, node: ts.JsxExpression): void {
  if (!node.expression) {
    return;
  }

  const text = tryStringLiteralText(node.expression);
  if (text !== undefined) {
    pushIssue(collector, node.expression, text, "jsx-text");
  }
}

function visitNode(collector: IssueCollector, node: ts.Node): void {
  if (ts.isJsxElement(node)) {
    visitJsxElement(collector, node);
    return;
  }

  if (ts.isJsxSelfClosingElement(node)) {
    visitAttributes(collector, node.attributes);
    return;
  }

  if (ts.isJsxFragment(node)) {
    for (const child of node.children) {
      visitNode(collector, child);
    }
    return;
  }

  if (ts.isJsxText(node)) {
    visitJsxText(collector, node);
    return;
  }

  if (ts.isJsxExpression(node)) {
    // Direct string literals, then nested JSX inside the expression (e.g. `{<span>Hi</span>}`).
    visitJsxExpression(collector, node);
    ts.forEachChild(node, (child) => visitNode(collector, child));
    return;
  }

  ts.forEachChild(node, (child) => visitNode(collector, child));
}

/**
 * Walk a parsed TSX/JSX source file and collect obvious hardcoded UI strings.
 */
export function walkSourceFile(sourceFile: ts.SourceFile, filePath: string): HardcodedIssue[] {
  const collector: IssueCollector = {
    sourceFile,
    filePath,
    issues: [],
  };

  visitNode(collector, sourceFile);
  return collector.issues;
}
