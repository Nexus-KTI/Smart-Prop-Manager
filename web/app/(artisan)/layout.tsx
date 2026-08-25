import { ArtisanShell } from "@/components/ArtisanShell";

export default function ArtisanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ArtisanShell>{children}</ArtisanShell>;
}
