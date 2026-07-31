import { ResidentRecord } from './types/resident.types';

export function sanitizeResidentForAudit(resident: ResidentRecord | null): unknown {
  if (!resident) {
    return null;
  }

  return {
    id: resident.id,
    propertyId: resident.propertyId,
    userId: resident.userId,
    fullName: resident.fullName,
    phone: maskMiddle(resident.phone),
    email: maskEmail(resident.email),
    ktpNumber: maskMiddle(resident.ktpNumber),
    gender: resident.gender,
    residentStatus: resident.residentStatus,
    accountStatus: resident.accountStatus,
    university: resident.university,
    faculty: resident.faculty,
    major: resident.major,
    cohort: resident.cohort,
    emergencyContacts: resident.emergencyContacts.map((contact) => ({
      id: contact.id,
      contactName: contact.contactName,
      relationship: contact.relationship,
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
