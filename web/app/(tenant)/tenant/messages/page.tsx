import { MessagesHubClient } from "@/components/MessagesHubClient";

export default function TenantMessagesPage() {
  return <MessagesHubClient audience="tenant" />;
}
