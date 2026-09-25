export type ChargeType = "rent" | "service_charge" | "other";

export type Transaction = {
  id: string;
  unit_id: string;
  amount: number | string;
  status: "pending" | "paid" | "overdue" | "failed";
  method?: "paystack" | "manual" | null;
  paid_at?: string | null;
  receipt_url?: string | null;
  payment_reference?: string | null;
  charge_type?: ChargeType | null;
  charge_label?: string | null;
  created_at?: string | null;
};

/** Paid transaction enriched for the portfolio money-in feed. */
export type PortfolioPayment = Transaction & {
  property_name?: string | null;
  unit_label?: string | null;
  tenant_name?: string | null;
};

export type Reminder = {
  id: string;
  unit_id: string;
  channel: "whatsapp" | "sms" | "email";
  kind?: "due" | "receipt" | "landlord_payment" | "renewal";
  status: "sent" | "failed" | "skipped";
  sent_at?: string | null;
  /** Failure/skip reason for UI (muted copy + Retry). */
  error_detail?: string | null;
};

export type Unit = {
  id: string;
  property_id: string;
  label: string;
  rent_amount: number | string;
  frequency: "daily" | "weekly" | "monthly" | "annual";
  tenant_name?: string | null;
  tenant_contact?: string | null;
  due_day?: number | null;
  /** 1–12; used with due_day when frequency is annual. */
  due_month?: number | null;
  service_charge_amount?: number | string | null;
  /** ISO date (YYYY-MM-DD) term end / renewal. */
  term_end?: string | null;
  photo_url?: string | null;
  apply_note?: string | null;
  created_at?: string | null;
  transactions?: Transaction[];
};

export type Property = {
  id: string;
  owner_id: string;
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  type: "rental" | "estate";
  created_at?: string | null;
  units?: Unit[];
};

/** Flat unit row from GET /properties/portfolio/units. */
export type PortfolioUnit = {
  unit: Unit;
  property_id: string;
  property_name: string;
};

export type UnitStatus = "PAID" | "OVERDUE" | "DUE SOON" | "PENDING";

/** Per charge-line status on the unit payments view (includes DUE SOON). */
export type ChargeLineStatus = "PAID" | "OVERDUE" | "DUE SOON" | "PENDING";

export type DashboardRow = {
  /** Absent when the row is a property with zero units (Add unit CTA). */
  unitId?: string | null;
  propertyId?: string;
  unit: string;
  unitLabel?: string;
  propertyName?: string;
  tenant: string;
  tenantContact?: string | null;
  rent: number;
  /** Recurring service charge when set on the unit; 0 when not used. */
  serviceCharge?: number;
  dueDate: Date | null;
  status: UnitStatus;
  /** Property exists but has no units, show Add unit CTA instead of payment status. */
  needsUnit?: boolean;
};

export type DashboardStats = {
  totalCollected: number;
  outstanding: number;
  unitsOverdue: number;
};
