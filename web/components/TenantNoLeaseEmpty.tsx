"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { supportWhatsAppUrl } from "@/lib/brand";

/**
 * TenantCloud-style empty lease: identity + faded product preview + one clear CTA.
 */
export function TenantNoLeaseEmpty({
  title = "No lease",
  profileName,
  profileEmail,
  showModuleChrome = false,
  moduleTitle,
}: {
  title?: string;
  profileName?: string;
  profileEmail?: string | null;
  /** When used inside a module page (gate), show page title above. */
  showModuleChrome?: boolean;
  moduleTitle?: string;
}) {
  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const initial = (profileName || profileEmail || "T").slice(0, 1).toUpperCase();

  useEffect(() => {
    setSupportUrl(supportWhatsAppUrl());
  }, []);

  return (
    <section className="dashboard tenant-no-lease">
      {showModuleChrome && moduleTitle ? (
        <h1 className="page-title">{moduleTitle}</h1>
      ) : null}

      <div className="tenant-no-lease-layout">
        {profileName || profileEmail ? (
          <aside className="tenant-no-lease-identity">
            <span
              className="tenant-profile-avatar tenant-profile-avatar-lg"
              aria-hidden
            >
              {initial}
            </span>
            <p className="tenant-profile-name">{profileName || "Tenant"}</p>
            {profileEmail ? (
              <p className="table-muted">{profileEmail}</p>
            ) : null}
          </aside>
        ) : null}

        <div className="tenant-no-lease-main">
          <div className="tenant-no-lease-preview" aria-hidden="true">
            <div className="tenant-no-lease-preview-stack">
              <div className="tenant-no-lease-preview-card">
                <span className="table-muted">Unit</span>
                <span className="mono-data">-</span>
              </div>
              <div className="tenant-no-lease-preview-card">
                <span className="table-muted">Rent due</span>
                <span className="mono-data">₦ -</span>
              </div>
              <div className="tenant-no-lease-preview-table">
                <div className="tenant-no-lease-preview-row">
                  <span>Receipt</span>
                  <span className="tenant-no-lease-badge" data-tone="ok">
                    Paid
                  </span>
                </div>
                <div className="tenant-no-lease-preview-row">
                  <span>Request</span>
                  <span className="tenant-no-lease-badge" data-tone="wait">
                    Open
                  </span>
                </div>
              </div>
            </div>
          </div>

          <h2 className="tenant-no-lease-title">{title}</h2>
          <p className="page-subtitle tenant-no-lease-lede">
            Your landlord still hasn’t shared a unit with you. Ask them to send
            a Nexora invite, then claim it here.
            {supportUrl ? (
              <>
                {" "}
                Or{" "}
                <a href={supportUrl} target="_blank" rel="noreferrer">
                  contact support
                </a>
                .
              </>
            ) : null}
          </p>

          <div className="dashboard-header-actions">
            <Link href="/tenant/claim" className="btn-primary">
              Claim invite
            </Link>
            <Link href="/tenant" className="btn-secondary">
              Home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
