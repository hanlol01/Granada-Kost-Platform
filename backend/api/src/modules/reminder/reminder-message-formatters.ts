export type ReminderRecipientKind = 'resident' | 'parent';

type ReminderRoom = {
  category?: string | null;
  roomNumber: string;
  unitCode?: string | null;
  buildingName?: string | null;
};

export function jakartaGreeting(hour: number): string {
  if (hour >= 0 && hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function recipientSalutation(
  kind: ReminderRecipientKind,
  residentName: string,
  localHour: number,
): string {
  const greeting = jakartaGreeting(localHour);
  return kind === 'parent'
    ? `${greeting}, Bapak/Ibu Pihak Orang Tua dari penghuni atas nama ${residentName}.`
    : `${greeting}, Kak ${residentName}.`;
}

export function recipientDisplayName(
  kind: ReminderRecipientKind,
  residentName: string,
  parentName?: string | null,
): string {
  if (kind === 'resident') return residentName;
  return parentName?.trim() ? `Bapak/Ibu ${parentName.trim()}` : 'Pihak Orang Tua';
}

export function formatReminderDate(value?: string | null): string {
  const normalized = value?.slice(0, 10);
  if (!normalized) return 'Tidak ditentukan';
  const date = new Date(`${normalized}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return 'Tidak ditentukan';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(date);
}

export function formatReminderRange(start?: string | null, end?: string | null): string {
  return `${formatReminderDate(start)} s.d. ${formatReminderDate(end)}`;
}

export function formatReminderAmount(value: string | number): string {
  const amount = Math.max(0, Math.round(Number(value)));
  if (!Number.isFinite(amount) || amount === 0) return 'Rp.0';
  return `Rp.${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount)},-`;
}

function categoryLabel(category?: string | null): string | null {
  if (category === 'rukost') return 'Rumah Kost';
  if (category === 'apartkost') return 'Apart Kost';
  if (category?.trim()) return category.trim();
  return null;
}

function unitLabel(unitCode?: string | null, buildingName?: string | null): string | null {
  const explicitUnit = unitCode?.trim().replace(/^(RK|AK)-/i, '');
  if (explicitUnit) return explicitUnit;
  const fromBuilding = buildingName?.match(/\bunit\s+(.+)$/i)?.[1]?.trim();
  return fromBuilding || null;
}

function roomLabel(roomNumber: string): string | null {
  const normalized = roomNumber.trim();
  const part = normalized.match(/-([^-/]+)$/)?.[1]?.trim();
  return part || null;
}

/** Formats only persisted room/building facts; it never invents an inventory label in the client. */
export function formatReminderRoom(input: ReminderRoom): string {
  const code = input.roomNumber.trim() || '-';
  const category = categoryLabel(input.category);
  const unit = unitLabel(input.unitCode, input.buildingName);
  const room = roomLabel(code);
  if (!category || !unit || !room) return code;
  return `${category} · Kamar No.${room}, Unit ${unit} / ${code}`;
}

export function propertyReminderName(propertyName: string): string {
  return /\bkostation\b/i.test(propertyName)
    ? propertyName
    : `${propertyName} by KOSTATION`;
}
