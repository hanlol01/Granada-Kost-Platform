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
  dateOfBirth: Date | null;
  placeOfBirth: string | null;
  address: string | null;
  university: string | null;
  faculty: string | null;
  major: string | null;
  cohort: string | null;
  instagram: string | null;
  parentName: string | null;
  parentPhone: string | null;
  maritalStatus: string | null;
  emergencyPhone: string | null;
  ktpFileId: string | null;
  profilePhotoFileId: string | null;
  gender: ResidentGender | null;
  residentStatus: ResidentStatus;
  accountStatus: 'active' | 'inactive' | 'suspended' | 'not_provisioned';
  roomNumber: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  leaseAuthorityCount: number;
  emergencyContacts: EmergencyContactRecord[];
  createdAt: Date;
  updatedAt: Date;
};
