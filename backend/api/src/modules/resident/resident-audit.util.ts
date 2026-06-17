import { ResidentRecord } from './types/resident.types';

export function sanitizeResidentForAudit(resident: ResidentRecord | null): unknown {
  if (!resident) {
    return null;
  }

  return {
    ...resident,
    phone: maskMiddle(resident.phone),
    email: maskEmail(resident.email),
    ktpNumber: maskMiddle(resident.ktpNumber),
    emergencyContacts: resident.emergencyContacts.map((contact) => ({
      ...contact,
      phone: maskMiddle(contact.phone),
    })),
  };
}

function maskMiddle(value: string | null): string | null {
  if (!value) {
    return value;
  }
  if (value.length <= 4) {
    return '****';
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function maskEmail(value: string | null): string | null {
  if (!value) {
    return value;
  }
  const [local, domain] = value.split('@');
  return domain ? `${local.slice(0, 2)}***@${domain}` : maskMiddle(value);
}
