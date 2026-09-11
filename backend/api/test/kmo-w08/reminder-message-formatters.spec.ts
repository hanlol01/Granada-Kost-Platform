import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatReminderAmount,
  formatReminderRange,
  formatReminderRoom,
  recipientSalutation,
} from '../../src/modules/reminder/reminder-message-formatters';

test('reminder messages use Jakarta greetings and the agreed Indonesian payment format', () => {
  assert.equal(recipientSalutation('resident', 'Farhans', 1), 'Selamat pagi, Kak Farhans.');
  assert.equal(
    recipientSalutation('parent', 'Farhans', 19),
    'Selamat malam, Bapak/Ibu Pihak Orang Tua dari penghuni atas nama Farhans.',
  );
  assert.equal(formatReminderAmount(0), 'Rp.0');
  assert.equal(formatReminderAmount(1_200_000), 'Rp.1.200.000,-');
  assert.equal(formatReminderRange('2026-07-31', '2027-07-30'), '31 Juli 2026 s.d. 30 Juli 2027');
});

test('reminder room copy uses stored room and unit facts', () => {
  assert.equal(
    formatReminderRoom({ category: 'rukost', roomNumber: 'RK-01-11', unitCode: 'RK-01' }),
    'Rumah Kost · Kamar No.11, Unit 01 / RK-01-11',
  );
});
