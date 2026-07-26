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
// and two semantic pairs are locked to a single static className each. R5-F4
// additionally pins both desktop active-nav branches to bg-primary-soft +
// text-sidebar-accent-foreground (light-mode contrast fix); R5-F4.1 moves the
// rooms kost-type badge to text-accent-foreground; R5-F4.2 does the same for
// the user-menu avatar initial and the dashboard occupancy tile, then rejects
// the text-bearing bg-primary-soft + text-primary pair across the whole R5
// matrix — per-attribute aggregates (split cn() literals count as one pair)
// plus a nested ancestor/descendant scan — keeping the dashboard icon-only
// accent prop and the mobile bottom-nav standalone text-primary as the two
// documented exceptions. R5-F4.3 closes two decoy bypasses: the mobile
// exception is AST-scoped to the `active ? ...` branch inside the
// RegistryBottomNav declaration, and the icon-only exception is bound to the
// exact BedDouble/"Total Kamar" StatCard — unrelated elements, other
// identifiers, other components, or other StatCard identities never satisfy
// either. Also
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

// Whole-class membership over one raw class string.
const hasAllClasses = (value: string, classNames: readonly string[]): boolean => {
  const classes = new Set(splitClasses(value));
  return classNames.every((className) => classes.has(className));
};

// All static string descendants of ONE className attribute, aggregated into a
// single whole-class set — cn("bg-primary-soft", "text-primary") or the two
// branches of a ternary count as one attribute-level surface. Different
// className attributes are never merged.
const collectAggregatedClassNames = (sourceFile: ts.SourceFile): Set<string>[] => {
  const aggregates: Set<string>[] = [];
  visitNodes(sourceFile, (node) => {
    if (isClassNameAttribute(node) && node.initializer) {
      const classes = new Set<string>();
      visitNodes(node.initializer, (inner) => {
        if (ts.isStringLiteral(inner)) {
          for (const item of splitClasses(inner.text)) classes.add(item);
        }
      });
      if (classes.size > 0) aggregates.push(classes);
    }
  });
  return aggregates;
};

// Per-attribute pair detection over the aggregates above.
const findAggregatedClassNamesWithAll = (
  sourceFile: ts.SourceFile,
  classNames: readonly string[],
): Set<string>[] =>
  collectAggregatedClassNames(sourceFile).filter((classes) =>
    classNames.every((className) => classes.has(className)),
  );

// whenTrue string literals of conditionals inside className attributes whose
// condition is EXACTLY the given identifier — binds an assertion to a specific
// `<condition> ? "..." : "..."` branch instead of a global literal count. The
// scope may be a whole source file or a single declaration subtree.
const collectConditionalTrueBranches = (scope: ts.Node, conditionIdentifier: string): string[] => {
  const branches: string[] = [];
  visitNodes(scope, (node) => {
    if (isClassNameAttribute(node) && node.initializer) {
      visitNodes(node.initializer, (inner) => {
        if (
          ts.isConditionalExpression(inner) &&
          ts.isIdentifier(inner.condition) &&
          inner.condition.text === conditionIdentifier &&
          ts.isStringLiteral(inner.whenTrue)
        ) {
          branches.push(inner.whenTrue.text);
        }
      });
    }
  });
  return branches;
};

// First function declaration with the given name (e.g. the RegistryBottomNav
// component), used to scope assertions to one component subtree.
const findFunctionDeclaration = (
  sourceFile: ts.SourceFile,
  functionName: string,
): ts.FunctionDeclaration | undefined => {
  let found: ts.FunctionDeclaration | undefined;
  visitNodes(sourceFile, (node) => {
    if (!found && ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      found = node;
    }
  });
  return found;
};

// Self-closing JSX usages of one component tag (e.g. <StatCard ... />).
const collectSelfClosingElements = (
  scope: ts.Node,
  tagName: string,
): ts.JsxSelfClosingElement[] => {
  const elements: ts.JsxSelfClosingElement[] = [];
  visitNodes(scope, (node) => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === tagName
    ) {
      elements.push(node);
    }
  });
  return elements;
};

// Named attribute of one JSX element, if present.
const getJsxAttribute = (
  element: ts.JsxSelfClosingElement,
  attributeName: string,
): ts.JsxAttribute | undefined => {
  for (const property of element.attributes.properties) {
    if (
      ts.isJsxAttribute(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === attributeName
    ) {
      return property;
    }
  }
  return undefined;
};

// Static string value of a named attribute (undefined for expressions).
const getStringAttributeValue = (
  element: ts.JsxSelfClosingElement,
  attributeName: string,
): string | undefined => {
  const attribute = getJsxAttribute(element, attributeName);
  return attribute?.initializer !== undefined && ts.isStringLiteral(attribute.initializer)
    ? attribute.initializer.text
    : undefined;
};

// Static className aggregate of one JSX element (identifiers and template
// interpolations contribute nothing).
const getElementClassNames = (
  element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): Set<string> => {
  const classes = new Set<string>();
  for (const attribute of element.attributes.properties) {
    if (isClassNameAttribute(attribute) && attribute.initializer) {
      visitNodes(attribute.initializer, (inner) => {
        if (ts.isStringLiteral(inner)) {
          for (const item of splitClasses(inner.text)) classes.add(item);
        }
      });
    }
  }
  return classes;
};

const elementHasAllClasses = (
  element: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  classNames: readonly string[],
): boolean => {
  const classes = getElementClassNames(element);
  return classNames.every((className) => classes.has(className));
};

// True when an element whose className carries every ancestor token has a JSX
// DESCENDANT whose className carries every descendant token. Siblings, single
// flat elements, and unrelated far-apart elements never satisfy the pair.
const hasNestedClassNamePair = (
  sourceFile: ts.SourceFile,
  ancestorClasses: readonly string[],
  descendantClasses: readonly string[],
): boolean => {
  let found = false;
  visitNodes(sourceFile, (node) => {
    if (found || !ts.isJsxElement(node)) return;
    if (!elementHasAllClasses(node.openingElement, ancestorClasses)) return;
    for (const child of node.children) {
      visitNodes(child, (inner) => {
        if (
          ts.isJsxElement(inner) &&
          elementHasAllClasses(inner.openingElement, descendantClasses)
        ) {
          found = true;
        } else if (
          ts.isJsxSelfClosingElement(inner) &&
          elementHasAllClasses(inner, descendantClasses)
        ) {
          found = true;
        }
      });
    }
  });
  return found;
};

// Static values of a non-className JSX attribute (e.g. the dashboard's
// icon-only `accent` prop).
const collectJsxAttributeValues = (sourceFile: ts.SourceFile, attributeName: string): string[] => {
  const values: string[] = [];
  visitNodes(sourceFile, (node) => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === attributeName &&
      node.initializer &&
      ts.isStringLiteral(node.initializer)
    ) {
      values.push(node.initializer.text);
    }
  });
  return values;
};

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
    "text-sidebar-accent-foreground",
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
  {
    file: "routes/rooms/index.tsx" as const,
    label: "kost type badge",
    classNames: ["border-primary/30", "bg-primary-soft", "text-accent-foreground"] as const,
  },
  {
    file: "components/layout/user-menu.tsx" as const,
    label: "user avatar initial",
    classNames: ["bg-primary-soft", "text-accent-foreground"] as const,
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

// --- R5-F4/F4.1/F4.2 primary-soft contrast guards ---------------------------

const NAV_SOURCE = "components/layout/registry-navigation.tsx" as const;
const USER_MENU_SOURCE = "components/layout/user-menu.tsx" as const;
const DASHBOARD_SOURCE = "routes/index.tsx" as const;

// The full R5 contrast-matrix surface set: Tier A plus the two F4.2 surfaces.
const R5_MATRIX_SOURCES = [...TIER_A_SOURCES, USER_MENU_SOURCE, DASHBOARD_SOURCE] as const;

// Dashboard occupancy tile: ancestor surface + text descendant sit on two
// separate className attributes, so the same-attribute scan alone cannot see
// the pair — it needs the structural nested lock.
const OCCUPANCY_ANCESTOR_CLASSES = ["bg-primary-soft"] as const;
const OCCUPANCY_TEXT_CLASSES = ["text-lg", "font-semibold", "text-accent-foreground"] as const;

// The dashboard stat icon keeps the primary-soft/primary pair on its
// icon-only `accent` prop (non-text contrast 4.12:1 clears the 3:1 minimum).
// Locked exactly, and isolated: the accent prop is never a className surface.
const ICON_ONLY_ACCENT = "bg-primary-soft text-primary" as const;

// The one component allowed to carry the icon-only accent, bound to its exact
// identity: <StatCard icon={BedDouble} label="Total Kamar" ... />.
const ICON_TARGET_TAG = "StatCard" as const;
const ICON_TARGET_ICON = "BedDouble" as const;
const ICON_TARGET_LABEL = "Total Kamar" as const;

// StatCard usages carrying the exact BedDouble + "Total Kamar" identity.
const findIconTargetStatCards = (scope: ts.Node): ts.JsxSelfClosingElement[] =>
  collectSelfClosingElements(scope, ICON_TARGET_TAG).filter((element) => {
    const icon = getJsxAttribute(element, "icon");
    const iconIsTarget =
      icon?.initializer !== undefined &&
      ts.isJsxExpression(icon.initializer) &&
      icon.initializer.expression !== undefined &&
      ts.isIdentifier(icon.initializer.expression) &&
      icon.initializer.expression.text === ICON_TARGET_ICON;
    return iconIsTarget && getStringAttributeValue(element, "label") === ICON_TARGET_LABEL;
  });

// Assertion: the mobile active branch lives INSIDE RegistryBottomNav, carries
// whole-class text-primary exactly once, and stays standalone (soft-free).
// Unrelated text-primary occurrences — static decoys, other identifiers, or
// elements outside the function — never satisfy it.
const assertMobileActiveBranch = (sourceFile: ts.SourceFile, fileLabel: string): void => {
  const bottomNav = findFunctionDeclaration(sourceFile, "RegistryBottomNav");
  assert.ok(bottomNav, `${fileLabel}: missing the RegistryBottomNav function declaration`);
  const activeBranches = collectConditionalTrueBranches(bottomNav, "active").filter((branch) =>
    hasAllClasses(branch, ["text-primary"]),
  );
  assert.equal(
    activeBranches.length,
    1,
    `${fileLabel}: expected exactly 1 \`active ? ...\` branch inside RegistryBottomNav carrying whole-class text-primary, found ${activeBranches.length}`,
  );
  for (const branch of activeBranches) {
    assert.equal(
      hasAllClasses(branch, ["bg-primary-soft"]),
      false,
      `${fileLabel}: the mobile active branch must stay standalone (no bg-primary-soft)`,
    );
  }
};

// Assertion: exactly one StatCard carries the icon-only accent, and it is the
// BedDouble/"Total Kamar" target — OtherWidget or a different StatCard
// identity carrying the same value never satisfies it.
const assertIconOnlyAccentTarget = (sourceFile: ts.SourceFile, fileLabel: string): void => {
  const targets = findIconTargetStatCards(sourceFile);
  assert.equal(
    targets.length,
    1,
    `${fileLabel}: expected exactly 1 <${ICON_TARGET_TAG} icon={${ICON_TARGET_ICON}} label="${ICON_TARGET_LABEL}">, found ${targets.length}`,
  );
  for (const target of targets) {
    assert.equal(
      getStringAttributeValue(target, "accent"),
      ICON_ONLY_ACCENT,
      `${fileLabel}: the "${ICON_TARGET_LABEL}" StatCard must carry accent "${ICON_ONLY_ACCENT}"`,
    );
  }
  const carriers = collectSelfClosingElements(sourceFile, ICON_TARGET_TAG).filter(
    (element) => getStringAttributeValue(element, "accent") === ICON_ONLY_ACCENT,
  );
  assert.equal(
    carriers.length,
    1,
    `${fileLabel}: exactly one StatCard may carry the icon-only accent, found ${carriers.length}`,
  );
  assert.ok(
    targets.some((target) => carriers.includes(target)),
    `${fileLabel}: the icon-only accent must sit on the ${ICON_TARGET_ICON}/"${ICON_TARGET_LABEL}" target`,
  );
};

// Desktop/sidebar active identity: soft primary surface, medium weight, and
// the high-contrast sidebar accent foreground (light mode measured 4.13:1
// with text-primary; text-sidebar-accent-foreground restores >= 4.5:1).
const DESKTOP_ACTIVE_CLASSES = [
  "bg-primary-soft",
  "font-medium",
  "text-sidebar-accent-foreground",
] as const;

// The text pairing that failed WCAG in light mode (4.13:1). F4 removed it
// from both desktop navigation branches, F4.1 from the rooms kost-type badge,
// F4.2 from the user-menu avatar and the dashboard occupancy tile — it must
// never return to any text-bearing R5 matrix surface.
const LEGACY_ACTIVE_CLASSES = ["bg-primary-soft", "text-primary"] as const;

test("R5-F4.2: desktop active branches are AST-bound to their conditional identifiers", () => {
  const sourceFile = parseTsx(readSource(NAV_SOURCE), NAV_SOURCE);
  // RouteLink binds on `active`, the root Rooms link on `roomActive` — one
  // trio branch each. The mobile bottom-nav `active` branch is standalone
  // text-primary and must never carry the trio.
  for (const conditionIdentifier of ["active", "roomActive"] as const) {
    const trioBranches = collectConditionalTrueBranches(sourceFile, conditionIdentifier).filter(
      (branch) => hasAllClasses(branch, DESKTOP_ACTIVE_CLASSES),
    );
    assert.equal(
      trioBranches.length,
      1,
      `${NAV_SOURCE}: expected exactly 1 \`${conditionIdentifier} ? ...\` branch carrying ${DESKTOP_ACTIVE_CLASSES.join(" + ")}, found ${trioBranches.length}`,
    );
  }
});

test("R5-F4.2: text-bearing bg-primary-soft + text-primary is rejected across the R5 matrix", () => {
  for (const relativePath of R5_MATRIX_SOURCES) {
    const sourceFile = parseTsx(readSource(relativePath), relativePath);

    // Same-attribute pair, aggregated across cn()/ternary literals.
    const sameAttribute = findAggregatedClassNamesWithAll(sourceFile, LEGACY_ACTIVE_CLASSES);
    assert.equal(
      sameAttribute.length,
      0,
      `${relativePath}: className aggregate(s) still pair text-primary with bg-primary-soft: ${sameAttribute.map((classes) => [...classes].join(" ")).join(" | ")}`,
    );

    // Cross-attribute pair: a primary-soft surface with a text-primary
    // descendant (the dashboard occupancy shape).
    assert.equal(
      hasNestedClassNamePair(sourceFile, ["bg-primary-soft"], ["text-primary"]),
      false,
      `${relativePath}: a bg-primary-soft surface still has a text-primary descendant`,
    );
  }
});

test("R5-F4.3: mobile standalone text-primary is scoped to RegistryBottomNav", () => {
  // Real file: the `active ? ...` branch inside RegistryBottomNav carries
  // text-primary exactly once — global membership is no longer proof.
  const sourceFile = parseTsx(readSource(NAV_SOURCE), NAV_SOURCE);
  assertMobileActiveBranch(sourceFile, NAV_SOURCE);

  // Standalone text-primary (mobile shape) never triggers the legacy detector
  // even though its attribute aggregate spans both ternary branches.
  const mobileShape = parseTsx(
    'const x = <a className={cn(active ? "text-primary" : "text-muted-foreground")} />;',
  );
  assert.deepEqual(findAggregatedClassNamesWithAll(mobileShape, LEGACY_ACTIVE_CLASSES), []);

  // The legacy desktop pairing IS caught — in a cn() ternary and static form.
  const legacyTernary = parseTsx(
    'const x = <a className={cn(active ? "bg-primary-soft font-medium text-primary" : "text-sidebar-foreground")} />;',
  );
  assert.equal(findAggregatedClassNamesWithAll(legacyTernary, LEGACY_ACTIVE_CLASSES).length, 1);
  const legacyStatic = parseTsx('const x = <a className="bg-primary-soft text-primary" />;');
  assert.equal(findAggregatedClassNamesWithAll(legacyStatic, LEGACY_ACTIVE_CLASSES).length, 1);

  // Whole-class safety: text-primary-foreground never satisfies text-primary,
  // so the sidebar logo tile can never trip the legacy detector.
  const foregroundOnly = parseTsx(
    'const x = <a className="bg-primary-soft text-primary-foreground" />;',
  );
  assert.deepEqual(findAggregatedClassNamesWithAll(foregroundOnly, LEGACY_ACTIVE_CLASSES), []);
});

test("R5-F4.2: dashboard occupancy tile and icon-only accent are locked", () => {
  const sourceFile = parseTsx(readSource(DASHBOARD_SOURCE), DASHBOARD_SOURCE);

  // Occupancy tile: primary-soft ancestor with the accent-foreground text
  // descendant (structural — two different className attributes).
  assert.ok(
    hasNestedClassNamePair(sourceFile, OCCUPANCY_ANCESTOR_CLASSES, OCCUPANCY_TEXT_CLASSES),
    `${DASHBOARD_SOURCE}: no bg-primary-soft surface nests the ${OCCUPANCY_TEXT_CLASSES.join(" + ")} occupancy text`,
  );

  // Icon-only exception: bound to the exact BedDouble/"Total Kamar" StatCard,
  // carried exactly once, on `accent` (never a className).
  assertIconOnlyAccentTarget(sourceFile, DASHBOARD_SOURCE);
});

test("R5-F4.2: aggregation, branch-binding, and nesting synthetic proofs", () => {
  // A pair split across two cn() literals on ONE className is detected.
  const splitPair = parseTsx(
    'const x = <div className={cn("bg-primary-soft", "text-primary")} />;',
  );
  assert.equal(findAggregatedClassNamesWithAll(splitPair, LEGACY_ACTIVE_CLASSES).length, 1);

  // Tokens on two DIFFERENT className attributes never merge into one pair...
  const twoAttributes = parseTsx(
    'const x = <div className="bg-primary-soft"><span className="text-primary">1</span></div>;',
  );
  assert.equal(findAggregatedClassNamesWithAll(twoAttributes, LEGACY_ACTIVE_CLASSES).length, 0);
  // ...but the same shape IS caught by the nested ancestor/descendant scan.
  assert.equal(hasNestedClassNamePair(twoAttributes, ["bg-primary-soft"], ["text-primary"]), true);

  // Branch binding: one real `active` branch plus decoys (wrong identifier,
  // non-conditional literal) still counts exactly one.
  const decoys = parseTsx(
    'const a = <a className={cn(active ? "bg-primary-soft font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground")} />;\n' +
      'const b = <b className={cn(isOpen ? "bg-primary-soft font-medium text-sidebar-accent-foreground" : "x")} />;\n' +
      'const c = <i className="bg-primary-soft font-medium text-sidebar-accent-foreground" />;',
  );
  const activeTrios = collectConditionalTrueBranches(decoys, "active").filter((branch) =>
    hasAllClasses(branch, DESKTOP_ACTIVE_CLASSES),
  );
  assert.equal(activeTrios.length, 1);

  // The wrong conditional identifier never satisfies the binding.
  assert.equal(collectConditionalTrueBranches(decoys, "roomActive").length, 0);

  // Icon-only isolation: an accent prop is never a className surface, and it
  // never legalizes the same pair on a real className next to it.
  const iconOnly = parseTsx(`const x = <StatCard accent="${ICON_ONLY_ACCENT}" />;`);
  assert.equal(findAggregatedClassNamesWithAll(iconOnly, LEGACY_ACTIVE_CLASSES).length, 0);
  assert.deepEqual(collectJsxAttributeValues(iconOnly, "accent"), [ICON_ONLY_ACCENT]);
  const iconPlusText = parseTsx(
    `const x = <div><StatCard accent="${ICON_ONLY_ACCENT}" /><span className="bg-primary-soft text-primary">1</span></div>;`,
  );
  assert.equal(findAggregatedClassNamesWithAll(iconPlusText, LEGACY_ACTIVE_CLASSES).length, 1);

  // Nesting is structural: one flat element carrying every token fails, and
  // primary-soft/text siblings fail; only a true descendant passes.
  const flat = parseTsx(
    'const x = <p className="bg-primary-soft text-lg font-semibold text-accent-foreground" />;',
  );
  assert.equal(
    hasNestedClassNamePair(flat, OCCUPANCY_ANCESTOR_CLASSES, OCCUPANCY_TEXT_CLASSES),
    false,
  );
  const siblings = parseTsx(
    'const x = <div><div className="bg-primary-soft" /><p className="text-lg font-semibold text-accent-foreground">1</p></div>;',
  );
  assert.equal(
    hasNestedClassNamePair(siblings, OCCUPANCY_ANCESTOR_CLASSES, OCCUPANCY_TEXT_CLASSES),
    false,
  );
  const nestedShape = parseTsx(
    'const x = <div className="bg-primary-soft"><p className="text-lg font-semibold text-accent-foreground">1</p></div>;',
  );
  assert.equal(
    hasNestedClassNamePair(nestedShape, OCCUPANCY_ANCESTOR_CLASSES, OCCUPANCY_TEXT_CLASSES),
    true,
  );
});

test("R5-F4.3: decoy bypasses are rejected (old helpers accept, scoped assertions fail)", () => {
  // --- Mobile decoy: RegistryBottomNav lost its text-primary active branch,
  // while a static decoy, a wrong-identifier conditional, and an occurrence
  // outside the function still carry text-primary.
  const mobileDecoy = parseTsx(
    "function RegistryBottomNav() {\n" +
      "  return (\n" +
      "    <nav>\n" +
      '      <a className={cn(active ? "text-foreground" : "text-muted-foreground")} />\n' +
      '      <span className="text-primary">decoy</span>\n' +
      '      <b className={cn(isOpen ? "text-primary" : "x")} />\n' +
      "    </nav>\n" +
      "  );\n" +
      "}\n" +
      'function OtherNav() { return <a className={cn(active ? "text-primary" : "x")} />; }',
  );
  // The old global membership check accepts the decoys...
  assert.equal(hasScopedClass(mobileDecoy, "text-primary"), true);
  // ...but the scoped assertion fails: no `active ? ...` branch inside
  // RegistryBottomNav carries text-primary.
  assert.throws(() => assertMobileActiveBranch(mobileDecoy, "mobile-decoy"), /expected exactly 1/);

  // text-primary-foreground never satisfies the mobile branch either.
  const foregroundBranch = parseTsx(
    'function RegistryBottomNav() { return <a className={cn(active ? "text-primary-foreground" : "x")} />; }',
  );
  assert.throws(
    () => assertMobileActiveBranch(foregroundBranch, "foreground-decoy"),
    /expected exactly 1/,
  );

  // Positive control: the valid mobile shape passes and matches exactly once.
  const validMobile = parseTsx(
    'function RegistryBottomNav() { return <a className={cn(active ? "text-primary" : "text-muted-foreground hover:text-foreground")} />; }',
  );
  assertMobileActiveBranch(validMobile, "valid-mobile");

  // --- Dashboard decoy: the BedDouble/"Total Kamar" target lost its icon-only
  // accent; a non-target component and a different StatCard identity carry the
  // exact value instead.
  const dashboardDecoy = parseTsx(
    "const x = (\n" +
      "  <div>\n" +
      '    <StatCard icon={BedDouble} label="Total Kamar" accent="bg-success/15 text-success" />\n' +
      `    <OtherWidget accent="${ICON_ONLY_ACCENT}" />\n` +
      `    <StatCard icon={Users} label="Total Penghuni" accent="${ICON_ONLY_ACCENT}" />\n` +
      "  </div>\n" +
      ");",
  );
  // The old any-tag scan still finds the exact accent value twice (accepts)...
  assert.equal(
    collectJsxAttributeValues(dashboardDecoy, "accent").filter(
      (value) => value === ICON_ONLY_ACCENT,
    ).length,
    2,
  );
  // ...but the identity-bound assertion fails: the target no longer carries
  // it, and neither OtherWidget nor another StatCard identity can satisfy it.
  assert.throws(
    () => assertIconOnlyAccentTarget(dashboardDecoy, "dashboard-decoy"),
    /must carry accent/,
  );

  // A lookalike with the right label but the wrong icon identity is never the
  // target.
  const wrongIcon = parseTsx(
    `const x = <StatCard icon={Users} label="Total Kamar" accent="${ICON_ONLY_ACCENT}" />;`,
  );
  assert.equal(findIconTargetStatCards(wrongIcon).length, 0);
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
