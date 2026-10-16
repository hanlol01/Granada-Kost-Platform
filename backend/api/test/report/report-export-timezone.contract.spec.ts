import assert from 'node:assert/strict';
import test from 'node:test';
import { reportToXlsx } from '../../src/modules/report/report-export.util';

void test('owner realization exports render check-in timestamps in Asia/Jakarta', () => {
  const workbook = reportToXlsx({
    report_type: 'property-owners',
    title: 'Realisasi Owner Test',
    property_name: 'KOSTATION',
    period: { date_from: '2026-08-01', date_to: '2026-08-31' },
    generated_at: '2026-10-17T00:00:00.000Z',
    filter_checksum: 'test',
    methodology: 'test',
    summary: {},
    rows: [
      {
        room: 'AK-18/16-04',
        resident: 'Dhafin Razaqa Rashif',
        owner: 'Test Owner',
        plot_number: '',
        duration_months: 1,
        rate_type: 'standard',
        money_received: 1,
        contract_total: 1,
        outstanding: 0,
        management_fee: 0,
        net_realization: 1,
        paid_in_full_at: '',
        realization_status: 'realized',
        line_status: 'active',
        check_in: '2026-07-31T17:00:00.000Z',
        check_out: '',
      },
    ],
    meta: { limit: 1, offset: 0, total: 1 },
  }).toString('utf8');

  assert.match(workbook, /1 Agustus 2026/);
  assert.doesNotMatch(workbook, /31 Juli 2026/);
});
