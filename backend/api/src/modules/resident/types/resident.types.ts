/**
 * A prepared W05 resident stays pending_activation until the separate lease
 * activation command creates occupancy. These values are read projections;
 * generic status updates remain constrained by their own DTO/authority.
 */
export type ResidentStatus = 'draft' | 'pending_activation' | 'active' | 'inactive' | 'archived';
export type ResidentGender = 'male' | 'female' | 'other';
/** Rent-only Admin projection; deposits and unverified transfers never qualify. */
export type ResidentRentPaymentStatus =
  | 'none'
  | 'pending_verification'
  | 'booking_fee'
  | 'down_payment'
  | 'initial_month_payment'
  | 'partial_payment'
  | 'paid_in_full'
  | 'reversed_refunded'
  | 'outstanding_balance';

/**
 * Server-owned operational projection of the contract-settlement timeline.
 * It deliberately complements, rather than replaces, the payment status:
 * a resident can have made a DP and still be approaching a settlement
 * checkpoint.
 */
export type ResidentContractSettlementStage =
  | 'none'
  | 'awaiting_activation'
  | 'checkpoint_one_pending'
  | 'checkpoint_one_met'
  | 'checkpoint_two_pending'
  | 'checkpoint_two_met'
  | 'final_settlement_due'
  | 'overdue'
  | 'overdue_grace'
  | 'extended'
  | 'admin_action_required'
  | 'termination_eligible'
  | 'termination_pending'
  | 'paid_in_full'
  | 'preactivation_cancelled';

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
  archiveReason: string | null;
  archiveSource: string | null;
  archivedAt: Date | null;
  archivedByUserId: string | null;
  archivedByName: string | null;
  accountStatus: 'active' | 'inactive' | 'suspended' | 'not_provisioned';
  rentPaymentStatus: ResidentRentPaymentStatus;
  contractSettlementStage: ResidentContractSettlementStage;
  contractSettlementDueDate: string | null;
  contractSettlementRemainingAmount: number;
  contractSettlementCheckpointRequiredAmount: number;
  leaseExpiredAdminActionRequired: boolean;
  roomNumber: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  leaseAuthorityCount: number;
  emergencyContacts: EmergencyContactRecord[];
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A tenancy is intentionally a separate projection from resident identity.
 * `awaiting_activation` means the commercial commitment exists, but the room
 * has not become occupied yet. It must therefore be visible to Admin without
 * being presented as an active occupancy.
 */
export type ResidentTenancyRecord = {
  residentId: string;
  propertyId: string;
  leaseId: string;
  bookingLeadId: string | null;
  leaseStatus: 'awaiting_activation' | 'active';
  activationState:
    | 'scheduled'
    | 'activation_attention_required'
    | 'awaiting_check_in'
    | 'check_in_confirmation_required'
    | 'checked_in'
    | null;
  occupancyId: string | null;
  roomStatus: string;
  activatedAt: Date | null;
  checkedInAt: Date | null;
  roomNumber: string;
  kostTypeName: string;
  buildingCode: string;
  startDate: string;
  endDate: string;
  termMonths: number;
  paymentPlanType: 'annual_full' | 'monthly_installments' | 'two_month_installments';
};
