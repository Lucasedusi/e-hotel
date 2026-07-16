import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import {
  getCurrentHotelAccess,
  requireAuthenticatedProfile,
} from "@/lib/auth/access";

export default async function OnboardingPage() {
  const profile = await requireAuthenticatedProfile();

  const access = await getCurrentHotelAccess();
  if (access) redirect("/dashboard");

  return <OnboardingForm userName={profile.name} userEmail={profile.email} />;
}
