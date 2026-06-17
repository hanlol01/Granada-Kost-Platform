export type ResidentStatus = 'active' | 'inactive';
export type ResidentGender = 'male' | 'female' | 'other';

export type EmergencyContactRecord = {
  id: string;
  residentId: string;
  contactName: string;
  relationship: string | null;
  phone: string;
};

export type ResidentRecord = {
  id: string;
  propertyId: string;
  userId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  ktpNumber: string | null;
  gender: ResidentGender | null;
  residentStatus: ResidentStatus;
  emergencyContacts: EmergencyContactRecord[];
  createdAt: Date;
  updatedAt: Date;
};
