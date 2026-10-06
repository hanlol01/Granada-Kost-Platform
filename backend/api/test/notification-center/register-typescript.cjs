require('reflect-metadata');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename,'utf8'), {
  fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
    esModuleInterop:true,experimentalDecorators:true,emitDecoratorMetadata:true}
}).outputText,filename);
