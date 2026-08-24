import { notFound } from "next/navigation";

import { ExplorerChrome } from "./_components/ExplorerChrome";
import "./os-explorer.css";

function designModeEnabled() {
  const v = process.env.NEXT_PUBLIC_DESIGN_MODE;
  return v === "true" || v === "1";
}

export default function OsExplorerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!designModeEnabled()) {
    notFound();
  }

  return <ExplorerChrome>{children}</ExplorerChrome>;
}
