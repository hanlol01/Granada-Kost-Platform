require('reflect-metadata');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(
    ts.transpileModule(
      // ESM-style test fixtures retain their original source URL in this CJS runner.
      (filename.endsWith('.test.ts') || filename.includes(`${require('node:path').sep}test${require('node:path').sep}`))
        ? readFileSync(filename, 'utf8').replaceAll(
            'import.meta.url',
            JSON.stringify(pathToFileURL(filename).href),
          )
        : readFileSync(filename, 'utf8'),
      {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      },
    ).outputText,
    filename,
  );
};
