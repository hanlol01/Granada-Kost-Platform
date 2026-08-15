export type RoomDetailMoney = number | null;

export type AdminRoomDetailProjection = {
  id: string;
  property_id: string;
  number: string;
  room_code: string | null;
  building: {
    id: string;
    code: string;
    name: string;
  };
  category: {
    id: string;
    code: 'rukost' | 'apartkost';
    name: string;
  };
  physical: {
    unit_code: string | null;
    floor_code: 'A' | 'B';
    floor_label: string;
    size_label: string | null;
    primary_photo_file_id: string | null;
    gender_policy: 'male' | 'female';
    status: string;
    public_visible: boolean;
    notes: string | null;
    structural_edit_locked: boolean;
  };
  commercial: {
    source: 'current_category';
    monthly_price: number;
    annual_contract_value: number;
    minimum_dp_amount: number;
    minimum_dp_label: string;
    security_deposit_required: number;
    payment_plan_description: string;
    facilities: Array<{ id: string; name: string }>;
  };
  resident: {
    id: string;
    display_name: string;
    account_status: string;
    university: string | null;
    occupancy_start: string;
  } | null;
  lease: {
    id: string;
    code: string;
    status: string;
    start_date: string;
    end_date: string | null;
    duration_months: number;
    payment_plan: string;
    occupancy_start: string | null;
    occupancy_end: string | null;
    occupancy_state: string | null;
  } | null;
  reconciliation: {
    state: 'normal' | 'lease_reconciliation_required';
    messages: string[];
  };
  billing: {
    contract_value: RoomDetailMoney;
    verified_invoice_allocated: number;
    unpaid_amount: number;
    next_due_date: string | null;
    next_due_period: string | null;
    minimum_dp_amount: number;
    dp_verified_amount: null;
    dp_progress_label: string;
    security_deposit_required: number;
    deposit_held: number;
    deposit_refunded: number;
    deposit_deducted: number;
    awaiting_confirmation_amount: number;
  };
  vehicles: Array<{
    code: string;
    plate_number: string;
    vehicle_type: string;
    parking_state: string | null;
  }>;
  complaints: Array<{
    code: string;
    category: string;
    status: string;
    priority: string;
    work_order_code: string | null;
    work_order_status: string | null;
    technician_name: string | null;
  }>;
  ownership: {
    owner_profile_id: string | null;
    display_name: string;
    source: 'building_assignment' | 'room_assignment' | 'kostation_default';
    assignment_kind: 'building' | 'room' | null;
    effective_from: string | null;
    effective_until: string | null;
    assignment_status: 'active' | null;
  };
  timeline: Array<{
    event_type: string;
    label: string;
    occurred_at: string;
  }>;
  links: {
    resident: string | null;
    lease: string | null;
    billing: null;
    vehicles: null;
    complaints: null;
  };
  updated_at: string;
};
