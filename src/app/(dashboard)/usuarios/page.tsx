import { ModulePlaceholder } from "@/components/layout/ModulePlaceholder";
import { requireHotelAccess } from "@/lib/auth/access";

export default async function UsersPage() {
  await requireHotelAccess(["owner", "admin"]);

  return (
    <ModulePlaceholder
      badge="Administração"
      title="Usuários"
      description="Aqui ficará a gestão de usuários, perfis de acesso, status ativo/inativo e permissões administrativas."
    />
  );
}
