import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const APP_SHELL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "components",
  "layout",
  "app-shell.tsx",
);

type ParsedSourceFile = ts.SourceFile & {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
};

function parseTsx(source: string, fileName = "app-shell.tsx"): ts.SourceFile {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  ) as ParsedSourceFile;
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const codes = [...new Set(diagnostics.map((diagnostic) => diagnostic.code))].join(", ");
    throw new Error(
      `Malformed TSX in ${fileName}: ${diagnostics.length} parse diagnostic(s) [${codes}]`,
    );
  }
  return sourceFile;
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function tagName(element: ts.JsxOpeningLikeElement): string | undefined {
  return ts.isIdentifier(element.tagName) ? element.tagName.text : undefined;
}

function classNames(element: ts.JsxOpeningLikeElement): Set<string> {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "className",
  );
  if (!attribute?.initializer || !ts.isStringLiteral(attribute.initializer)) {
    return new Set();
  }
  return new Set(attribute.initializer.text.trim().split(/\s+/u));
}

function staticAttribute(element: ts.JsxOpeningLikeElement, name: string): string | undefined {
  const attribute = element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && ts.isIdentifier(property.name) && property.name.text === name,
  );
  return attribute?.initializer && ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text
    : undefined;
}

function findAppShell(sourceFile: ts.SourceFile): ts.FunctionDeclaration {
  let result: ts.FunctionDeclaration | undefined;
  visit(sourceFile, (node) => {
    if (!result && ts.isFunctionDeclaration(node) && node.name?.text === "AppShell") {
      result = node;
    }
  });
  assert.ok(result, "AppShell function declaration is missing");
  return result;
}

function findElement(scope: ts.Node, name: string): ts.JsxElement {
  const matches: ts.JsxElement[] = [];
  visit(scope, (node) => {
    if (ts.isJsxElement(node) && tagName(node.openingElement) === name) matches.push(node);
  });
  assert.equal(matches.length, 1, `expected exactly one <${name}> in AppShell`);
  return matches[0]!;
}

function containsActionsExpression(element: ts.JsxElement): boolean {
  return element.children.some(
    (child) =>
      ts.isJsxExpression(child) &&
      child.expression !== undefined &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === "actions",
  );
}

function actionChildOrder(element: ts.JsxElement): string[] {
  const order: string[] = [];
  for (const child of element.children) {
    if (
      ts.isJsxExpression(child) &&
      child.expression !== undefined &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === "actions"
    ) {
      order.push("actions");
    } else if (ts.isJsxElement(child) && tagName(child.openingElement) === "Button") {
      order.push(staticAttribute(child.openingElement, "aria-label") ?? "Button");
    } else if (ts.isJsxSelfClosingElement(child) && tagName(child) === "UserMenu") {
      order.push("UserMenu");
    }
  }
  return order;
}

const source = readFileSync(APP_SHELL_PATH, "utf8");

test("M8.1-F1: AppShell TSX parses fail-closed", () => {
  assert.doesNotThrow(() => parseTsx(source, APP_SHELL_PATH));
  assert.throws(
    () => parseTsx('function AppShell() { return <header className="flex"', "broken.tsx"),
    /Malformed TSX/u,
  );
});

test("M8.1-F1: header stacks on mobile and restores the incumbent row at sm", () => {
  const appShell = findAppShell(parseTsx(source, APP_SHELL_PATH));
  const header = findElement(appShell, "header");
  const layout = header.children.find(
    (child): child is ts.JsxElement =>
      ts.isJsxElement(child) && tagName(child.openingElement) === "div",
  );
  assert.ok(layout, "header layout wrapper is missing");
  const classes = classNames(layout.openingElement);
  for (const token of [
    "flex",
    "flex-col",
    "sm:flex-row",
    "sm:items-center",
    "sm:justify-between",
  ]) {
    assert.ok(classes.has(token), `header layout is missing ${token}`);
  }
});

test("M8.1-F1: action row owns all controls and wraps within the mobile viewport", () => {
  const appShell = findAppShell(parseTsx(source, APP_SHELL_PATH));
  const candidates: ts.JsxElement[] = [];
  visit(appShell, (node) => {
    if (ts.isJsxElement(node) && containsActionsExpression(node)) candidates.push(node);
  });
  assert.equal(candidates.length, 1, "expected one action container owning {actions}");
  const actionRow = candidates[0]!;
  assert.deepEqual(actionChildOrder(actionRow), ["actions", "Ubah tema", "Notifikasi", "UserMenu"]);

  const classes = classNames(actionRow.openingElement);
  for (const token of [
    "flex",
    "w-full",
    "min-w-0",
    "max-w-full",
    "flex-wrap",
    "justify-end",
    "sm:shrink-0",
  ]) {
    assert.ok(classes.has(token), `action row is missing ${token}`);
  }
  assert.equal(classes.has("shrink-0"), false, "action row must not shrink-lock on mobile");
});
