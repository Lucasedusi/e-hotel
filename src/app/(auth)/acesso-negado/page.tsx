import { AccessStatus } from "@/components/auth/AccessStatus";

export default function AccessDeniedPage() {
  return (
    <AccessStatus
      kind="denied"
      title="Você não tem permissão para acessar esta área"
      description="Seu usuário está inativo, o vínculo com o hotel foi removido ou seu perfil não possui a permissão necessária. Procure um proprietário ou administrador."
      showDashboardLink
    />
  );
}
