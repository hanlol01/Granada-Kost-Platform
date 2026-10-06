// Opt-in, loopback-only regression proof. Executes real read projections and
// payment eligibility SQL without saving payments or changing the database.
require('../lease-revision/register-typescript.cjs');
require('dotenv').config({ path: require('node:path').resolve('.env'), quiet: true });
const assert = require('node:assert/strict');
const test = require('node:test');
const { Pool } = require('pg');
const { W06BillingService } = require('../../src/modules/billing/services/w06-billing.service.ts');

test('corrected rent agrees across documents, cash received and full-payment eligibility', {
  skip: process.env.KOSTATION_CORRECTED_BILLING_READ !== '1',
}, async t => {
  const config = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'granada_kost',
  };
  const host = config.connectionString ? new URL(config.connectionString).hostname : config.host;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(host), 'Local database only');
  const pool = new Pool({ ...config, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const database = { client };
    const service = new W06BillingService(database, { assertCanReadProperty: async () => {} }, {});
    const { rows: samples } = await client.query(`SELECT invoice.id,invoice.property_id,invoice.lease_id,
      invoice.invoice_code,invoice.authority_source,invoice.total_amount,invoice.credit_amount,
      lease.contract_rent_amount,
      COALESCE((SELECT sum(credit.amount) FROM lease_data_correction_invoice_credits credit
        WHERE credit.invoice_id=invoice.id AND credit.property_id=invoice.property_id),0) AS correction_credit_amount
      FROM invoices invoice JOIN leases lease ON lease.id=invoice.lease_id AND lease.property_id=invoice.property_id
      WHERE invoice.invoice_code IN ('INV-055-09/SEWA-KOST/GSH1/2026','INV-084-09/SEWA-KOST/GSH1/2026')
        OR (invoice.snapshot_resident_name ILIKE 'Wima%' AND invoice.invoice_purpose='rent'
          AND lease.lease_status IN ('active','awaiting_activation'))`);
    assert.ok(samples.length, 'A reported invoice fixture must exist');
    for (const sample of samples) {
      const row = (await client.query(`${service.invoiceDocumentSql()}
        WHERE invoice.id=$1 AND invoice.property_id=$2`, [sample.id, sample.property_id])).rows[0];
      const lease = (await client.query(`${service.leaseTupleSql()} WHERE l.id=$1 AND l.property_id=$2`,
        [sample.lease_id, sample.property_id])).rows[0];
      const billing = await service.projectResidentBilling(client, lease, 'admin');
      const settlement = billing.contract_settlement;
      assert.ok(settlement, 'Contract settlement required');
      console.log(sample.invoice_code, JSON.stringify({ contract: Number(sample.contract_rent_amount),
        invoice: Number(row.total_amount), documentReceived: Number(row.cumulative_rent_paid),
        received: settlement.initial_rent_credit + settlement.payment_allocated,
        documentRemaining: Number(row.outstanding_amount), remaining: settlement.outstanding_amount }));

      await t.test(`${sample.invoice_code}: document cash and remaining`, () => {
        assert.equal(Number(row.cumulative_rent_paid), settlement.initial_rent_credit + settlement.payment_allocated,
          'Correction credit is not a payment received');
        assert.equal(Number(row.outstanding_amount), settlement.outstanding_amount,
          'Invoice and resident use the same current remaining rent');
      });
      await t.test(`${sample.invoice_code}: document search`, async () => {
        const result = await service.searchDocuments({}, { property_id: sample.property_id, q: sample.invoice_code });
        const document = result.data.find(item => item.id === sample.id);
        assert.equal(document.amount, Number(sample.total_amount) - Number(sample.correction_credit_amount),
          'Search shows the effective invoice after credits, not its superseded face value');
      });
      await t.test(`${sample.invoice_code}: full payment eligibility`, async () => {
        // Remove only row locks: the real eligibility SELECT runs in a read-only transaction.
        const readClient = { query: (sql, params) => client.query(sql.replace(/FOR UPDATE OF settlement,authority_invoice/g, ''), params) };
        assert.equal(await service.assertContractSettlementPaymentEligibility(readClient, lease, 'rent',
          [{ invoice_id: sample.id, amount: settlement.outstanding_amount }],
          [{ ...sample, authority_source: 'contract_schedule' }]), true);
        await assert.rejects(service.assertContractSettlementPaymentEligibility(readClient, lease, 'rent',
          [{ invoice_id: sample.id, amount: settlement.outstanding_amount + 1 }],
          [{ ...sample, authority_source: 'contract_schedule' }]),
          error => error.getResponse().code === 'CONTRACT_SETTLEMENT_AMOUNT_EXCEEDS_BALANCE');
      });
      await t.test(`${sample.invoice_code}: current receipt totals`, async () => {
        const receipt = (await client.query(`SELECT receipt.id FROM payment_receipts receipt
          JOIN payments payment ON payment.id=receipt.payment_id AND payment.property_id=receipt.property_id
          WHERE payment.lease_id=$1 AND payment.property_id=$2 AND receipt.receipt_kind='payment' LIMIT 1`,
          [sample.lease_id, sample.property_id])).rows[0];
        assert.ok(receipt, 'A real rent receipt must exist');
        const current = await service.currentReceiptSettlementAuthority(sample.property_id, receipt.id);
        assert.equal(Number(current.total_rent_received), settlement.initial_rent_credit + settlement.payment_allocated);
        assert.equal(Number(current.remaining_rent_amount), settlement.outstanding_amount);
      });
      await t.test(`${sample.invoice_code}: invoice PDF paid amount`, async () => {
        const pdf = await service.invoiceDocument({}, sample.property_id, sample.id);
        const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const parsed = await getDocument({ data: new Uint8Array(pdf.content) }).promise;
        let text = '';
        for (let page = 1; page <= parsed.numPages; page++) {
          const content = await (await parsed.getPage(page)).getTextContent();
          text += content.items.map(item => 'str' in item ? item.str : '').join(' ');
        }
        const paid = new Intl.NumberFormat('id-ID').format(settlement.initial_rent_credit + settlement.payment_allocated);
        assert.match(text, new RegExp(`Sudah dibayarkan\\s*:\\s*Rp\\. ${paid.replaceAll('.', '\\.')}\\s*,-`),
          'PDF shows money received, not correction credit');
      });
    }
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
