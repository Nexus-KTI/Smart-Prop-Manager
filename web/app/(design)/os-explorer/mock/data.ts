export type UnitStatus = "PAID" | "OVERDUE" | "DUE SOON" | "PENDING";

export const mockPortfolio = {
  properties: [
    {
      id: "prop-1",
      name: "12 Adeniran Ogunsanya",
      units: [
        {
          id: "unit-1a",
          label: "Flat 1A",
          tenant: "Chioma Okeke",
          phone: "+234 801 000 1111",
          rent: 850_000,
          dueDay: 1,
          status: "OVERDUE" as UnitStatus,
        },
        {
          id: "unit-1b",
          label: "Flat 1B",
          tenant: "Ibrahim Musa",
          phone: "+234 802 000 2222",
          rent: 900_000,
          dueDay: 5,
          status: "PAID" as UnitStatus,
        },
        {
          id: "unit-1c",
          label: "Flat 1C",
          tenant: "-",
          phone: "",
          rent: 750_000,
          dueDay: 1,
          status: "PENDING" as UnitStatus,
        },
      ],
    },
    {
      id: "prop-2",
      name: "Lekki Phase 1 annex",
      units: [] as {
        id: string;
        label: string;
        tenant: string;
        phone: string;
        rent: number;
        dueDay: number;
        status: UnitStatus;
      }[],
    },
  ],
};

/** Flat unit rows for portfolio / payments who-owes wireframes. */
export function mockUnitRows() {
  return mockPortfolio.properties.flatMap((p) =>
    p.units.length === 0
      ? [
          {
            id: `${p.id}-empty`,
            propertyId: p.id,
            property: p.name,
            label: p.name,
            tenant: "-",
            rent: 0,
            status: "PENDING" as UnitStatus,
            needsUnit: true,
            vacant: true,
          },
        ]
      : p.units.map((u) => ({
          id: u.id,
          propertyId: p.id,
          property: p.name,
          label: u.label,
          tenant: u.tenant,
          rent: u.rent,
          status: u.status,
          needsUnit: false,
          vacant: !u.tenant || u.tenant === "-",
        })),
  );
}

export const mockPayments = [
  {
    id: "pay-1",
    unit: "Flat 1B",
    amount: 900_000,
    method: "Transfer (manual)",
    status: "PAID",
    date: "2026-08-05",
  },
  {
    id: "pay-2",
    unit: "Flat 1A",
    amount: 850_000,
    method: "Paystack",
    status: "PENDING",
    date: "2026-08-01",
  },
];

/** Active leases for Tenancies wireframe (Ending soon = within 60d). */
export const mockTenancies = [
  {
    id: "ten-1",
    property: "12 Adeniran Ogunsanya",
    unit: "Flat 1A",
    tenant: "Chioma Okeke",
    status: "active" as const,
    termEnd: "2026-10-15",
    endingSoon: true,
  },
  {
    id: "ten-2",
    property: "12 Adeniran Ogunsanya",
    unit: "Flat 1B",
    tenant: "Ibrahim Musa",
    status: "active" as const,
    termEnd: "2027-03-01",
    endingSoon: false,
  },
];

/** Empty by default so Expenses empty state matches Ada smoke. */
export const mockExpenses: {
  id: string;
  category: string;
  amount: number;
  paidOn: string;
  vendor: string;
}[] = [];

export const mockHelpTips = [
  {
    id: "leases",
    title: "Where are my leases?",
    body: "Tenancies lists every occupancy. Filter Ending soon for renewals.",
    href: "/os-explorer/phase-1/tenancies",
  },
  {
    id: "chase",
    title: "How do I chase overdue rent?",
    body: "Open Reminders (after Payments) to message tenants who owe.",
    href: "/os-explorer/phase-1/reminders",
  },
  {
    id: "expenses",
    title: "Where do I log money out?",
    body: "Expenses records repairs and costs. Money in stays on Payments.",
    href: "/os-explorer/phase-1/expenses",
  },
  {
    id: "reports",
    title: "Where is my rent roll?",
    body: "Reports shows occupied vs vacant, rent, and month expenses.",
    href: "/os-explorer/phase-1/reports",
  },
];

/** Mock signed-in landlord for explorer chrome (not real auth). */
export const mockSessionUser = {
  name: "Ada Okafor",
  email: "ada@example.com",
  role: "Landlord",
  initials: "AO",
};

export const mockReminders = [
  {
    id: "rem-1",
    unit: "Flat 1A",
    channel: "WhatsApp",
    status: "failed",
    detail: "Provider timeout, message not delivered",
    at: "2026-08-10 09:14",
  },
  {
    id: "rem-2",
    unit: "Flat 1B",
    channel: "SMS",
    status: "sent",
    detail: "",
    at: "2026-08-04 08:00",
  },
];

export const mockCharges = [
  {
    id: "ch-rent",
    type: "Rent",
    amount: 850_000,
    status: "OVERDUE" as UnitStatus,
    due: "2026-08-01",
  },
  {
    id: "ch-sc",
    type: "Service charge",
    amount: 45_000,
    status: "OVERDUE" as UnitStatus,
    due: "2026-08-01",
  },
  {
    id: "ch-key",
    type: "Access fob (one-off)",
    amount: 15_000,
    status: "PAID" as UnitStatus,
    due: "2026-07-12",
  },
];

export const mockRenewals = [
  {
    id: "ren-1",
    unit: "Flat 1A · 12 Adeniran",
    termEnd: "2026-10-01",
    daysLeft: 40,
  },
  {
    id: "ren-2",
    unit: "Flat 2C · Yaba Court",
    termEnd: "2026-09-15",
    daysLeft: 24,
  },
];

export const mockDocs = [
  { id: "doc-1", name: "National ID (Chioma)", status: "uploaded" },
  { id: "doc-2", name: "Tenancy agreement", status: "uploaded" },
  { id: "doc-3", name: "Guarantor letter", status: "missing" },
];

export const mockVerification = [
  { id: "v1", label: "ID collected", done: true },
  { id: "v2", label: "Agreement signed", done: true },
  { id: "v3", label: "References checked", done: false },
  {
    id: "v4",
    label: "Background check (optional)",
    done: false,
    note: "External check when you use one, mock only",
  },
];

export const mockTenant = {
  name: "Chioma Okeke",
  unit: "Flat 1A · 12 Adeniran Ogunsanya",
  balanceDue: 895_000,
  currencyNote: "Rent + service charge",
};

export const mockOwners = [
  { id: "own-1", name: "Ada Okafor", units: 6 },
  { id: "own-2", name: "Bode Holdings", units: 14 },
];

export const mockTeam = [
  { id: "t1", name: "Ada Okafor", role: "Owner" },
  { id: "t2", name: "Funke Adeyemi", role: "Manager" },
  { id: "t3", name: "Chinedu Eze", role: "Caretaker" },
];

export const mockOverdueOps = [
  {
    id: "o1",
    owner: "Ada Okafor",
    unit: "Flat 1A",
    amount: 850_000,
    daysOverdue: 12,
  },
  {
    id: "o2",
    owner: "Bode Holdings",
    unit: "Shop 3",
    amount: 1_200_000,
    daysOverdue: 5,
  },
];

export const mockAccessCodes = [
  {
    id: "ac-1",
    who: "Chioma Okeke (tenant)",
    code: "482193",
    window: "Ongoing tenancy",
  },
];

export const mockInvites = [
  {
    id: "inv-1",
    who: "Guest, Amaka",
    window: "22 Aug 2026 · 14:00–18:00",
    status: "active",
  },
  {
    id: "inv-2",
    who: "Contractor, PipeFix",
    window: "18 Aug 2026 · 09:00–12:00",
    status: "expired",
  },
];

export const mockWorkOrders = [
  {
    id: "wo-1",
    unit: "Flat 1A",
    title: "Leaking kitchen tap",
    status: "open",
    artisan: "Sola Plumbing",
  },
  {
    id: "wo-2",
    unit: "Flat 1B",
    title: "AC service",
    status: "done",
    artisan: "CoolAir NG",
  },
];

export const mockArtisan = {
  name: "Sola Plumbing",
  jobs: [
    {
      id: "wo-1",
      title: "Leaking kitchen tap",
      unit: "Flat 1A · 12 Adeniran",
      window: "22 Aug · 10:00–13:00",
      accessCode: "773401",
    },
  ],
};

export function formatNaira(amount: number) {
  return `₦\u00A0${amount.toLocaleString("en-NG")}`;
}
