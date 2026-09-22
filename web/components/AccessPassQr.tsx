"use client";

import { QRCodeSVG } from "qrcode.react";

/** Same pass as the 6-digit code — estate staff can scan from the guest phone. */
export function AccessPassQr({
  code,
  passId,
  size = 132,
}: {
  code: string;
  passId?: string;
  size?: number;
}) {
  const value = passId
    ? `nexora-pass:${passId}:${code}`
    : `nexora-pass:${code}`;
  return (
    <div className="access-pass-qr" aria-label={`QR for gate code ${code}`}>
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        marginSize={1}
        bgColor="var(--surface)"
        fgColor="var(--ink)"
      />
    </div>
  );
}
