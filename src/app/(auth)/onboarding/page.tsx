import { redirect } from "next/navigation";
import { AccessStatus } from "@/components/auth/AccessStatus";

import {
  getCurrentHotelAccess,
  requireAuthenticatedProfile,
} from "@/lib/auth/access";

export default async function OnboardingPage() {
  await requireAuthenticatedProfile();

  const access = await getCurrentHotelAccess();
  if (access) redirect("/dashboard");

  return (
    <AccessStatus
      kind="onboarding"
      title="Seu acesso foi autenticado"
      description="Este usuário ainda não possui um hotel vinculado. A criação da primeira organização e do primeiro hotel será realizada na próxima fase, usando a RPC bootstrap_organization."
    />
  );
}
