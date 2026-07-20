import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { requireHotelAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access = await requireHotelAccess();

  return <DashboardLayout access={access}>{children}</DashboardLayout>;
}
