/** Human labels for machine enums shown in product UI. */

function titleFromSnake(value: string): string {
  return value
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function labelOrTitle(
  map: Record<string, string>,
  value: string | null | undefined,
  fallback = "-",
): string {
  const key = (value || "").trim();
  if (!key) return fallback;
  return map[key] || titleFromSnake(key);
}

export const TENANCY_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_verification: "Pending verification",
  active: "Active",
  ended: "Ended",
};

export function tenancyStatusLabel(status: string | null | undefined): string {
  return labelOrTitle(TENANCY_STATUS_LABELS, status);
}

export function tenancyStatusTone(status: string | null | undefined): string {
  switch ((status || "").trim()) {
    case "active":
      return "paid";
    case "pending_verification":
    case "draft":
      return "pending";
    case "ended":
      return "failed";
    default:
      return "pending";
  }
}

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const STAFF_ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  caretaker: "Caretaker",
};

export const STAFF_STATUS_LABELS: Record<string, string> = {
  invited: "Invited",
  active: "Active",
  revoked: "Revoked",
  pending: "Pending",
};

export const ACCESS_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
  used: "Used",
};

export const ACCESS_SUBJECT_LABELS: Record<string, string> = {
  tenant: "Tenant",
  guest: "Guest",
  artisan: "Artisan",
  staff: "Staff",
  visitor: "Visitor",
};

export const REMINDER_STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  failed: "Failed",
  skipped: "Skipped",
  queued: "Queued",
  pending: "Pending",
};

export const CHANNEL_LABELS: Record<string, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "Email",
  transfer: "Transfer",
  cash: "Cash",
  paystack: "Paystack",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  pending: "Pending",
  failed: "Failed",
  overdue: "Overdue",
};

export const MESSAGE_RECEIPT_LABELS: Record<string, string> = {
  sent: "Sent",
  read: "Read",
};

export function messageReceiptLabel(
  createdAt: string | null | undefined,
  peerLastReadAt: string | null | undefined,
): string {
  if (
    peerLastReadAt &&
    createdAt &&
    String(peerLastReadAt) >= String(createdAt)
  ) {
    return MESSAGE_RECEIPT_LABELS.read;
  }
  return MESSAGE_RECEIPT_LABELS.sent;
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const ARTISAN_STATUS_LABELS: Record<string, string> = {
  invited: "Invited",
  active: "Active",
  revoked: "Revoked",
  pending: "Pending",
};

export const FEE_STATUS_LABELS: Record<string, string> = {
  due: "Due",
  paid: "Paid",
  waived: "Waived",
  canceled: "Canceled",
  cancelled: "Canceled",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  done: "Done",
  cancelled: "Cancelled",
  canceled: "Canceled",
};

export const TASK_AUDIENCE_LABELS: Record<string, string> = {
  landlord: "Landlord",
  tenant: "Tenant",
  staff: "Staff",
  artisan: "Artisan",
};

export const CALENDAR_KIND_LABELS: Record<string, string> = {
  fee: "Fee",
  task: "Task",
  renewal: "Renewal",
  rent: "Rent",
};

export const MAINTENANCE_STATUS_LABELS: Record<string, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
  canceled: "Canceled",
  cancelled: "Canceled",
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  invited: "Invited",
  closed: "Closed",
};

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  rental: "Rental",
  estate: "Estate",
};
