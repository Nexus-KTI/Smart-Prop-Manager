import { TenancyDossierClient } from "@/components/TenancyDossierClient";

type Props = {
  params: Promise<{ id: string; unitId: string }>;
};

export default async function UnitTenancyPage({ params }: Props) {
  const { id, unitId } = await params;
  return (
    <TenancyDossierClient
      unitId={unitId}
      propertyId={id}
      paymentsHref={`/payments/${unitId}`}
    />
  );
}
