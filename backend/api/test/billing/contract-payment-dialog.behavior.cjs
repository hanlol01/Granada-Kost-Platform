// Execute the real dialog and event handlers. Only hooks/I/O and visual leaf
// components are substituted; no amount/intent logic is copied into the test.
const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let cells = [], cursor = 0, submitted;
const realLoad = Module._load;
const react = require('react');
const mutation = { reset() {}, mutate(value) { submitted = value; }, isPending: false, isError: false };
const leaf = new Proxy({}, { get: (_, name) => String(name) });
Module._load = function(id, ...args) {
  if (id === 'react') return { ...react,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in cells)) cells[slot] = typeof initial === 'function' ? initial() : initial;
      return [cells[slot], next => { cells[slot] = typeof next === 'function' ? next(cells[slot]) : next; }];
    },
    useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
    useRef: value => ({ current: value }),
  };
  if (id === '@/hooks/useAdminBilling') return {
    useRecordManualPayment: () => mutation,
    useAdminPaymentVerificationPolicy: () => ({ data: { transferEvidenceRequired: false } }),
  };
  if (id === '@/lib/format') return { formatIDR: value => `Rp ${value}` };
  if (id === '@/lib/idempotency') return { newIdempotencyKey: () => 'test-command' };
  if (id.startsWith('@/') || (id.startsWith('./') && args[0]?.filename.endsWith('PaymentsWorkspace.tsx')) ||
      id === 'lucide-react' || id === '@tanstack/react-router') return leaf;
  return realLoad.call(this, id, ...args);
};
const filename = path.resolve('../../apps/admin/src/components/billing/PaymentsWorkspace.tsx');
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = Module._nodeModulePaths(path.dirname(filename));
try {
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
} finally { Module._load = realLoad; }
const { RecordPaymentDialog } = loaded.exports;
const invoice = { id: 'invoice', outstanding_amount: 8_300_000, invoice_status: 'partially_paid', invoice_purpose: 'rent' };
const props = { data: { lease: { id: 'lease', resident_id: 'resident' }, owner_sponsorship: null,
  summary: { security_deposit_target: 0, deposit_collected: 0 }, invoices: [invoice], contract_settlement: {} },
  propertyId: 'property', contractSettlementInvoiceId: invoice.id, contractSettlementMode: 'choose' };
function render(extra = {}) { cursor = 0; return RecordPaymentDialog({ ...props, ...extra }); }
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (Array.isArray(tree)) { for (const item of tree) { const found = find(item, predicate); if (found) return found; } return null; }
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate);
}
function button(tree, label) { return find(tree, node => node.type === 'Button' && node.props.children === label); }
function amountField(tree) { return find(tree, node => node.type === 'Input' && /pembayaran sewa|pelunasan sewa/.test(node.props['aria-label'])); }

test('entering the exact balance selects full settlement without locking further edits; lower amounts select partial', () => {
  cells = []; submitted = undefined;
  let tree = render();
  assert.equal(button(tree, 'Bayar Sebagian').props.variant, 'default');
  amountField(tree).props.onChange({ target: { value: '8.300.000' } });
  tree = render();
  assert.equal(button(tree, 'Lunasi Sekarang').props.variant, 'default');
  assert.equal(amountField(tree).props.disabled, false);
  amountField(tree).props.onChange({ target: { value: '8.000.000' } });
  tree = render();
  assert.equal(button(tree, 'Bayar Sebagian').props.variant, 'default');
  amountField(tree).props.onChange({ target: { value: '' } });
  tree = render();
  assert.equal(button(tree, 'Simpan pembayaran').props.disabled, true);
  button(tree, 'Lunasi Sekarang').props.onClick();
  tree = render();
  assert.equal(amountField(tree).props.value, '8.300.000');
  button(tree, 'Simpan pembayaran').props.onClick();
  assert.equal(submitted.input.amount, 8_300_000);
  assert.deepEqual(submitted.input.allocations, [{ invoice_id: 'invoice', amount: 8_300_000 }]);
});
test('overpayment is rejected by the form and mandatory full settlement remains locked', () => {
  cells = [];
  let tree = render();
  amountField(tree).props.onChange({ target: { value: '8.300.001' } });
  tree = render();
  assert.equal(button(tree, 'Simpan pembayaran').props.disabled, true);
  assert.equal(button(tree, 'Lunasi Sekarang').props.variant, 'outline');
  assert.equal(amountField(render({ contractSettlementMode: 'full' })).props.disabled, true);
});
