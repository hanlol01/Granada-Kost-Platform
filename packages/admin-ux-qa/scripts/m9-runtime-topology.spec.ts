import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const ADMIN_VITE_PATH = join(
  REPOSITORY_ROOT,
  "apps",
  "admin",
  "vite.config.ts",
);
const PENGHUNI_VITE_PATH = join(
  REPOSITORY_ROOT,
  "apps",
  "penghuni",
  "vite.config.ts",
);
const ROOT_PACKAGE_PATH = join(REPOSITORY_ROOT, "package.json");
const API_CONFIGURATION_PATH = join(
  REPOSITORY_ROOT,
  "backend",
  "api",
  "src",
  "infrastructure",
  "config",
  "configuration.ts",
);
const API_ENVIRONMENT_VALIDATION_PATH = join(
  REPOSITORY_ROOT,
  "backend",
  "api",
  "src",
  "infrastructure",
  "config",
  "environment.validation.ts",
);
const PENGHUNI_KAMAR_ROUTE_PATH = join(
  REPOSITORY_ROOT,
  "apps",
  "penghuni",
  "src",
  "routes",
  "kamar.tsx",
);
const LOCAL_CORS_ORIGINS = ["http://localhost:8080", "http://localhost:8081"];

type ParsedSourceFile = ts.SourceFile & {
  parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
};

function parseTypeScriptSource(source: string, path: string): ts.SourceFile {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    false,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  ) as ParsedSourceFile;
  const diagnostics = sourceFile.parseDiagnostics ?? [];
  assert.equal(
    diagnostics.length,
    0,
    `${path} must parse without TypeScript diagnostics: ${diagnostics
      .map((diagnostic) => diagnostic.code)
      .join(", ")}`,
  );
  return sourceFile;
}

function parseTypeScript(path: string): ts.SourceFile {
  return parseTypeScriptSource(readFileSync(path, "utf8"), path);
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : undefined;
}

function objectProperty(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.PropertyAssignment {
  const matches = object.properties.filter(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      propertyNameText(property.name) === name,
  );
  assert.equal(matches.length, 1, `expected exactly one ${name} property`);
  return matches[0]!;
}

function objectInitializer(
  property: ts.PropertyAssignment,
): ts.ObjectLiteralExpression {
  assert.ok(
    ts.isObjectLiteralExpression(property.initializer),
    `${propertyNameText(property.name) ?? "property"} must be an object literal`,
  );
  return property.initializer;
}

function bindingContainsIdentifier(
  name: ts.BindingName,
  identifier: string,
): boolean {
  if (ts.isIdentifier(name)) return name.text === identifier;
  return name.elements.some(
    (element) =>
      ts.isBindingElement(element) &&
      bindingContainsIdentifier(element.name, identifier),
  );
}

function assertLovableDefineConfigImport(
  sourceFile: ts.SourceFile,
  path: string,
): void {
  const message = `${path} must use exact Lovable defineConfig named import`;
  const imports = sourceFile.statements.filter(
    (statement) =>
      ts.isImportDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement),
  );
  assert.equal(imports.length, 1, message);
  const declaration = imports[0]!;
  assert.ok(ts.isImportDeclaration(declaration), message);
  assert.ok(
    ts.isStringLiteral(declaration.moduleSpecifier) &&
      declaration.moduleSpecifier.text === "@lovable.dev/vite-tanstack-config",
    message,
  );

  const clause = declaration.importClause;
  assert.ok(clause, message);
  assert.equal(clause.isTypeOnly, false, message);
  assert.equal(clause.name, undefined, message);
  assert.ok(
    clause.namedBindings && ts.isNamedImports(clause.namedBindings),
    message,
  );
  assert.equal(clause.namedBindings.elements.length, 1, message);
  const binding = clause.namedBindings.elements[0]!;
  assert.equal(binding.isTypeOnly, false, message);
  assert.equal(binding.propertyName, undefined, message);
  assert.equal(binding.name.text, "defineConfig", message);

  const shadows = sourceFile.statements.filter((statement) => {
    if (statement === declaration) return false;
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) &&
      statement.name?.text === "defineConfig"
    ) {
      return true;
    }
    return (
      ts.isVariableStatement(statement) &&
      statement.declarationList.declarations.some((item) =>
        bindingContainsIdentifier(item.name, "defineConfig"),
      )
    );
  });
  assert.equal(shadows.length, 0, message);
}

function exportedViteConfigFromSource(
  sourceFile: ts.SourceFile,
  path: string,
): ts.ObjectLiteralExpression {
  assertLovableDefineConfigImport(sourceFile, path);

  const exports = sourceFile.statements.filter(ts.isExportAssignment);
  assert.equal(
    exports.length,
    1,
    `${path} must have exactly one default export`,
  );
  const expression = exports[0]!.expression;
  assert.ok(
    ts.isCallExpression(expression),
    `${path} default export must call defineConfig`,
  );
  assert.ok(
    ts.isIdentifier(expression.expression) &&
      expression.expression.text === "defineConfig",
    `${path} must use the existing defineConfig wrapper`,
  );
  assert.equal(
    expression.arguments.length,
    1,
    "defineConfig must receive one config object",
  );
  const config = expression.arguments[0]!;
  assert.ok(
    ts.isObjectLiteralExpression(config),
    "defineConfig argument must be an object literal",
  );
  return config;
}

function exportedViteConfig(path: string): ts.ObjectLiteralExpression {
  return exportedViteConfigFromSource(parseTypeScript(path), path);
}

function localServerContract(path: string): {
  port: number;
  strictPort: boolean;
} {
  const config = exportedViteConfig(path);
  const vite = objectInitializer(objectProperty(config, "vite"));
  const server = objectInitializer(objectProperty(vite, "server"));
  const port = objectProperty(server, "port").initializer;
  const strictPort = objectProperty(server, "strictPort").initializer;
  assert.ok(ts.isNumericLiteral(port), "server.port must be a numeric literal");
  assert.ok(
    strictPort.kind === ts.SyntaxKind.TrueKeyword,
    "server.strictPort must be true",
  );

  const tanstackStart = objectInitializer(
    objectProperty(config, "tanstackStart"),
  );
  const tanstackServer = objectInitializer(
    objectProperty(tanstackStart, "server"),
  );
  const entry = objectProperty(tanstackServer, "entry").initializer;
  assert.ok(
    ts.isStringLiteral(entry) && entry.text === "server",
    "TanStack server entry changed",
  );

  return { port: Number(port.text), strictPort: true };
}

function visit(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function singleProperty(
  sourceFile: ts.SourceFile,
  name: string,
): ts.PropertyAssignment {
  const matches: ts.PropertyAssignment[] = [];
  visit(sourceFile, (node) => {
    if (ts.isPropertyAssignment(node) && propertyNameText(node.name) === name)
      matches.push(node);
  });
  assert.equal(matches.length, 1, `expected exactly one ${name} property`);
  return matches[0]!;
}

function configurationCorsDefault(): string {
  const property = singleProperty(
    parseTypeScript(API_CONFIGURATION_PATH),
    "corsAllowedOrigins",
  );
  const defaults: string[] = [];
  visit(property.initializer, (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      ts.isStringLiteral(node.right)
    ) {
      defaults.push(node.right.text);
    }
  });
  assert.equal(
    defaults.length,
    1,
    "API configuration must have one CORS fallback",
  );
  return defaults[0]!;
}

function validationCorsDefault(): string {
  const property = singleProperty(
    parseTypeScript(API_ENVIRONMENT_VALIDATION_PATH),
    "CORS_ALLOWED_ORIGINS",
  );
  const defaults: string[] = [];
  visit(property.initializer, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "default" &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      defaults.push(node.arguments[0]!.text);
    }
  });
  assert.equal(defaults.length, 1, "API validation must have one CORS default");
  return defaults[0]!;
}

test("M9 local Vite servers use distinct fixed ports and fail fast on collisions", () => {
  const admin = localServerContract(ADMIN_VITE_PATH);
  const penghuni = localServerContract(PENGHUNI_VITE_PATH);
  assert.deepEqual(admin, { port: 8080, strictPort: true });
  assert.deepEqual(penghuni, { port: 8081, strictPort: true });
  assert.notEqual(admin.port, penghuni.port);
});

test("M9-F1 binds defineConfig to the exact Lovable named import", () => {
  const reviewerFalsePositive = parseTypeScriptSource(
    `
import "@lovable.dev/vite-tanstack-config";
const defineConfig = <T>(value: T) => value;
export default defineConfig({
  tanstackStart: { server: { entry: "server" } },
  vite: { server: { port: 8080, strictPort: true } },
});
`,
    "reviewer-false-positive.ts",
  );
  assert.throws(
    () =>
      exportedViteConfigFromSource(
        reviewerFalsePositive,
        "reviewer-false-positive.ts",
      ),
    /exact Lovable defineConfig named import/u,
  );

  const rejectedBindings = [
    [
      "default import",
      `import defineConfig from "@lovable.dev/vite-tanstack-config";
export default defineConfig({});`,
    ],
    [
      "namespace import",
      `import * as defineConfig from "@lovable.dev/vite-tanstack-config";
export default defineConfig({});`,
    ],
    [
      "aliased named import",
      `import { defineConfig as localDefineConfig } from "@lovable.dev/vite-tanstack-config";
export default localDefineConfig({});`,
    ],
    [
      "additional named binding",
      `import { defineConfig, viteReact } from "@lovable.dev/vite-tanstack-config";
export default defineConfig({});`,
    ],
    [
      "local function shadow",
      `import { defineConfig } from "@lovable.dev/vite-tanstack-config";
function defineConfig<T>(value: T) { return value; }
export default defineConfig({});`,
    ],
    [
      "local const shadow",
      `import { defineConfig } from "@lovable.dev/vite-tanstack-config";
const defineConfig = <T>(value: T) => value;
export default defineConfig({});`,
    ],
    [
      "local class shadow",
      `import { defineConfig } from "@lovable.dev/vite-tanstack-config";
class defineConfig {}
export default defineConfig({});`,
    ],
    [
      "second import shadow",
      `import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { otherDefineConfig as defineConfig } from "other-package";
export default defineConfig({});`,
    ],
  ] as const;
  for (const [label, source] of rejectedBindings) {
    const sourceFile = parseTypeScriptSource(source, `${label}.ts`);
    assert.throws(
      () => exportedViteConfigFromSource(sourceFile, `${label}.ts`),
      /exact Lovable defineConfig named import/u,
      label,
    );
  }

  assert.throws(
    () =>
      parseTypeScriptSource(
        "export default defineConfig({",
        "malformed-vite.config.ts",
      ),
    /must parse without TypeScript diagnostics/u,
  );
});

test("M9 root scripts and API CORS retain the exact localhost topology", () => {
  const rootPackage = JSON.parse(readFileSync(ROOT_PACKAGE_PATH, "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(
    rootPackage.scripts?.["dev:admin"],
    "npm --workspace @granada-kost/admin run dev -- --port 8080",
  );
  assert.equal(
    rootPackage.scripts?.["dev:penghuni"],
    "npm --workspace @granada-kost/penghuni run dev -- --port 8081",
  );
  assert.equal(
    rootPackage.scripts?.["dev:api"],
    "npm --workspace @granada-kost/api run dev",
  );

  for (const value of [configurationCorsDefault(), validationCorsDefault()]) {
    assert.deepEqual(value.split(","), LOCAL_CORS_ORIGINS);
    assert.equal(value.includes("8082"), false);
  }
});

test("M9 public Penghuni /kamar route is locked from canonical route source", () => {
  const sourceFile = parseTypeScript(PENGHUNI_KAMAR_ROUTE_PATH);
  const routes: string[] = [];
  visit(sourceFile, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "createFileRoute" &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      routes.push(node.arguments[0]!.text);
    }
  });
  assert.deepEqual(routes, ["/kamar"]);
  assert.equal(PENGHUNI_KAMAR_ROUTE_PATH.includes("routeTree"), false);
});
