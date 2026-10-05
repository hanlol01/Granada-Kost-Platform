// Run the original frontend tests through the repository's native TS loader.
// No test bodies, API contracts or module exports are replaced.
require('./register-typescript.cjs');
for (const name of [
  'lease-revision-contract', 'lease-revision-form', 'lease-revision-cache',
  'lease-revision-notices', 'billing-evidence-contract', 'lease-archive-contract',
  'lease-archive-file-contract', 'lease-archive-restoration-contract', 'lease-archive-successor',
]) require(`../../../../apps/admin/src/lib/${name}.test.ts`);
