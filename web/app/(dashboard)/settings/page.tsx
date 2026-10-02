import { SettingsPanel } from "@/components/SettingsPanel";
import type { SettingsTabId } from "@/components/settings/AccountSettingsChrome";

const TAB_IDS: readonly SettingsTabId[] = [
  "profile",
  "notifications",
  "cards",
  "security",
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { tab } = await searchParams;
  const requested = Array.isArray(tab) ? tab[0] : tab;
  const initialTab = TAB_IDS.find((id) => id === requested);
  return <SettingsPanel initialTab={initialTab} />;
}
