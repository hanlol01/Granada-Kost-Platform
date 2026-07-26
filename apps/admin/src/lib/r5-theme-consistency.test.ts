import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// R5 Theme Consistency guard (hardened in R5-F1, AST-scoped in R5-F2).
// Locks the semantic-token refinement on the four Tier A layout/page surfaces:
// hard-coded palette classes must never return, core semantic tokens must stay
// anchored inside real JSX `className` attributes (TypeScript AST traversal —
// comments, plain string constants, and non-className attributes never count),
// and two semantic pairs are locked to a single static className each. Also
// verifies styles.css theme-token parity with a parser that accepts whitespace
// selector variants and cannot pass vacuously on empty, missing, or unclosed
// blocks. Static source checks only — no DOM, no browser, no Tier B reads.

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const TIER_A_SOURCES = [
  "components/layout/app-shell.tsx",
  "components/layout/registry-navigation.tsx",
  "components/layout/Breadcrumb.tsx",
  "routes/rooms/index.tsx",
] as const;

const readSource = (relativePath: string): string =>
  readFileSync(join(SRC_DIR, relativePath), "utf8");

// Exact hard-coded theme classes that the R5 patch replaced. Scrim overlays
// (bg-black/80) and semantic status colors stay allowed.
const FORBIDDEN_CLASS_PATTERNS: readonly RegExp[] = [
  /\b(?:bg|text|border|divide|ring)-slate-\d+(?:\/\d+)?\b/,
  /\b(?:bg|text|border)-blue-(?:300|400|500|600)(?:\/\d+)?\b/,
  /\btext-white\b/,
];

// --- AST-scoped className helpers ------------------------------------------

// ts.createSourceFile performs error recovery and never throws on malformed
// input; its syntactic errors land on the internal `parseDiagnostics` list.
type SourceFileWithParseDiagnostics = ts.SourceFile & {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
};

// Fail-closed TSX parsing: any parse diagnostic rejects the source before AST
// traversal, so no semantic pair can ever be "found" on a recovered partial
// AST. The error stays generic (file name, count, diagnostic codes) and never
// embeds the source text.
const parseTsx = (source: string, fileName = "source.tsx"): ts.SourceFile => {
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

const isClassNameAttribute = (node: ts.Node): node is ts.JsxAttribute =>
  ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className";

// Values of static `className="..."` attributes only — the strict surface for
// element-scoped pair proofs. Expression initializers (cn(...), ternaries) are
// deliberately excluded here.
const collectStaticClassNameValues = (sourceFile: ts.SourceFile): string[] => {
  const values: string[] = [];
  visitNodes(sourceFile, (node) => {
    if (isClassNameAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      values.push(node.initializer.text);
    }
  });
  return values;
};

// String literals that live anywhere inside a `className` attribute —
// including cn(...) arguments and ternary branches. Used for single-token
// anchoring. Still AST-scoped: comments, plain constants, and other JSX
// attributes (title, aria-label, data-*) are never collected.
const collectClassNameScopedValues = (sourceFile: ts.SourceFile): string[] => {
  const values: string[] = [];
  visitNodes(sourceFile, (node) => {
    if (isClassNameAttribute(node) && node.initializer) {
      visitNodes(node.initializer, (inner) => {
        if (ts.isStringLiteral(inner)) values.push(inner.text);
      });
    }
  });
  return values;
};

const splitClasses = (value: string): string[] => value.trim().split(/\s+/);

// Whole-class membership: "bg-primary" never matches "bg-primary-soft".
const hasScopedClass = (sourceFile: ts.SourceFile, className: string): boolean =>
  collectClassNameScopedValues(sourceFile).some((value) => splitClasses(value).includes(className));

// Element-scoped pair proof: every token must sit on ONE static className
// attribute, in any token order, independent of line wrapping.
const findStaticClassNameWithAll = (
  sourceFile: ts.SourceFile,
  classNames: readonly string[],
): string | undefined =>
  collectStaticClassNameValues(sourceFile).find((value) => {
    const classes = new Set(splitClasses(value));
    return classNames.every((className) => classes.has(className));
  });

// Semantic tokens that must anchor each Tier A surface (whole-class matches
// inside className attributes).
const REQUIRED_TOKENS: Record<(typeof TIER_A_SOURCES)[number], readonly string[]> = {
  "components/layout/app-shell.tsx": [
    "bg-background",
    "text-foreground",
    "bg-background/90",
    "border-border",
    "text-muted-foreground",
  ],
  "components/layout/registry-navigation.tsx": [
    "bg-sidebar",
    "text-sidebar-foreground",
    "border-sidebar-border",
    "hover:bg-sidebar-accent",
    "hover:text-sidebar-accent-foreground",
    "bg-primary-soft",
    "text-primary",
    "bg-primary",
    "bg-background",
  ],
  "components/layout/Breadcrumb.tsx": ["text-muted-foreground", "text-foreground"],
  "routes/rooms/index.tsx": [
    "bg-card",
    "border-border",
    "text-foreground",
    "text-muted-foreground",
    "bg-primary-soft",
    "text-primary",
  ],
};

// Semantic pairs that must live on ONE static className.
const ELEMENT_SCOPED_PAIRS = [
  {
    file: "components/layout/registry-navigation.tsx" as const,
    label: "sidebar logo tile",
    classNames: ["bg-primary", "text-primary-foreground"] as const,
  },
  {
    file: "routes/rooms/index.tsx" as const,
    label: "inventory status tile",
    classNames: ["border-border", "bg-muted/50"] as const,
  },
];

test("R5: Tier A surfaces contain no hard-coded theme palette classes", () => {
  for (const relativePath of TIER_A_SOURCES) {
    const source = readSource(relativePath);
    for (const pattern of FORBIDDEN_CLASS_PATTERNS) {
      const match = source.match(pattern);
      assert.equal(
        match,
        null,
        `${relativePath} still contains hard-coded theme class "${match?.[0] ?? ""}" (pattern ${String(pattern)})`,
      );
    }
  }
});

test("R5: Tier A surfaces keep their semantic theme tokens in className attributes", () => {
  for (const relativePath of TIER_A_SOURCES) {
    const sourceFile = parseTsx(readSource(relativePath), relativePath);
    for (const token of REQUIRED_TOKENS[relativePath]) {
      assert.ok(
        hasScopedClass(sourceFile, token),
        `${relativePath} is missing required semantic token "${token}" inside a className attribute`,
      );
    }
  }
});

test("R5: element-scoped semantic pairs share a single static className", () => {
  for (const pair of ELEMENT_SCOPED_PAIRS) {
    const sourceFile = parseTsx(readSource(pair.file), pair.file);
    const matched = findStaticClassNameWithAll(sourceFile, pair.classNames);
    assert.ok(
      matched,
      `${pair.file}: no single static className carries ${pair.classNames.join(" + ")} together (${pair.label})`,
    );
  }
});

test("R5: className pair proof is AST-scoped (negative synthetic proofs)", () => {
  const PAIR = ["bg-primary", "text-primary-foreground"] as const;
  const findPair = (code: string) => findStaticClassNameWithAll(parseTsx(code), PAIR);

  // Pair on a plain string constant must fail.
  assert.equal(findPair('const proof = "bg-primary text-primary-foreground";'), undefined);

  // Pair on non-className JSX attributes must fail.
  assert.equal(
    findPair('const x = <div title="bg-primary text-primary-foreground" />;'),
    undefined,
  );
  assert.equal(
    findPair('const x = <div aria-label="bg-primary text-primary-foreground" />;'),
    undefined,
  );
  assert.equal(
    findPair('const x = <div data-theme="bg-primary text-primary-foreground" />;'),
    undefined,
  );

  // Pair inside a comment must fail.
  assert.equal(findPair("// bg-primary text-primary-foreground\nconst y = 1;"), undefined);

  // Pair inside arbitrary copy text must fail.
  assert.equal(
    findPair('const copy = "Gunakan bg-primary text-primary-foreground di sini";'),
    undefined,
  );

  // Losing one member of the pair must fail.
  assert.equal(findPair('const x = <div className="bg-primary shadow-sm" />;'), undefined);

  // Whole-class matching: bg-primary-soft never satisfies bg-primary.
  assert.equal(
    findPair('const x = <div className="bg-primary-soft text-primary-foreground" />;'),
    undefined,
  );

  // Expression initializers are not static className strings.
  assert.equal(
    findPair('const x = <div className={cn("bg-primary", "text-primary-foreground")} />;'),
    undefined,
  );

  // Reversed token order on one static className must PASS.
  assert.equal(
    findPair('const x = <div className="text-primary-foreground rounded-xl bg-primary" />;'),
    "text-primary-foreground rounded-xl bg-primary",
  );
});

test("R5: malformed TSX is rejected before AST traversal (fail-closed)", () => {
  const PAIR = ["bg-primary", "text-primary-foreground"] as const;
  const findPair = (code: string) => findStaticClassNameWithAll(parseTsx(code), PAIR);

  // Missing closing element/syntax — exact reviewer reproduction. The full
  // semantic pair is present, yet the parse must throw before traversal.
  assert.throws(
    () => findPair('const x = <div className="text-primary-foreground bg-primary"'),
    /Malformed TSX/,
  );

  // Mismatched closing element.
  assert.throws(
    () => findPair('const x = <div className="text-primary-foreground bg-primary"></span>;'),
    /Malformed TSX/,
  );

  // Invalid trailing syntax after a valid element.
  assert.throws(
    () => findPair('const x = <div className="text-primary-foreground bg-primary" />; ???'),
    /Malformed TSX/,
  );

  // Positive control: the same pair on valid TSX is still found.
  assert.equal(
    findPair('const x = <div className="text-primary-foreground bg-primary" />;'),
    "text-primary-foreground bg-primary",
  );
});

// --- styles.css parity ------------------------------------------------------

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Extracts CSS custom property names from the first `<selector> {` block.
// Accepts arbitrary whitespace between selector and brace (":root {", ":root{").
// Never vacuous: throws when the selector block is missing, unterminated, or
// declares no custom properties.
const extractCssVariables = (css: string, selector: string): Set<string> => {
  const opener = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{`));
  assert.ok(opener?.index !== undefined, `styles.css is missing a "${selector}" block`);
  const blockStart = opener.index + opener[0].length;
  const blockEnd = css.indexOf("}", blockStart);
  assert.ok(blockEnd > blockStart, `styles.css "${selector}" block is not closed`);
  const block = css.slice(blockStart, blockEnd);
  const variables = new Set<string>();
  for (const match of block.matchAll(/--[a-z0-9-]+(?=\s*:)/g)) {
    variables.add(match[0]);
  }
  assert.ok(variables.size > 0, `"${selector}" block declares no CSS custom properties`);
  return variables;
};

// Core theme roles, using the exact variable names present in styles.css.
const CORE_THEME_TOKENS: readonly string[] = [
  "--background",
  "--foreground",
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
  "--primary",
  "--primary-foreground",
  "--primary-soft",
  "--muted",
  "--muted-foreground",
  "--border",
  "--sidebar",
  "--sidebar-foreground",
  "--sidebar-accent",
  "--sidebar-border",
];

test("R5: CSS variable parser accepts whitespace variants and rejects empty blocks", () => {
  const compact = ":root{--background:#fff;--foreground:#000}.dark{--background:#000}";
  const spaced = ":root {\n  --background: #fff;\n}\n.dark {\n  --background: #000;\n}";

  // Whitespace variants of the selector/brace are both parsed.
  assert.deepEqual([...extractCssVariables(compact, ":root")], ["--background", "--foreground"]);
  assert.deepEqual([...extractCssVariables(compact, ".dark")], ["--background"]);
  assert.deepEqual([...extractCssVariables(spaced, ":root")], ["--background"]);
  assert.deepEqual([...extractCssVariables(spaced, ".dark")], ["--background"]);

  // Non-vacuous: empty or whitespace-only blocks and missing selectors throw.
  assert.throws(() => extractCssVariables(":root{}", ":root"));
  assert.throws(() => extractCssVariables(":root {   }", ":root"));
  assert.throws(() => extractCssVariables(":root{color:red}", ":root"));
  assert.throws(() => extractCssVariables(".other{--a:1}", ":root"));
});

test("R5: CSS variable parser survives adversarial selector shapes", () => {
  // Multiline selector (newline between selector and brace) is accepted.
  assert.deepEqual(
    [...extractCssVariables(":root\n{--background:#fff;}", ":root")],
    ["--background"],
  );

  // Literal-dot escaping: "xdark" must never be read as ".dark".
  assert.throws(() => extractCssVariables("xdark{--background:#000;}", ".dark"));

  // A custom-variant reference alone is not a .dark declaration block.
  assert.throws(() => extractCssVariables("@custom-variant dark (&:is(.dark *));", ".dark"));

  // Unclosed block must throw.
  assert.throws(() => extractCssVariables(":root{--background:#fff", ":root"));
});

test("R5: styles.css declares all core theme tokens in :root and .dark", () => {
  const css = readSource("styles.css");
  const rootVariables = extractCssVariables(css, ":root");
  const darkVariables = extractCssVariables(css, ".dark");

  assert.ok(rootVariables.size > 0, ":root token extraction returned an empty set");
  assert.ok(darkVariables.size > 0, ".dark token extraction returned an empty set");

  for (const token of CORE_THEME_TOKENS) {
    assert.ok(rootVariables.has(token), `styles.css :root is missing core token "${token}"`);
    assert.ok(darkVariables.has(token), `styles.css .dark is missing core token "${token}"`);
  }
});

test("R5: every :root theme token has a .dark counterpart", () => {
  const css = readSource("styles.css");
  const rootVariables = extractCssVariables(css, ":root");
  const darkVariables = extractCssVariables(css, ".dark");

  // --radius is theme-agnostic sizing, not a color token.
  const missing = [...rootVariables].filter(
    (name) => name !== "--radius" && !darkVariables.has(name),
  );

  assert.deepEqual(
    missing,
    [],
    `styles.css :root tokens without .dark counterpart: ${missing.join(", ")}`,
  );
});
