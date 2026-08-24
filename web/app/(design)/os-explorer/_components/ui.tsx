import Link from "next/link";

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "paid" ||
    normalized === "sent" ||
    normalized === "done" ||
    normalized === "active" ||
    normalized === "uploaded"
      ? "paid"
      : normalized === "overdue" ||
          normalized === "failed" ||
          normalized === "missing" ||
          normalized === "expired"
        ? "overdue"
        : "pending";
  return <span className={`status-badge ${tone}`}>{status}</span>;
}

export { Link };
