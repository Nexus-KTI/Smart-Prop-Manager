"use client";

import { X } from "lucide-react";

/** Always mounted so the overlay can fade; only interactive while the drawer is open. */
export function SidebarBackdrop({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="sidebar-backdrop"
      data-open={open ? "true" : "false"}
      aria-hidden="true"
      onClick={open ? onClose : undefined}
    />
  );
}

/** Phone drawer only (hidden by CSS on wider screens). */
export function SidebarCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      className="sidebar-close"
      onClick={onClose}
      aria-label="Close menu"
    >
      <X size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
