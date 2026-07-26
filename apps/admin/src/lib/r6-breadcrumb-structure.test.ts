import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// R6 breadcrumb structure guard. BreadcrumbItem and BreadcrumbSeparator both
// render <li>, so AppBreadcrumb must compose them as SIBLINGS under the <ol>
// (keyed Fragment per crumb) — never separator-inside-item, which produced the
// `ol > li > li` hydration error. AST-structural checks on the real source:
// no string matching, fail-closed on parse diagnostics. R6-F1 pins the exact
// contract: Fragment key is exactly {crumb.id}, the separator conditional's
// false branch is exactly `null`, and the Fragment carries exactly one
// separator — the one inside the `!isCurrent` whenTrue branch.

const SOURCE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "components/layout/Breadcrumb.tsx",
);

type SourceFileWithParseDiagnostics = ts.SourceFile & {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
};

const parseTsx = (source: string, fileName = "Breadcrumb.tsx"): ts.SourceFile => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX,
  ) as SourceFileWithParseDiagnostics;
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const codes = [...new Set(diagnostics.map((diagnostic) => diagnostic.code))].join(", ");
    throw new Error(
      `Malformed TSX in ${fileName}: ${diagnostics.length} parse diagnostic(s) [TS codes: ${codes}]`,
    );
  }
  return sourceFile;
};

const visitNodes = (node: ts.Node, callback: (node: ts.Node) => void): void => {
  callback(node);
  ts.forEachChild(node, (child) => visitNodes(child, callback));
};

const tagNameOf = (node: ts.Node): string | undefined => {
  if (ts.isJsxElement(node) && ts.isIdentifier(node.openingElement.tagName)) {
    return node.openingElement.tagName.text;
  }
  if (ts.isJsxSelfClosingElement(node) && ts.isIdentifier(node.tagName)) {
    return node.tagName.text;
  }
  return undefined;
};

const findElements = (scope: ts.Node, tagName: string): ts.Node[] => {
  const elements: ts.Node[] = [];
  visitNodes(scope, (node) => {
    if (tagNameOf(node) === tagName) elements.push(node);
  });
  return elements;
};

const readBreadcrumbSource = (): ts.SourceFile => parseTsx(readFileSync(SOURCE_PATH, "utf8"));

test("R6: BreadcrumbSeparator is never a JSX descendant of BreadcrumbItem", () => {
  const sourceFile = readBreadcrumbSource();
  const items = findElements(sourceFile, "BreadcrumbItem");
  assert.ok(items.length > 0, "AppBreadcrumb must render BreadcrumbItem");
  for (const item of items) {
    const nested = findElements(item, "BreadcrumbSeparator");
    assert.equal(
      nested.length,
      0,
      `BreadcrumbItem renders <li> and must not contain BreadcrumbSeparator (also <li>) — found ${nested.length} nested separator(s), which produces ol > li > li`,
    );
  }
});

// The full crumb-Fragment contract, callable against the real source and the
// R6-F1 synthetic mutation decoys alike.
const assertCrumbFragmentContract = (sourceFile: ts.SourceFile): void => {
  const keyedFragments = findElements(sourceFile, "Fragment").filter(
    (fragment): fragment is ts.JsxElement =>
      ts.isJsxElement(fragment) &&
      fragment.openingElement.attributes.properties.some(
        (property) =>
          ts.isJsxAttribute(property) &&
          ts.isIdentifier(property.name) &&
          property.name.text === "key",
      ),
  );
  assert.equal(
    keyedFragments.length,
    1,
    `expected exactly 1 keyed <Fragment> wrapping each mapped crumb, found ${keyedFragments.length}`,
  );

  for (const fragment of keyedFragments) {
    // Exact key shape: key={crumb.id}. A static string or any other
    // expression fails.
    const keyAttributes = fragment.openingElement.attributes.properties.filter(
      (property): property is ts.JsxAttribute =>
        ts.isJsxAttribute(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === "key",
    );
    for (const keyAttribute of keyAttributes) {
      const initializer = keyAttribute.initializer;
      const isCrumbId =
        initializer !== undefined &&
        ts.isJsxExpression(initializer) &&
        initializer.expression !== undefined &&
        ts.isPropertyAccessExpression(initializer.expression) &&
        ts.isIdentifier(initializer.expression.expression) &&
        initializer.expression.expression.text === "crumb" &&
        ts.isIdentifier(initializer.expression.name) &&
        initializer.expression.name.text === "id";
      assert.ok(isCrumbId, "the Fragment key must be exactly {crumb.id}");
    }

    const directItems = fragment.children.filter((child) => tagNameOf(child) === "BreadcrumbItem");
    assert.equal(
      directItems.length,
      1,
      "the keyed Fragment must have exactly one direct BreadcrumbItem child",
    );

    const conditionals = fragment.children
      .filter(ts.isJsxExpression)
      .map((child) => child.expression)
      .filter(
        (expression): expression is ts.ConditionalExpression =>
          expression !== undefined && ts.isConditionalExpression(expression),
      );
    const separatorConditionals = conditionals.filter(
      (conditional) => findElements(conditional.whenTrue, "BreadcrumbSeparator").length === 1,
    );
    assert.equal(
      separatorConditionals.length,
      1,
      "the keyed Fragment must render BreadcrumbSeparator behind exactly one conditional SIBLING of BreadcrumbItem",
    );

    // Separator exclusivity: the Fragment carries exactly one separator in
    // total, and it is the one inside the whenTrue branch — no direct or
    // extra conditional separators.
    const allSeparators = findElements(fragment, "BreadcrumbSeparator");
    assert.equal(
      allSeparators.length,
      1,
      `the keyed Fragment must contain exactly one BreadcrumbSeparator in total, found ${allSeparators.length}`,
    );

    for (const conditional of separatorConditionals) {
      assert.ok(
        ts.isPrefixUnaryExpression(conditional.condition) &&
          conditional.condition.operator === ts.SyntaxKind.ExclamationToken &&
          ts.isIdentifier(conditional.condition.operand) &&
          conditional.condition.operand.text === "isCurrent",
        "the sibling separator must be guarded by the exact condition `!isCurrent`",
      );
      assert.equal(
        conditional.whenFalse.kind,
        ts.SyntaxKind.NullKeyword,
        "the separator conditional's false branch must be exactly `null`",
      );
      assert.equal(
        findElements(conditional.whenTrue, "BreadcrumbSeparator")[0],
        allSeparators[0],
        "the only separator in the Fragment must be the one inside the `!isCurrent` whenTrue branch",
      );
    }
  }
};

test("R6: each crumb is a keyed Fragment with item + sibling conditional separator", () => {
  assertCrumbFragmentContract(readBreadcrumbSource());
});

test("R6-F1: fragment contract mutation proofs (decoys fail, real source passes)", () => {
  // Separator moved to the false branch fails.
  assert.throws(
    () =>
      assertCrumbFragmentContract(
        parseTsx(
          "const x = <Fragment key={crumb.id}><BreadcrumbItem />{!isCurrent ? null : <BreadcrumbSeparator />}</Fragment>;",
        ),
      ),
    /exactly one conditional/,
  );
  // An extra unconditional sibling separator fails.
  assert.throws(
    () =>
      assertCrumbFragmentContract(
        parseTsx(
          "const x = <Fragment key={crumb.id}><BreadcrumbItem />{!isCurrent ? <BreadcrumbSeparator /> : null}<BreadcrumbSeparator /></Fragment>;",
        ),
      ),
    /exactly one BreadcrumbSeparator in total/,
  );
  // A static Fragment key fails.
  assert.throws(
    () =>
      assertCrumbFragmentContract(
        parseTsx(
          'const x = <Fragment key="static"><BreadcrumbItem />{!isCurrent ? <BreadcrumbSeparator /> : null}</Fragment>;',
        ),
      ),
    /exactly \{crumb\.id\}/,
  );
  // The actual production source passes the full contract.
  assertCrumbFragmentContract(readBreadcrumbSource());
});

test("R6: BreadcrumbLink and BreadcrumbPage stay inside BreadcrumbItem", () => {
  const sourceFile = readBreadcrumbSource();
  const items = findElements(sourceFile, "BreadcrumbItem");
  assert.ok(items.length > 0, "AppBreadcrumb must render BreadcrumbItem");
  for (const item of items) {
    assert.equal(
      findElements(item, "BreadcrumbLink").length > 0,
      true,
      "BreadcrumbItem must keep BreadcrumbLink inside it (linkable crumbs)",
    );
    assert.equal(
      findElements(item, "BreadcrumbPage").length > 0,
      true,
      "BreadcrumbItem must keep BreadcrumbPage inside it (current crumb)",
    );
  }
});

test("R6: malformed TSX is rejected before traversal (fail-closed)", () => {
  assert.throws(() => parseTsx("const x = <BreadcrumbItem>"), /Malformed TSX/);
});
